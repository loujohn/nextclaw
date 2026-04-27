"""周报技能 - 周报生成逻辑模块

处理个人、部门、全公司周报的生成。
"""
from models import deduplicate, split_and_deduplicate


def generate_personal_week_reports(user_name, users_data, raw_dailies, week_start, week_end):
    """生成个人周报（按项目分别生成）"""
    if user_name not in users_data:
        return []

    user_info = users_data[user_name]
    projects = {}
    chances = []

    # 从 raw_dailies 获取项目信息
    project_info_map = {}
    for record in raw_dailies:
        if record.get("createBy") == user_name or record.get("createName") == user_name:
            if record.get("dayReportType") == 2 and record.get("projectCode"):
                proj_name = record.get("projectName", "")
                if proj_name and proj_name not in project_info_map:
                    project_info_map[proj_name] = {
                        "projectCode": record.get("projectCode", ""),
                        "projectName": proj_name,
                        "projectStage": record.get("projectStage", "项目进行中"),
                        "projectManager": record.get("projectManager", ""),
                    }

    # 按日期和事项分类
    for date in sorted(user_info.get("dates", {}).keys()):
        for item in user_info["dates"][date]:
            day_type = item.get("dayReportType", 2)
            if day_type == 1:
                # 商机日报
                visit_client = item.get("visitClientName", "")
                visit_record = item.get("visitRecord", "")
                client_hope = item.get("clientHope", "")
                plan = item.get("plan", "")
                if visit_client:
                    chances.append({
                        "client": visit_client,
                        "record": visit_record,
                        "hope": client_hope,
                        "plan": plan,
                    })
            else:
                # 项目日报
                summarize = item.get("summarize", "")
                plan = item.get("plan", "")
                project_name = item.get("projectName", "")
                if project_name:
                    if project_name not in projects:
                        projects[project_name] = {"summarize": [], "plan": []}
                    if summarize:
                        projects[project_name]["summarize"].append(summarize)
                    if plan:
                        projects[project_name]["plan"].append(plan)

    # 生成项目周报
    reports = []
    for project_name, project_data in projects.items():
        week_summarize = "\n".join([f"{i + 1}. {s}" for i, s in enumerate(deduplicate(project_data["summarize"]))])
        week_plan = "；".join(split_and_deduplicate(project_data["plan"])) if project_data["plan"] else "继续推进工作"
        p_info = project_info_map.get(project_name, {})

        reports.append({
            "user_name": user_name,
            "dept": user_info.get("dept"),
            "project_name": project_name,
            "project_code": p_info.get("projectCode", ""),
            "project_stage": p_info.get("projectStage", ""),
            "project_manager": p_info.get("projectManager", ""),
            "project_summarize": week_summarize or "无",
            "project_plan": week_plan or "无",
            "week_start": week_start.strftime("%Y-%m-%d"),
            "week_end": week_end.strftime("%Y-%m-%d"),
            "report_type": 2,
        })

    # 生成商机周报
    if chances:
        chance_summaries = []
        chance_plans = []
        for c in chances:
            if c["record"]:
                chance_summaries.append(f"拜访{c['client']}：{c['record']}")
            if c["hope"]:
                chance_summaries.append(f"客户期望：{c['hope']}")
            if c["plan"]:
                chance_plans.append(c["plan"])

        week_chance_summary = "\n".join([f"{i + 1}. {s}" for i, s in enumerate(deduplicate(chance_summaries))])
        week_chance_plan = "；".join(split_and_deduplicate(chance_plans)) if chance_plans else "继续跟进客户"

        reports.append({
            "user_name": user_name,
            "dept": user_info.get("dept"),
            "project_name": "商机汇总",
            "chance_summarize": week_chance_summary or "无",
            "chance_plan": week_chance_plan or "无",
            "week_start": week_start.strftime("%Y-%m-%d"),
            "week_end": week_end.strftime("%Y-%m-%d"),
            "report_type": 1,
        })

    return reports


def generate_department_daily_summary(dept_name, users_data, week_start, week_end):
    """生成部门日报汇总"""
    lines = [f"# {dept_name} - 本周日报汇总"]
    lines.append(f"> 统计周期：{week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}")
    lines.append("")

    for user_name in sorted(users_data.keys()):
        user_info = users_data[user_name]
        dept = user_info.get("dept", "")
        user_header = f"{user_name}（{dept}）" if dept else user_name
        lines.append(f"## {user_header}")
        lines.append("")

        for date in sorted(user_info.get("dates", {}).keys()):
            lines.append(f"### {date}")
            for item in user_info["dates"][date]:
                day_type = item.get("dayReportType", 2)
                if day_type == 1:
                    visit_client = item.get("visitClientName", "")
                    visit_record = item.get("visitRecord", "")
                    if visit_client and visit_record:
                        lines.append(f"- 【商机】拜访{visit_client}：{visit_record}")
                else:
                    summarize = item.get("summarize", "")
                    project_name = item.get("projectName", "")
                    if summarize:
                        prefix = f"【{project_name}】" if project_name else ""
                        lines.append(f"- {prefix}{summarize}")
            lines.append("")

    return "\n".join(lines)


def generate_department_week_report(dept_name, users_data, week_start, week_end):
    """生成部门周报"""
    lines = [f"# {dept_name} - 本周工作汇总"]
    lines.append(f"> 统计周期：{week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}")
    lines.append("")

    all_project_summaries = []
    all_chance_summaries = []
    all_project_plans = []
    all_chance_plans = []
    total_users = 0

    for user_name in sorted(users_data.keys()):
        user_info = users_data[user_name]
        total_users += 1

        for date in sorted(user_info.get("dates", {}).keys()):
            for item in user_info["dates"][date]:
                day_type = item.get("dayReportType", 2)
                if day_type == 1:
                    visit_client = item.get("visitClientName", "")
                    visit_record = item.get("visitRecord", "")
                    client_hope = item.get("clientHope", "")
                    plan = item.get("plan", "")
                    if visit_record:
                        all_chance_summaries.append(f"{user_name} 拜访{visit_client}：{visit_record}")
                    if client_hope:
                        all_chance_summaries.append(f"{user_name} - 客户期望：{client_hope}")
                    if plan:
                        all_chance_plans.append(f"{user_name}：{plan}")
                else:
                    summarize = item.get("summarize", "")
                    plan = item.get("plan", "")
                    project_name = item.get("projectName", "")
                    if summarize:
                        proj_prefix = f"【{project_name}】" if project_name else ""
                        all_project_summaries.append(f"{user_name} {proj_prefix}{summarize}")
                    if plan:
                        all_project_plans.append(f"{user_name}：{plan}")

    lines.append("## 部门概况")
    lines.append(f"- 参与人数：{total_users} 人")
    lines.append("")

    lines.append("## 本周项目工作总结")
    if all_project_summaries:
        for i, s in enumerate(deduplicate(all_project_summaries)):
            lines.append(f"{i + 1}. {s}")
    else:
        lines.append("无项目日报记录")
    lines.append("")

    lines.append("## 本周商机拜访总结")
    if all_chance_summaries:
        for i, s in enumerate(deduplicate(all_chance_summaries)):
            lines.append(f"{i + 1}. {s}")
    else:
        lines.append("无商机日报记录")
    lines.append("")

    lines.append("## 下周工作计划")
    all_plans = all_project_plans + all_chance_plans
    if all_plans:
        for i, p in enumerate(deduplicate(all_plans)):
            lines.append(f"{i + 1}. {p}")
    else:
        lines.append("暂无计划")
    lines.append("")

    return "\n".join(lines)


def generate_company_week_report(users_data, week_start, week_end):
    """生成全公司周报"""
    lines = [f"# 全公司 - 本周工作汇总"]
    lines.append(f"> 统计周期：{week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}")
    lines.append("")

    dept_summaries = {}

    for user_name, user_info in sorted(users_data.items()):
        dept = user_info.get("dept", "未分配部门")
        if dept not in dept_summaries:
            dept_summaries[dept] = {
                "users": set(),
                "project_summaries": [],
                "chance_summaries": [],
                "project_plans": [],
                "chance_plans": [],
            }
        dept_summaries[dept]["users"].add(user_name)

        for date in sorted(user_info.get("dates", {}).keys()):
            for item in user_info["dates"][date]:
                day_type = item.get("dayReportType", 2)
                summarize = item.get("summarize", "")
                plan = item.get("plan", "")
                project_name = item.get("projectName", "")

                if day_type == 1:
                    visit_client = item.get("visitClientName", "")
                    visit_record = item.get("visitRecord", "")
                    if visit_record:
                        dept_summaries[dept]["chance_summaries"].append(
                            f"{user_name} 拜访{visit_client}：{visit_record}"
                        )
                else:
                    if summarize:
                        proj_prefix = f"【{project_name}】" if project_name else ""
                        dept_summaries[dept]["project_summaries"].append(f"{user_name} {proj_prefix}{summarize}")
                    if plan:
                        dept_summaries[dept]["project_plans"].append(f"{user_name}：{plan}")

    for dept_name in sorted(dept_summaries.keys()):
        dept_data = dept_summaries[dept_name]
        lines.append(f"## {dept_name}（{len(dept_data['users'])} 人）")
        lines.append("")

        if dept_data["project_summaries"]:
            lines.append("### 项目工作")
            for i, s in enumerate(deduplicate(dept_data["project_summaries"])[:10]):
                lines.append(f"{i + 1}. {s}")
            lines.append("")

        if dept_data["chance_summaries"]:
            lines.append("### 商机拜访")
            for i, s in enumerate(deduplicate(dept_data["chance_summaries"])[:5]):
                lines.append(f"{i + 1}. {s}")
            lines.append("")

    return "\n".join(lines)
