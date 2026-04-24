"""工时填报检查技能 - 数据处理模块

处理通知内容生成和数据格式化。
"""
from datetime import datetime, timezone, timedelta

CHINA_TZ = timezone(timedelta(hours=8))
MAX_CONTENT_BYTES = 1800


def get_china_now():
    """获取中国时区当前时间"""
    return datetime.now(CHINA_TZ)


def truncate_content(content):
    """截断超长内容（保留1800字节+提示）"""
    if len(content.encode("utf-8")) > MAX_CONTENT_BYTES:
        return content[:MAX_CONTENT_BYTES] + "\n\n...（内容过长，已截断）"
    return content


def generate_group_notification(data):
    """生成群通知 Markdown 内容"""
    d = data["data"]
    lines = []
    lines.append("## ⏱️ 工时填写提醒")
    lines.append("")
    lines.append(f"**日期**: {get_china_now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")
    lines.append(f"**已填写**: {d['filledUsersCount']} 人")
    lines.append(f"**未填写**: {d['unfilledUsersCount']} 人")
    lines.append("")

    if d.get("unfilledUsers"):
        lines.append("### 未填写人员明细")
        lines.append("")

        for user in d["unfilledUsers"]:
            lines.append(f"**{user['cnName']}**")
            tasks = user.get("unfilledTasks", [])
            if tasks:
                for task in tasks:
                    lines.append(f"- 项目：{task['projectName']}")
                    for t in task.get("tasks", []):
                        lines.append(f"  - 待填写任务：{t}")
            else:
                lines.append("- 可能暂无分配任务或任务未开始")
            lines.append("")

    lines.append("---")
    lines.append("请以上人员核对并填写今日工时，如无任务请忽略，感谢配合！")

    return truncate_content("\n".join(lines))


def generate_user_notification(user):
    """生成个人通知 Markdown 内容"""
    lines = []
    lines.append("## 工时填写提醒")
    lines.append("")
    lines.append(f"**日期**: {get_china_now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")
    lines.append(f"您好 {user['cnName']}，您今日尚未填写工时，请尽快填写。")
    lines.append("")

    tasks = user.get("unfilledTasks", [])
    if tasks:
        lines.append("### 待填写任务")
        lines.append("")
        for task in tasks:
            project_name = task.get("projectName", "未知项目")
            task_list = task.get("tasks", [])
            if task_list:
                lines.append(f"- 项目：{project_name}")
                for t in task_list:
                    lines.append(f"  - 待填写任务：{t}")
            else:
                lines.append(f"- 项目：{project_name}")
    else:
        lines.append("### 温馨提示")
        lines.append("")
        lines.append("请登录工时系统填写今日工时，感谢配合！")

    lines.append("")
    lines.append("---")
    lines.append("请尽快填写工时，感谢配合！")

    return truncate_content("\n".join(lines))


def generate_leader_notification(leader_name, leader_users):
    """生成负责人通知 Markdown 内容"""
    lines = []
    lines.append("## 工时填写提醒")
    lines.append("")
    lines.append(f"**日期**: {get_china_now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")
    lines.append(f"您好 {leader_name}，以下成员尚未填写今日工时，请督促。")
    lines.append("")

    lines.append("### 未填写人员")
    lines.append("")

    user_project_tasks = {}
    for u in leader_users:
        project_name = u.get("projectName", "未知项目")
        if project_name not in user_project_tasks:
            user_project_tasks[project_name] = []
        user_project_tasks[project_name].append(u)

    for project_name, users in user_project_tasks.items():
        lines.append(f"- 项目：{project_name}")
        for u in users:
            task_list = u.get("tasks", [])
            if task_list:
                lines.append(f"  - {u['name']}")
                for t in task_list:
                    lines.append(f"    - 待填写任务：{t}")
            else:
                lines.append(f"  - {u['name']}: 无任务")

    lines.append("")
    lines.append("---")
    lines.append("请督促成员尽快填写工时，感谢配合！")

    return truncate_content("\n".join(lines))


def organize_leader_data(unfilled_users):
    """按负责人组织未填写数据"""
    leaders = {}
    for user in unfilled_users:
        for task in user.get("unfilledTasks", []):
            leader_name = task.get("projectLeader") or "未指定负责人"
            leader_id = task.get("projectLeaderDingtalkId") or "unknown"
            if leader_name not in leaders:
                leaders[leader_name] = {
                    "dingtalkId": leader_id,
                    "users": [],
                }
            leaders[leader_name]["users"].append({
                "name": user["cnName"],
                "tasks": task.get("tasks", []),
                "projectName": task.get("projectName", "未知项目"),
            })
    return leaders
