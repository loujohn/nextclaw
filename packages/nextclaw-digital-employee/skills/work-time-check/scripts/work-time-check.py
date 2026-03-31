#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

import os
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime

BASE_URL = os.environ.get("PM_BASE_URL", "")
API_URL = os.environ.get(
    "PM_API", BASE_URL + "/admin/zenTaoTaskLog/unfilledDetail" if BASE_URL else ""
)
TIMEOUT = int(os.environ.get("PM_TIMEOUT", "600000"))
BASIC_AUTH = os.environ.get("PM_BASIC_AUTH", "Basic your_base64_here")
API_USERNAME = os.environ.get("PM_USERNAME", "admin")
API_PASSWORD = os.environ.get("PM_PASSWORD", "your_password_here")


def post_form(url, form_data, timeout):
    """发送POST表单请求"""
    data = urllib.parse.urlencode(form_data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": BASIC_AUTH,
            "Accept": "application/json",
            "User-Agent": "nextclaw-work-time-check/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout / 1000) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise Exception(f"HTTP {e.code}: {e.read().decode('utf-8')}")
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def fetch(url, token, timeout):
    """发送GET请求"""
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "nextclaw-work-time-check/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout / 1000) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise Exception(f"HTTP {e.code}: {e.read().decode('utf-8')}")
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def get_token(base_url, timeout):
    """获取Token"""
    token_url = f"{base_url}/admin/oauth2/token"
    form_data = {
        "grant_type": "password",
        "username": API_USERNAME,
        "password": API_PASSWORD,
        "login_type": "quick",
    }
    result = post_form(token_url, form_data, timeout)

    if "access_token" in result:
        return result["access_token"]
    raise Exception(f"获取Token失败: {json.dumps(result)}")


def main():
    parser = argparse.ArgumentParser(description="工时检查脚本 - 获取工时数据")
    parser.add_argument("--output", action="store_true", help="输出群通知Markdown文件")
    parser.add_argument(
        "--per-user", action="store_true", help="为每个未填写人员生成单独的通知文件"
    )
    parser.add_argument(
        "--per-leader", action="store_true", help="为每个项目负责人生成通知文件"
    )

    args = parser.parse_args()

    print(f"[工时检查] 正在请求: {API_URL}", file=sys.stderr)

    try:
        print("[工时检查] 正在获取Token...", file=sys.stderr)
        token = get_token(BASE_URL, TIMEOUT)
        print("[工时检查] Token获取成功，正在请求工时数据...", file=sys.stderr)
        data = fetch(API_URL, token, TIMEOUT)

        print("[工时检查] 获取数据成功", file=sys.stderr)

        if args.output or args.per_user or args.per_leader:
            d = data["data"]
            # 临时目录：用户主目录下的固定目录（跨平台兼容）
            # Windows: C:\Users\用户名\nextclaw-temp
            # Linux/Mac: /home/用户名/nextclaw-temp 或 /Users/用户名/nextclaw-temp
            home_dir = os.path.expanduser("~")
            temp_dir = os.path.join(home_dir, "nextclaw-temp")
            os.makedirs(temp_dir, exist_ok=True)

            print(f"[工时检查] 临时文件目录：{temp_dir}", file=sys.stderr)
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

            manifest = []
            manifest.append("# 工时通知清单")
            manifest.append(f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            manifest.append(f"已填写人数：{d['filledUsersCount']} 人")
            manifest.append(f"未填写人数：{d['unfilledUsersCount']} 人")
            manifest.append("")

            # 1. 群通知
            if args.output:
                lines = []
                lines.append("## ⏱️ 工时填写提醒")
                lines.append("")
                lines.append(
                    f"**日期**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                )
                lines.append("")
                lines.append(f"**已填写**: {d['filledUsersCount']} 人")
                lines.append(f"**未填写**: {d['unfilledUsersCount']} 人")
                lines.append("")

                # 按人员详细列出未填写情况
                if d.get("unfilledUsers"):
                    lines.append("### 未填写人员明细")
                    lines.append("")

                    for user in d["unfilledUsers"]:
                        lines.append(f"**{user['cnName']}**")
                        tasks = user.get("unfilledTasks", [])
                        if tasks:
                            for task in tasks:
                                task_names = ", ".join(task.get("tasks", []))
                                lines.append(f"- 项目：{task['projectName']}")
                                lines.append(f"  待填写任务：{task_names}")
                        else:
                            lines.append("- 可能暂无分配任务或任务未开始")
                        lines.append("")

                lines.append("---")
                lines.append("请以上人员核对并填写今日工时，如无任务请忽略，感谢配合！")

                content = "\n".join(lines)
                if len(content.encode("utf-8")) > 1800:
                    content = content[:1800] + "\n\n...（内容过长，已截断）"
                group_file = os.path.join(temp_dir, f"group_{timestamp}.md")
                with open(group_file, "w", encoding="utf-8") as f:
                    f.write(content)
                manifest.append("## 群通知")
                manifest.append(f"- 文件: {group_file}")
                manifest.append(f"- 类型: 群机器人")
                manifest.append(f"- 接收人: 全体成员")
                manifest.append("")
                print(f"[工时检查] 已生成群通知: {group_file}", file=sys.stderr)

            # 2. 个人通知
            if args.per_user:
                manifest.append(f"## 个人通知 ({len(d['unfilledUsers'])}人)")
                for user in d["unfilledUsers"]:
                    if not user.get("dingtalkId"):
                        manifest.append(f"- {user['cnName']}: 跳过（无dingtalkId）")
                        continue

                    lines = []
                    lines.append(f"## 工时填写提醒")
                    lines.append("")
                    lines.append(
                        f"**日期**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                    )
                    lines.append("")
                    lines.append(
                        f"您好 {user['cnName']}，您今日尚未填写工时，请尽快填写。"
                    )
                    lines.append("")

                    tasks = user.get("unfilledTasks", [])
                    if tasks:
                        lines.append("### 待填写任务")
                        lines.append("")
                        for task in tasks:
                            for t in task.get("tasks", []):
                                lines.append(f"- {task['projectName']} / {t}")
                    else:
                        lines.append("### 温馨提示")
                        lines.append("")
                        lines.append("请登录工时系统填写今日工时，感谢配合！")

                    lines.append("")
                    lines.append("---")
                    lines.append("请尽快填写工时，感谢配合！")

                    content = "\n".join(lines)
                    if len(content.encode("utf-8")) > 1800:
                        content = content[:1800] + "\n\n...（内容过长，已截断）"
                    dingtalk_id = user.get("dingtalkId", "unknown")
                    user_file = os.path.join(
                        temp_dir, f"user_{dingtalk_id}_{timestamp}.md"
                    )
                    with open(user_file, "w", encoding="utf-8") as f:
                        f.write(content)
                    manifest.append(
                        f"- {user['cnName']}: {user_file} (dingtalkId: {user['dingtalkId']})"
                    )
                manifest.append("")
                print(
                    f"[工时检查] 已生成 {len(d['unfilledUsers'])} 个个人通知文件",
                    file=sys.stderr,
                )

            # 3. 负责人通知
            if args.per_leader:
                leaders = {}
                for user in d["unfilledUsers"]:
                    for task in user.get("unfilledTasks", []):
                        leader_name = task.get("projectLeader") or "未指定负责人"
                        leader_id = task.get("projectLeaderDingtalkId") or "unknown"
                        if leader_name not in leaders:
                            leaders[leader_name] = {
                                "dingtalkId": leader_id,
                                "users": [],
                            }
                        leaders[leader_name]["users"].append(
                            {"name": user["cnName"], "tasks": task.get("tasks", [])}
                        )

                manifest.append(f"## 负责人通知 ({len(leaders)}人)")
                for leader_name, info in leaders.items():
                    if not info["dingtalkId"] or info["dingtalkId"] == "unknown":
                        manifest.append(f"- {leader_name}: 跳过（无dingtalkId）")
                        continue

                    lines = []
                    lines.append(f"## 工时填写提醒")
                    lines.append("")
                    lines.append(
                        f"**日期**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                    )
                    lines.append("")
                    lines.append(
                        f"您好 {leader_name}，以下成员尚未填写今日工时，请督促。"
                    )
                    lines.append("")

                    lines.append("### 未填写人员")
                    lines.append("")
                    for u in info["users"]:
                        task_list = ", ".join(u["tasks"]) if u["tasks"] else "无任务"
                        lines.append(f"- **{u['name']}**: {task_list}")

                    lines.append("")
                    lines.append("---")
                    lines.append("请督促成员尽快填写工时，感谢配合！")

                    content = "\n".join(lines)
                    if len(content.encode("utf-8")) > 1800:
                        content = content[:1800] + "\n\n...（内容过长，已截断）"
                    leader_dingtalk_id = info.get("dingtalkId", "unknown")
                    leader_file = os.path.join(
                        temp_dir, f"user_{leader_dingtalk_id}_{timestamp}.md"
                    )
                    with open(leader_file, "w", encoding="utf-8") as f:
                        f.write(content)
                    manifest.append(
                        f"- {leader_name}: {leader_file} (dingtalkId: {info['dingtalkId']})"
                    )
                manifest.append("")
                print(
                    f"[工时检查] 已生成 {len(leaders)} 个负责人通知文件",
                    file=sys.stderr,
                )

            # 生成清单文件
            manifest_file = os.path.join(temp_dir, f"notify_list_{timestamp}.txt")
            with open(manifest_file, "w", encoding="utf-8") as f:
                f.write("\n".join(manifest))
            print(f"[工时检查] 已生成通知清单: {manifest_file}", file=sys.stderr)
            print(f"[工时检查] 请查看清单确保通知完整", file=sys.stderr)
        else:
            print(json.dumps(data, ensure_ascii=False, indent=2))

    except Exception as e:
        print(f"[工时检查] 失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
