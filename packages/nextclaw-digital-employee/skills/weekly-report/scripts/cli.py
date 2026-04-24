"""周报技能 - 命令行交互模块

处理个人、部门、全公司周报的查询和提交。
"""
import sys

from api import APIClient
from models import DeptTreeParser
from report import (
    generate_personal_week_reports,
    generate_department_daily_summary,
    generate_department_week_report,
    generate_company_week_report,
)


def handle_personal(args, week_start, week_end, users_data, raw_dailies, client):
    """处理个人周报"""
    target_user = args.user_name
    if not target_user:
        print("错误: 请指定 --user 参数", file=sys.stderr)
        return False

    reports = generate_personal_week_reports(target_user, users_data, raw_dailies, week_start, week_end)
    if not reports:
        print(f"未找到用户 {target_user} 的本周日报数据", file=sys.stderr)
        return False

    # 显示周报
    print("=" * 60)
    print(f"## 个人周报：{reports[0]['user_name']}")
    if reports[0].get("dept"):
        print(f"部门：{reports[0]['dept']}")
    print(f"统计周期：{reports[0]['week_start']} ~ {reports[0]['week_end']}")
    print(f"周报份数：{len(reports)}")
    print()

    for i, report in enumerate(reports):
        print(f"### 周报 {i + 1}：{report['project_name']}")
        if report["report_type"] == 1:
            print("类型：商机日报")
            print(report.get("chance_summarize", "无"))
            print()
            print("下周计划：")
            print(report.get("chance_plan", "无"))
        else:
            print("类型：项目日报")
            print("本周总结：")
            print(report.get("project_summarize", "无"))
            print()
            print("下周计划：")
            print(report.get("project_plan", "无"))
        print()

    print("=" * 60)

    # 提交
    if args.submit:
        if not client.token:
            print("\n错误: 需要登录凭据才能提交周报", file=sys.stderr)
            return False

        lookup_user = args.user_name
        if not lookup_user.isascii():
            lookup_user = client.username

        user_id = _get_user_id(client, lookup_user)
        if not user_id:
            print("\n错误: 无法获取用户ID", file=sys.stderr)
            return False

        print(f"\n将提交 {len(reports)} 份周报")

        for i, report in enumerate(reports):
            submit_data = {
                "weekPlanNow": "无",
                "date": f"{report['week_start']} ~ {report['week_end']}",
                "chanceProjectName": report.get("project_name", ""),
                "chanceProjectSchedule": report.get("project_stage", ""),
                "projectCode": report.get("project_code", "") if report["report_type"] == 2 else "",
                "projectManager": report.get("project_manager", "") if report["report_type"] == 2 else "",
                "weekSummarizeNow": report.get("project_summarize", report.get("chance_summarize", "无")),
                "weekPlanNext": report.get("project_plan", report.get("chance_plan", "无")),
                "problemRisk": "无",
                "requestInstructions": "无",
                "reportUserList": [user_id],
                "weekStartTime": f"{report['week_start']} 00:00:00",
                "weekEndTime": f"{report['week_end']} 23:59:59",
                "weekReportType": report["report_type"],
            }

            print(f"\n[{i + 1}/{len(reports)}] 正在提交 {report['project_name']} 周报...", file=sys.stderr)
            try:
                result = client.submit_weekly_report(submit_data, lookup_user)
                if result.get("code") == 0 or result.get("success"):
                    print(f"[{i + 1}/{len(reports)}] ✓ 提交成功", file=sys.stderr)
                else:
                    print(f"[{i + 1}/{len(reports)}] ✗ 提交失败: {result.get('message', result)}", file=sys.stderr)
            except Exception as e:
                print(f"[{i + 1}/{len(reports)}] ✗ 提交错误: {e}", file=sys.stderr)

        print("\n周报提交完成", file=sys.stderr)

    return True


def handle_dept_daily(args, week_start, week_end, users_data, client):
    """处理部门日报汇总"""
    dept_keyword = args.dept_name

    if not client.token:
        print("错误: 需要登录凭据才能查询部门", file=sys.stderr)
        return False

    dept_tree_result = client.query_dept_tree()
    if dept_tree_result.get("code") != 0 and not dept_tree_result.get("data"):
        print(f"查询部门树失败: {dept_tree_result.get('message', '未知错误')}", file=sys.stderr)
        return False

    dept_tree = dept_tree_result.get("data", {})
    all_depts = DeptTreeParser.flatten(dept_tree)
    matched_depts = DeptTreeParser.find_matching_depts(dept_tree, dept_keyword)

    if len(matched_depts) == 0:
        print(f"未匹配到部门 '{dept_keyword}'")
        print(f"\n系统中现有以下部门：")
        for i, dept in enumerate(all_depts[:20], 1):
            print(f"  {i}. {dept['fullPath']}")
        if len(all_depts) > 20:
            print(f"  ...（共 {len(all_depts)} 个部门）")
        print(f"\n请确认要查询的部门（输入完整部门路径或序号）")
        return True

    if len(matched_depts) > 1:
        print(f"找到 {len(matched_depts)} 个匹配的部门，请确认：")
        for i, dept in enumerate(matched_depts[:20], 1):
            child_count = len(dept["children"]) if dept.get("children") else 0
            child_info = f"（含 {child_count} 个子部门）" if child_count else ""
            print(f"  {i}. {dept['fullPath']}{child_info}")
        if len(matched_depts) > 20:
            print(f"  ...（共 {len(matched_depts)} 个匹配）")
        print(f"\n请确认要查询的部门（输入完整部门路径或序号）")
        return True

    selected_dept = matched_depts[0]
    dept_path = selected_dept["fullPath"]
    print(f"确认查询部门：{dept_path}")

    # 过滤部门用户数据
    dept_users_data = {}
    for user_name, user_info in users_data.items():
        user_dept = user_info.get("dept") or ""
        if dept_path == user_dept:
            dept_users_data[user_name] = user_info

    if not dept_users_data:
        print(f"\n注意: 部门 '{dept_path}' 暂无本周日报数据")

    summary = generate_department_daily_summary(dept_path, dept_users_data, week_start, week_end)
    print(summary)
    return True


def handle_dept_weekly(args, week_start, week_end, users_data, client):
    """处理部门周报"""
    dept_keyword = args.dept_name

    if not client.token:
        print("错误: 需要登录凭据才能查询部门", file=sys.stderr)
        return False

    dept_tree_result = client.query_dept_tree()
    if dept_tree_result.get("code") != 0 and not dept_tree_result.get("data"):
        print(f"查询部门树失败: {dept_tree_result.get('message', '未知错误')}", file=sys.stderr)
        return False

    dept_tree = dept_tree_result.get("data", {})
    all_depts = DeptTreeParser.flatten(dept_tree)
    matched_depts = DeptTreeParser.find_matching_depts(dept_tree, dept_keyword)

    if len(matched_depts) == 0:
        print(f"未匹配到部门 '{dept_keyword}'")
        print(f"\n系统中现有以下部门：")
        for i, dept in enumerate(all_depts[:20], 1):
            print(f"  {i}. {dept['fullPath']}")
        if len(all_depts) > 20:
            print(f"  ...（共 {len(all_depts)} 个部门）")
        print(f"\n请确认要生成周报的部门（输入完整部门路径或序号）")
        return True

    if len(matched_depts) > 1:
        print(f"找到 {len(matched_depts)} 个匹配的部门，请确认：")
        for i, dept in enumerate(matched_depts[:20], 1):
            child_count = len(dept["children"]) if dept.get("children") else 0
            child_info = f"（含 {child_count} 个子部门）" if child_count else ""
            print(f"  {i}. {dept['fullPath']}{child_info}")
        if len(matched_depts) > 20:
            print(f"  ...（共 {len(matched_depts)} 个匹配）")
        print(f"\n请确认要生成周报的部门（输入完整部门路径或序号）")
        return True

    selected_dept = matched_depts[0]
    dept_path = selected_dept["fullPath"]
    print(f"确认生成部门周报：{dept_path}")

    dept_users_data = {}
    for user_name, user_info in users_data.items():
        user_dept = user_info.get("dept") or ""
        if dept_path == user_dept:
            dept_users_data[user_name] = user_info

    if not dept_users_data:
        print(f"\n注意: 部门 '{dept_path}' 暂无本周日报数据")

    weekly = generate_department_week_report(dept_path, dept_users_data, week_start, week_end)
    print(weekly)
    return True


def handle_company(args, week_start, week_end, users_data):
    """处理全公司周报"""
    weekly = generate_company_week_report(users_data, week_start, week_end)
    print(weekly)
    return True


def _get_user_id(client, username):
    """获取用户 ID"""
    result = client.query_user_by_username(username)
    if result.get("code") == 0 and result.get("data"):
        records = result["data"].get("records", [])
        for record in records:
            if record.get("username") == username:
                return str(record.get("userId", ""))
    return ""
