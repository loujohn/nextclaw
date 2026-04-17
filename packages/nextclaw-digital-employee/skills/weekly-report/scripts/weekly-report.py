#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

if sys.platform == "win32":
    import ctypes

    ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

import os
import re
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta

DEFAULT_BASE_URL = "http://shangji.dcg-internal-services.dev.dcginner:10003/api"
LOGIN_ENDPOINT = "/admin/oauth2/token"
WEEK_REPORT_ENDPOINT = "/admin/week/report"
DAY_REPORT_QUERY_ENDPOINT = "/admin/day/report/page"

PM_BASE_URL = os.environ.get("PM_BASE_URL", DEFAULT_BASE_URL)
PM_BASIC_AUTH = os.environ.get("PM_BASIC_AUTH", "")
PM_USERNAME = os.environ.get("PM_USERNAME", "")
PM_PASSWORD = os.environ.get("PM_PASSWORD", "")


def post_form(url, form_data, timeout=120):
    data = urllib.parse.urlencode(form_data).encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "nextclaw-weekly-report/1.0",
    }
    if PM_BASIC_AUTH:
        headers["Authorization"] = PM_BASIC_AUTH
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return {"code": e.code, "message": e.read().decode("utf-8")}
        except:
            return {"code": e.code, "message": str(e)}
    except urllib.error.URLError as e:
        return {"code": -1, "message": f"网络请求失败: {e.reason}"}
    except Exception as e:
        return {"code": -1, "message": str(e)}


def fetch_json_get(url, token, timeout=120):
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-weekly-report/1.0",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return {"code": e.code, "message": e.read().decode("utf-8")}
        except:
            return {"code": e.code, "message": str(e)}
    except urllib.error.URLError as e:
        return {"code": -1, "message": f"网络请求失败: {e.reason}"}
    except Exception as e:
        return {"code": -1, "message": str(e)}


def fetch_json_post(url, data, token, timeout=120):
    body = json.dumps(data).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-weekly-report/1.0",
    }
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return {"code": e.code, "message": e.read().decode("utf-8")}
        except:
            return {"code": e.code, "message": str(e)}
    except urllib.error.URLError as e:
        return {"code": -1, "message": f"网络请求失败: {e.reason}"}
    except Exception as e:
        return {"code": -1, "message": str(e)}


def login(base_url, username, password):
    url = f"{base_url}{LOGIN_ENDPOINT}"
    form_data = {
        "grant_type": "password",
        "username": username,
        "password": password,
        "login_type": "quick",
    }
    result = post_form(url, form_data)
    if "access_token" in result:
        return result["access_token"]
    raise Exception(f"登录失败: {result.get('message', result)}")


def get_week_range():
    today = datetime.now()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def get_daily_report_week_dir():
    """获取日报周目录"""
    base_dir = os.path.join(os.path.expanduser("~"), "nextclaw-temp", "daily-report")
    if not os.path.exists(base_dir):
        return None, None

    today = datetime.now()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    week_dir = os.path.join(
        base_dir, f"{monday.strftime('%Y-%m-%d')}_{sunday.strftime('%Y-%m-%d')}"
    )

    if not os.path.exists(week_dir):
        return None, None

    return week_dir, (monday, sunday)


def get_week_report_week_dir():
    """获取周报周目录"""
    base_dir = os.path.join(os.path.expanduser("~"), "nextclaw-temp", "weekly-report")
    if not os.path.exists(base_dir):
        os.makedirs(base_dir, exist_ok=True)

    today = datetime.now()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    week_dir = os.path.join(
        base_dir, f"{monday.strftime('%Y-%m-%d')}_{sunday.strftime('%Y-%m-%d')}"
    )
    os.makedirs(week_dir, exist_ok=True)

    return week_dir, (monday, sunday)


def query_daily_reports_from_api(
    base_url, token, week_start, week_end, page=1, size=50
):
    """从API查询日报"""
    params = {
        "dayReportTimeQuery[0]": week_start.strftime("%Y-%m-%d"),
        "dayReportTimeQuery[1]": week_end.strftime("%Y-%m-%d"),
        "dayReportType": 2,
        "queryType": 1,
        "current": page,
        "size": size,
    }
    url = f"{base_url}{DAY_REPORT_QUERY_ENDPOINT}?{urllib.parse.urlencode(params)}"
    return fetch_json_get(url, token)


def parse_users_md(filepath):
    """解析用户维度的MD文件，返回结构化数据"""
    users_data = {}
    if not os.path.exists(filepath):
        return users_data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    current_user = None
    current_date = None

    for line in lines:
        if line.startswith("## "):
            current_user = line.replace("## ", "").strip()
            if current_user not in users_data:
                users_data[current_user] = {"dates": {}}
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_user and current_date:
                if current_date not in users_data[current_user]["dates"]:
                    users_data[current_user]["dates"][current_date] = []
        elif line.startswith("- **"):
            parts = line.split("**")
            if len(parts) >= 3 and current_user and current_date:
                project_name = parts[1]
                rest = parts[2].replace("**：", "").replace("：", "").strip()
                if "。" in rest:
                    summarize, plan_part = rest.split("。", 1)
                    plan = plan_part.replace("明日：", "").replace("明日:", "").strip()
                else:
                    summarize = rest
                    plan = ""
                users_data[current_user]["dates"][current_date].append(
                    {
                        "project": project_name,
                        "summarize": summarize.replace("今日：", "")
                        .replace("今日:", "")
                        .strip(),
                        "plan": plan,
                    }
                )

    return users_data


def parse_projects_md(filepath):
    """解析项目维度的MD文件，返回结构化数据"""
    projects_data = {}
    if not os.path.exists(filepath):
        return projects_data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    current_project = None
    project_name = None
    project_manager = None
    current_date = None

    for line in lines:
        if line.startswith("## "):
            match = re.match(r"## (.+?)（(.+?)）", line)
            if match:
                project_name = match.group(1)
                project_code = match.group(2)
                current_project = project_code
                if project_code not in projects_data:
                    projects_data[project_code] = {
                        "name": project_name,
                        "manager": "",
                        "dates": {},
                    }
        elif line.startswith("**经理**: "):
            if current_project:
                projects_data[current_project]["manager"] = line.replace(
                    "**经理**: ", ""
                ).strip()
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_project and current_date:
                if current_date not in projects_data[current_project]["dates"]:
                    projects_data[current_project]["dates"][current_date] = []
        elif line.startswith("- **"):
            parts = line.split("**")
            if len(parts) >= 3 and current_project and current_date:
                user_name = parts[1]
                rest = parts[2].replace("**：", "").replace("：", "").strip()
                if "。" in rest:
                    summarize, plan_part = rest.split("。", 1)
                    plan = plan_part.replace("明日：", "").replace("明日:", "").strip()
                else:
                    summarize = rest
                    plan = ""
                projects_data[current_project]["dates"][current_date].append(
                    {
                        "user": user_name,
                        "summarize": summarize.replace("今日：", "")
                        .replace("今日:", "")
                        .strip(),
                        "plan": plan,
                    }
                )

    return projects_data


def deduplicate(items):
    """去重并保持顺序"""
    seen = set()
    result = []
    for item in items:
        item = item.strip()
        item = item.replace("今日：", "").replace("今日:", "").replace("今日", "")
        if item and item not in seen and item not in ["无", "暂无", "暂无计划"]:
            seen.add(item)
            result.append(item)
    return result


def split_and_deduplicate(items):
    """按分号拆分后去重"""
    all_items = []
    for item in items:
        item = item.replace("明日：", "").replace("明日:", "").replace("明日", "")
        parts = item.replace("；", ";").split(";")
        for part in parts:
            part = part.strip()
            if len(part) >= 2 and not part.isdigit():
                all_items.append(part)
    return deduplicate(all_items)


def generate_personal_week_report(user_name, users_data, week_start, week_end):
    """生成个人周报"""
    if user_name not in users_data or not users_data[user_name]["dates"]:
        return None

    all_summaries = []
    all_plans = []
    projects_involved = set()

    for date in sorted(users_data[user_name]["dates"].keys()):
        for item in users_data[user_name]["dates"][date]:
            if item["summarize"]:
                all_summaries.append(item["summarize"])
            if item["plan"]:
                all_plans.append(item["plan"])
            projects_involved.add(item["project"])

    week_summarize = "\n".join(
        [f"{i + 1}. {s}" for i, s in enumerate(deduplicate(all_summaries))]
    )
    week_plan = (
        "；".join(split_and_deduplicate(all_plans)) if all_plans else "继续推进工作"
    )

    return {
        "weekPlanNow": "无",
        "chanceProjectName": "",
        "chanceProjectSchedule": "",
        "projectCode": "",
        "projectManager": "",
        "weekSummarizeNow": week_summarize,
        "weekPlanNext": week_plan,
        "problemRisk": "无",
        "requestInstructions": "无",
        "weekStartTime": f"{week_start.strftime('%Y-%m-%d')} 00:00:00",
        "weekEndTime": f"{week_end.strftime('%Y-%m-%d')} 23:59:59",
        "weekReportType": 2,
        "_userName": user_name,
        "_projectsCount": len(projects_involved),
    }


def generate_project_week_report(project_code, project_data, week_start, week_end):
    """生成项目周报"""
    if not project_data.get("dates"):
        return None

    all_summaries = []
    all_plans = []
    users_involved = set()

    for date in sorted(project_data["dates"].keys()):
        for item in project_data["dates"][date]:
            if item["summarize"]:
                all_summaries.append(item["summarize"])
            if item["plan"]:
                all_plans.append(item["plan"])
            users_involved.add(item["user"])

    week_summarize = "\n".join(
        [f"{i + 1}. {s}" for i, s in enumerate(deduplicate(all_summaries))]
    )
    week_plan = (
        "；".join(split_and_deduplicate(all_plans)) if all_plans else "继续推进项目"
    )

    return {
        "weekPlanNow": "无",
        "chanceProjectName": project_data["name"],
        "chanceProjectSchedule": "项目进行中",
        "projectCode": project_code,
        "projectManager": project_data["manager"],
        "weekSummarizeNow": week_summarize,
        "weekPlanNext": week_plan,
        "problemRisk": "无",
        "requestInstructions": "无",
        "weekStartTime": f"{week_start.strftime('%Y-%m-%d')} 00:00:00",
        "weekEndTime": f"{week_end.strftime('%Y-%m-%d')} 23:59:59",
        "weekReportType": 2,
        "_projectName": project_data["name"],
        "_usersCount": len(users_involved),
    }


def generate_department_week_report(users_data, projects_data, week_start, week_end):
    """生成部门周报（汇总所有）"""
    all_reports = []

    for project_code, project_data in sorted(projects_data.items()):
        report = generate_project_week_report(
            project_code, project_data, week_start, week_end
        )
        if report:
            all_reports.append(report)

    return all_reports


def format_report_for_display(report, report_type):
    """格式化周报用于显示"""
    if report_type == "personal":
        lines = [
            f"## 个人周报：{report['_userName']}",
            f"参与项目数：{report['_projectsCount']}",
            "",
            "### 本周工作总结",
            report["weekSummarizeNow"],
            "",
            "### 下周工作计划",
            report["weekPlanNext"],
        ]
    elif report_type == "project":
        lines = [
            f"## 项目周报：{report['chanceProjectName']}（{report['projectCode']}）",
            f"项目经理：{report['projectManager']}",
            "",
            "### 本周工作总结",
            report["weekSummarizeNow"],
            "",
            "### 下周工作计划",
            report["weekPlanNext"],
        ]
    else:
        lines = [
            f"## {report['chanceProjectName']}（{report['projectCode']}）",
            f"经理：{report['projectManager']}",
            f"本周：{report['weekSummarizeNow']}",
            f"下周：{report['weekPlanNext']}",
        ]
    return "\n".join(lines)


def merge_projects_data(data1, data2):
    """合并两个项目数据源"""
    merged = dict(data1)
    for project_code, project_data in data2.items():
        if project_code not in merged:
            merged[project_code] = project_data
        else:
            for date, items in project_data.get("dates", {}).items():
                if date not in merged[project_code]["dates"]:
                    merged[project_code]["dates"][date] = []
                merged[project_code]["dates"][date].extend(items)
    return merged


def merge_users_data(data1, data2):
    """合并两个用户数据源"""
    merged = dict(data1)
    for user_name, user_data in data2.items():
        if user_name not in merged:
            merged[user_name] = user_data
        else:
            for date, items in user_data.get("dates", {}).items():
                if date not in merged[user_name]["dates"]:
                    merged[user_name]["dates"][date] = []
                merged[user_name]["dates"][date].extend(items)
    return merged


def convert_api_records_to_projects(records):
    """将API返回的记录转换为项目维度格式"""
    projects_data = {}
    for record in records:
        project_code = record.get("projectCode", "")
        if not project_code:
            continue
        if project_code not in projects_data:
            projects_data[project_code] = {
                "name": record.get("chanceProjectName", record.get("projectName", "")),
                "manager": record.get("projectManager", ""),
                "dates": {},
            }
        report_date = record.get("dayReportTime", "")[:10]
        if report_date:
            if report_date not in projects_data[project_code]["dates"]:
                projects_data[project_code]["dates"][report_date] = []
            projects_data[project_code]["dates"][report_date].append(
                {
                    "user": record.get("createName", record.get("createBy", "")),
                    "summarize": record.get("daySummarizeNow", ""),
                    "plan": record.get("dayPlanNext", ""),
                }
            )
    return projects_data


def convert_api_records_to_users(records):
    """将API返回的记录转换为用户维度格式"""
    users_data = {}
    for record in records:
        user_name = record.get("createName", record.get("createBy", ""))
        if not user_name:
            continue
        if user_name not in users_data:
            users_data[user_name] = {"dates": {}}
        report_date = record.get("dayReportTime", "")[:10]
        project_name = record.get("chanceProjectName", record.get("projectName", ""))
        if report_date:
            if report_date not in users_data[user_name]["dates"]:
                users_data[user_name]["dates"][report_date] = []
            users_data[user_name]["dates"][report_date].append(
                {
                    "project": project_name,
                    "summarize": record.get("daySummarizeNow", ""),
                    "plan": record.get("dayPlanNext", ""),
                }
            )
    return users_data


def main():
    parser = argparse.ArgumentParser(
        description="项目周报生成脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--mode",
        choices=["personal", "project", "department"],
        default="project",
        help="周报模式：personal=个人, project=项目, department=部门（默认project）",
    )
    parser.add_argument("--user", dest="user_name", help="指定用户名（用于个人周报）")
    parser.add_argument(
        "--project", dest="project_code", help="指定项目编号（用于项目周报）"
    )
    parser.add_argument("--submit", action="store_true", help="提交周报")
    parser.add_argument("--review", action="store_true", help="预览周报")
    parser.add_argument(
        "--username", default=PM_USERNAME, help="用户名（环境变量 PM_USERNAME）"
    )
    parser.add_argument(
        "--password", default=PM_PASSWORD, help="密码（环境变量 PM_PASSWORD）"
    )
    parser.add_argument("--size", type=int, default=50, help="查询每页大小")
    args = parser.parse_args()

    base_url = PM_BASE_URL
    username = args.username
    password = args.password
    mode = args.mode

    today = datetime.now()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    week_start, week_end = monday, sunday

    md_projects_data = {}
    md_users_data = {}
    api_projects_data = {}
    api_users_data = {}
    data_sources = []

    week_dir, _ = get_daily_report_week_dir()
    if week_dir:
        users_file = os.path.join(week_dir, "users.md")
        projects_file = os.path.join(week_dir, "projects.md")
        md_users_data = parse_users_md(users_file)
        md_projects_data = parse_projects_md(projects_file)
        if md_users_data or md_projects_data:
            data_sources.append("本地汇总文件")

    if username and password:
        try:
            token = login(base_url, username, password)
            result = query_daily_reports_from_api(
                base_url, token, week_start, week_end, size=args.size
            )
            if result.get("code") == 0 and result.get("data"):
                records = result["data"].get("records", [])
                if records:
                    api_projects_data = convert_api_records_to_projects(records)
                    api_users_data = convert_api_records_to_users(records)
                    data_sources.append("API接口")

                    report_week_dir, _ = get_week_report_week_dir()
                    cache_file = os.path.join(
                        report_week_dir, "daily_reports_query_admin.json"
                    )
                    with open(cache_file, "w", encoding="utf-8") as f:
                        json.dump(
                            {
                                "records": records,
                                "total": len(records),
                                "week_start": week_start.strftime("%Y-%m-%d"),
                                "week_end": week_end.strftime("%Y-%m-%d"),
                            },
                            f,
                            ensure_ascii=False,
                            indent=2,
                        )
        except Exception as e:
            print(f"[警告] API查询失败: {e}，将使用其他数据源", file=sys.stderr)

    projects_data = merge_projects_data(md_projects_data, api_projects_data)
    users_data = merge_users_data(md_users_data, api_users_data)

    if not projects_data and not users_data:
        print("错误: 未能获取到任何日报数据", file=sys.stderr)
        print("请确保已提交日报或API可访问", file=sys.stderr)
        return

    source_info = " + ".join(data_sources) if data_sources else "未知"

    reports = []

    if mode == "personal":
        target_user = args.user_name or username
        if not target_user:
            print("错误: 个人周报需要指定 --user 参数", file=sys.stderr)
            return
        if target_user not in users_data:
            print(f"错误: 未找到用户 {target_user} 的日报", file=sys.stderr)
            return
        report = generate_personal_week_report(
            target_user, users_data, week_start, week_end
        )
        if report:
            reports.append(report)
    elif mode == "project":
        target_project = args.project_code
        if target_project:
            if target_project not in projects_data:
                print(f"错误: 未找到项目 {target_project} 的日报", file=sys.stderr)
                return
            report = generate_project_week_report(
                target_project, projects_data[target_project], week_start, week_end
            )
            if report:
                reports.append(report)
        else:
            for project_code, project_data in sorted(projects_data.items()):
                report = generate_project_week_report(
                    project_code, project_data, week_start, week_end
                )
                if report:
                    reports.append(report)
    else:
        for project_code, project_data in sorted(projects_data.items()):
            report = generate_project_week_report(
                project_code, project_data, week_start, week_end
            )
            if report:
                reports.append(report)

    if not reports:
        print("警告: 未能生成周报数据", file=sys.stderr)
        return

    print("=" * 60, file=sys.stderr)
    print(f"周报预览（{len(reports)} 份，数据来源: {source_info}）", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    for report in reports:
        print(format_report_for_display(report, mode), file=sys.stderr)
        print(file=sys.stderr)

    print("=" * 60, file=sys.stderr)

    if args.review:
        print("\n预览完成。使用 --submit 参数确认并提交。", file=sys.stderr)
        return

    if args.submit:
        if mode != "personal":
            print(
                "提示: 只有个人周报才需要提交，项目周报和部门周报不需要提交",
                file=sys.stderr,
            )
            return

        if not username or not password:
            print("错误: 需要登录凭据", file=sys.stderr)
            return

        submit_reports = []
        for report in reports:
            submit_reports.append(
                {
                    "weekPlanNow": report["weekPlanNow"],
                    "chanceProjectName": report["chanceProjectName"],
                    "chanceProjectSchedule": report["chanceProjectSchedule"],
                    "projectCode": report["projectCode"],
                    "projectManager": report["projectManager"],
                    "weekSummarizeNow": report["weekSummarizeNow"],
                    "weekPlanNext": report["weekPlanNext"],
                    "problemRisk": report["problemRisk"],
                    "requestInstructions": report["requestInstructions"],
                    "weekStartTime": report["weekStartTime"],
                    "weekEndTime": report["weekEndTime"],
                    "weekReportType": report["weekReportType"],
                }
            )

        try:
            token = login(base_url, username, password)
            url = f"{base_url}{WEEK_REPORT_ENDPOINT}"
            result = fetch_json_post(url, submit_reports, token)

            if result.get("code") == 0 or result.get("success"):
                print("周报提交成功", file=sys.stderr)
            else:
                print(f"周报提交失败: {result.get('message', result)}", file=sys.stderr)
        except Exception as e:
            print(f"[周报] 错误: {e}", file=sys.stderr)
        return


if __name__ == "__main__":
    main()
