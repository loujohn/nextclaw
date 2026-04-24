"""工时填报检查技能 - 命令行交互模块

处理通知文件生成和清单输出。
"""
import json
import os
import sys

from api import query_unfilled_details
from models import (
    get_china_now,
    generate_group_notification,
    generate_user_notification,
    generate_leader_notification,
    organize_leader_data,
)
from config import Config


def handle_query():
    """查询工时数据并输出 JSON"""
    data = query_unfilled_details()
    print(json.dumps(data, ensure_ascii=False, indent=2))


def handle_output(output_group=False, per_user=False, per_leader=False):
    """生成通知文件（每次通知放入独立时间戳文件夹）"""
    print(f"[工时检查] 正在请求工时数据...", file=sys.stderr)
    data = query_unfilled_details()
    print("[工时检查] 获取数据成功", file=sys.stderr)

    d = data["data"]
    temp_base = Config.get_temp_dir()
    timestamp = get_china_now().strftime("%Y%m%d%H%M%S")

    # 创建本次通知批次文件夹
    batch_dir = os.path.join(temp_base, timestamp)
    os.makedirs(batch_dir, exist_ok=True)

    print(f"[工时检查] 临时文件目录：{temp_base}", file=sys.stderr)
    print(f"[工时检查] 本次通知批次：{batch_dir}", file=sys.stderr)

    # 生成清单
    manifest = []
    manifest.append("# 工时通知清单")
    manifest.append(f"生成时间：{get_china_now().strftime('%Y-%m-%d %H:%M:%S')}")
    manifest.append(f"已填写人数：{d['filledUsersCount']} 人")
    manifest.append(f"未填写人数：{d['unfilledUsersCount']} 人")
    manifest.append("")

    # 1. 群通知
    if output_group:
        content = generate_group_notification(data)
        group_file = os.path.join(batch_dir, f"group_{timestamp}.md")
        with open(group_file, "w", encoding="utf-8") as f:
            f.write(content)
        manifest.append("## 群通知")
        manifest.append(f"- 文件: {group_file}")
        manifest.append(f"- 类型: 群机器人")
        manifest.append(f"- 接收人: 全体成员")
        manifest.append("")
        print(f"[工时检查] 已生成群通知: {group_file}", file=sys.stderr)

    # 2. 个人通知
    if per_user:
        manifest.append(f"## 个人通知 ({len(d['unfilledUsers'])}人)")
        for user in d["unfilledUsers"]:
            if not user.get("dingtalkId"):
                manifest.append(f"- {user['cnName']}: 跳过（无dingtalkId）")
                continue

            content = generate_user_notification(user)
            dingtalk_id = user.get("dingtalkId", "unknown")
            user_file = os.path.join(batch_dir, f"user_{dingtalk_id}_{timestamp}.md")
            with open(user_file, "w", encoding="utf-8") as f:
                f.write(content)
            manifest.append(
                f"- {user['cnName']}: {user_file} (dingtalkId: {user['dingtalkId']})"
            )
        manifest.append("")
        print(f"[工时检查] 已生成 {len(d['unfilledUsers'])} 个个人通知文件", file=sys.stderr)

    # 3. 负责人通知
    if per_leader:
        leaders = organize_leader_data(d.get("unfilledUsers", []))
        manifest.append(f"## 负责人通知 ({len(leaders)}人)")

        for leader_name, info in leaders.items():
            if not info["dingtalkId"] or info["dingtalkId"] == "unknown":
                manifest.append(f"- {leader_name}: 跳过（无dingtalkId）")
                continue

            content = generate_leader_notification(leader_name, info["users"])
            leader_dingtalk_id = info.get("dingtalkId", "unknown")
            leader_file = os.path.join(batch_dir, f"user_{leader_dingtalk_id}_{timestamp}.md")
            with open(leader_file, "w", encoding="utf-8") as f:
                f.write(content)
            manifest.append(
                f"- {leader_name}: {leader_file} (dingtalkId: {info['dingtalkId']})"
            )
        manifest.append("")
        print(f"[工时检查] 已生成 {len(leaders)} 个负责人通知文件", file=sys.stderr)

    # 生成清单文件（放在批次文件夹内）
    manifest_file = os.path.join(batch_dir, f"notify_list_{timestamp}.txt")
    with open(manifest_file, "w", encoding="utf-8") as f:
        f.write("\n".join(manifest))
    print(f"[工时检查] 已生成通知清单: {manifest_file}", file=sys.stderr)
    print(f"[工时检查] 请查看清单确保通知完整", file=sys.stderr)
