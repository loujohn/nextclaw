#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io
import locale

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

if sys.platform == "win32":
    import ctypes

    ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

"""
日报填写脚本

用法:
  python daily-report.py --query-projects <项目名称关键词>
  python daily-report.py --submit --project-code <编号> --project-name <名称> ...
"""

import os
import sys
import re
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta

DEFAULT_BASE_URL = "http://shangji.dcg-internal-services.dev.dcginner:10003"
LOGIN_ENDPOINT = "/admin/oauth2/token"
REPORT_ENDPOINT = "/admin/dayReport"
PROJECT_QUERY_ENDPOINT = "/admin/project/pageProject"

REQUIRED_FIELDS = [
    ("date", "日期"),
    ("projectName", "项目名称"),
    ("projectStage", "项目阶段"),
    ("projectCode", "项目编号"),
    ("projectManager", "项目经理"),
    ("daySummarizeNow", "当日工作总结"),
    ("dayPlanNext", "次日工作计划"),
    ("dayReportType", "日报类型"),
]

REQUIRED_FIELDS_WITH_TIME = REQUIRED_FIELDS + [
    ("dayReportTime", "日报时间"),
]


def get_env(key, default=None):
    return os.environ.get(key, default)


PM_BASE_URL = get_env("PM_BASE_URL", DEFAULT_BASE_URL)
PM_BASIC_AUTH = get_env("PM_BASIC_AUTH", "")
PM_USERNAME = get_env("PM_USERNAME", "admin")
PM_PASSWORD = get_env("PM_PASSWORD", "")


def post_form(url, form_data, timeout=120):
    """POST表单请求（用于登录）"""
    data = urllib.parse.urlencode(form_data).encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "nextclaw-daily-report/1.0",
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


def fetch_json(url, token, timeout=120):
    """GET请求（需要Bearer token）"""
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-daily-report/1.0",
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


def fetch_json_post(url, data, token, timeout=120, params=None):
    body = json.dumps(data).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-daily-report/1.0",
    }

    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

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
    """OAuth2登录获取token"""
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


def query_projects(base_url, token, project_name=None, current=1, size=50):
    """查询项目列表（POST，参数通过URL传递）"""
    url = (
        f"{base_url}{PROJECT_QUERY_ENDPOINT}?current={current}&size={size}&queryType=3"
    )
    if project_name:
        url += f"&projectName={urllib.parse.quote(project_name)}"
    return fetch_json_post(url, {}, token)


def format_projects_for_selection(records, total=0):
    """格式化项目列表供用户选择"""
    if not records:
        return "未找到匹配的项目"

    lines = [f"共找到 {total} 个项目，请确认要填写的项目：\n"]
    for i, p in enumerate(records, 1):
        project_code = p.get("projectCode", "")
        project_name = p.get("projectName", "")
        manager = p.get("projectManager", "")
        stage = p.get("projectStageNewName", "")
        lines.append(
            f"{i}. {project_name}（编号: {project_code}，经理: {manager}，阶段: {stage}）"
        )
    lines.append("\n请回复数字选择，或提供更准确的项目名称。")
    if total > len(records):
        lines.append(
            f"\n（显示前 {len(records)} 条，共有 {total} 条，可输入更精确的关键词缩小范围）"
        )
    return "\n".join(lines)


def get_project_info(records, index):
    """从查询结果中获取项目信息"""
    if index < 1 or index > len(records):
        return None
    p = records[index - 1]
    return {
        "projectName": p.get("projectName", ""),
        "projectCode": p.get("projectCode", ""),
        "projectManager": p.get("projectManager", ""),
        "projectStage": p.get("projectStageNewName", ""),
    }


def normalize_field_names(data):
    """统一字段名：双向转换（用户字段 <-> 接口字段）"""
    if "chanceProjectName" in data and "projectName" not in data:
        data["projectName"] = data["chanceProjectName"]
    if "projectName" in data and "chanceProjectName" not in data:
        data["chanceProjectName"] = data["projectName"]
    if "chanceProjectSchedule" in data and "projectStage" not in data:
        data["projectStage"] = data["chanceProjectSchedule"]
    if "projectStage" in data and "chanceProjectSchedule" not in data:
        data["chanceProjectSchedule"] = data["projectStage"]
    return data


def validate_report_data(data):
    """校验日报数据，返回缺失字段列表"""
    missing = []
    for field_key, field_name in REQUIRED_FIELDS:
        if field_key not in data or data[field_key] is None or data[field_key] == "":
            missing.append((field_key, field_name))

    if "dayReportTime" not in data or not data["dayReportTime"]:
        if "date" in data and data["date"]:
            data["dayReportTime"] = data["date"]
        else:
            missing.append(("dayReportTime", "日报时间"))

    if "date" not in data or not data["date"]:
        if "dayReportTime" in data and data["dayReportTime"]:
            data["date"] = data["dayReportTime"]
        else:
            missing.append(("date", "日期"))

    return missing


def prepare_report_data(report_data, login_user=None, login_name=None):
    """准备提交数据，自动设置工时比例为0"""
    normalize_field_names(report_data)

    proportion = 0.0

    return {
        "date": report_data.get("date", ""),
        "dayPlanNow": "无",
        "chanceProjectName": report_data.get("chanceProjectName", ""),
        "workHourProportion": proportion,
        "chanceProjectSchedule": report_data.get("chanceProjectSchedule", ""),
        "projectCode": report_data.get("projectCode", ""),
        "projectManager": report_data.get("projectManager", ""),
        "workHourProportionStatus": report_data.get("workHourProportionStatus", 0),
        "daySummarizeNow": report_data.get("daySummarizeNow", ""),
        "dayPlanNext": report_data.get("dayPlanNext", ""),
        "problemRisk": report_data.get("problemRisk", ""),
        "requestInstructions": report_data.get("requestInstructions", ""),
        "accompanyingPersonnelList": report_data.get("accompanyingPersonnelList", []),
        "dayReportTime": report_data.get("dayReportTime", report_data.get("date", "")),
        "dayReportType": report_data.get("dayReportType", 2),
    }


def submit_report(base_url, token, report_data, login_user=None, login_name=None):
    """提交日报"""
    url = f"{base_url}{REPORT_ENDPOINT}"
    data = [prepare_report_data(report_data, login_user, login_name)]

    report_user = login_user or login_name or ""
    params = None
    if report_user:
        params = {"createBy": report_user}

    return fetch_json_post(url, data, token, params=params)


def get_week_range(date_str):
    """获取某日期所在周的起止时间"""
    date = datetime.strptime(date_str, "%Y-%m-%d")
    monday = date - timedelta(days=date.weekday())
    sunday = monday + timedelta(days=6)
    return monday.strftime("%Y-%m-%d"), sunday.strftime("%Y-%m-%d")


def append_to_file(filepath, content):
    """追加内容到文件（不存在则创建）"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(content)


def generate_daily_report_md_files(report_data, report_user, report_name=None):
    """生成两个维度的日报汇总MD文件"""
    report_date = report_data.get("date", "")
    project_code = report_data.get("projectCode", "")
    project_name = report_data.get(
        "chanceProjectName", report_data.get("projectName", "")
    )
    project_manager = report_data.get("projectManager", "")
    create_by = report_data.get("createBy") or report_user or ""
    user_display_name = report_name or create_by

    summarize = report_data.get("daySummarizeNow", "无")
    plan = report_data.get("dayPlanNext", "无")
    summarize = (
        summarize.replace("今日：", "").replace("今日:", "").replace("今日", "").strip()
    )
    plan = plan.replace("明日：", "").replace("明日:", "").replace("明日", "").strip()

    week_start, week_end = get_week_range(report_date)

    base_dir = os.path.join(os.path.expanduser("~"), "nextclaw-temp", "daily-report")
    week_dir = os.path.join(base_dir, f"{week_start}_{week_end}")
    os.makedirs(week_dir, exist_ok=True)

    # 保存原始数据JSON
    raw_json_file = os.path.join(week_dir, "raw_dailies.json")
    raw_data = []
    if os.path.exists(raw_json_file):
        with open(raw_json_file, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

    # 检查是否已存在相同记录（同一日期、同一项目、同一填报人）
    exists = any(
        d.get("date") == report_date
        and d.get("projectCode") == project_code
        and d.get("createBy") == create_by
        for d in raw_data
    )
    if not exists:
        raw_data.append(
            {
                "date": report_date,
                "projectCode": project_code,
                "projectName": project_name,
                "projectManager": project_manager,
                "createBy": create_by,
                "createName": user_display_name,
                "summarize": summarize or "无",
                "plan": plan or "无",
                "submittedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
        )
        with open(raw_json_file, "w", encoding="utf-8") as f:
            json.dump(raw_data, f, ensure_ascii=False, indent=2)

    projects_file = os.path.join(week_dir, "projects.md")
    users_file = os.path.join(week_dir, "users.md")

    # 项目维度：项目 -> 日期 -> 人员 -> 日报
    projects_data = _load_md_structure(projects_file)
    if project_code not in projects_data:
        projects_data[project_code] = {
            "name": project_name,
            "manager": project_manager,
            "dates": {},
        }
    if report_date not in projects_data[project_code]["dates"]:
        projects_data[project_code]["dates"][report_date] = {}
    projects_data[project_code]["dates"][report_date][user_display_name] = {
        "summarize": summarize or "无",
        "plan": plan or "无",
    }
    _save_projects_md(projects_file, projects_data, week_start, week_end)

    # 人员维度：人员 -> 日期 -> 项目 -> 日报
    users_data = _load_users_md_structure(users_file)
    if user_display_name not in users_data:
        users_data[user_display_name] = {"dates": {}}
    if report_date not in users_data[user_display_name]["dates"]:
        users_data[user_display_name]["dates"][report_date] = {}
    users_data[user_display_name]["dates"][report_date][project_name] = {
        "projectName": project_name,
        "manager": project_manager,
        "summarize": summarize or "无",
        "plan": plan or "无",
    }
    _save_users_md(users_file, users_data, week_start, week_end)

    return week_dir


def _load_md_structure(filepath):
    """加载项目维度的结构化数据"""
    data = {}
    if not os.path.exists(filepath):
        return data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    current_project = None
    current_date = None

    for line in lines:
        if line.startswith("## "):
            match = re.match(r"## (.+?)（(.+?)）", line)
            if match:
                project_name = match.group(1)
                project_code = match.group(2)
                current_project = project_code
                if project_code not in data:
                    data[project_code] = {
                        "name": project_name,
                        "manager": "",
                        "dates": {},
                    }
        elif line.startswith("**经理**: "):
            if current_project:
                data[current_project]["manager"] = line.replace("**经理**: ", "")
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_project and current_date:
                if current_date not in data[current_project]["dates"]:
                    data[current_project]["dates"][current_date] = {}
        elif line.startswith("- **"):
            parts = line.split("**")
            if len(parts) >= 3 and current_project and current_date:
                user_name = parts[1]
                rest = parts[2].replace("**：", "").replace("：", "").strip()
                if "。" in rest:
                    summarize, plan_part = rest.split("。", 1)
                    plan = plan_part.replace("明日：", "").strip()
                else:
                    summarize = rest
                    plan = ""
                data[current_project]["dates"][current_date][user_name] = {
                    "summarize": summarize.replace("今日：", "").strip(),
                    "plan": plan,
                }
    return data


def _load_users_md_structure(filepath):
    """加载人员维度的结构化数据"""
    data = {}
    if not os.path.exists(filepath):
        return data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    current_user = None
    current_date = None

    for line in lines:
        if line.startswith("## "):
            current_user = line.replace("## ", "").strip()
            if current_user not in data:
                data[current_user] = {"dates": {}}
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_user and current_date:
                if current_date not in data[current_user]["dates"]:
                    data[current_user]["dates"][current_date] = {}
        elif line.startswith("- **"):
            parts = line.split("**")
            if len(parts) >= 3 and current_user and current_date:
                project_name = parts[1]
                rest = parts[2].replace("**：", "").replace("：", "").strip()
                if "。" in rest:
                    summarize, plan_part = rest.split("。", 1)
                    plan = plan_part.replace("明日：", "").strip()
                else:
                    summarize = rest
                    plan = ""
                data[current_user]["dates"][current_date][project_name] = {
                    "projectName": project_name,
                    "summarize": summarize.replace("今日：", "").strip(),
                    "plan": plan,
                }
    return data


def _save_projects_md(filepath, data, week_start, week_end):
    """保存项目维度的MD文件"""
    lines = []
    lines.append("# 本周项目日报汇总\n")
    lines.append(f"> 统计周期：{week_start} ~ {week_end}\n")

    for project_code in sorted(data.keys()):
        project = data[project_code]
        lines.append(f"\n## {project['name']}（{project_code}）\n")
        if project["manager"]:
            lines.append(f"**经理**: {project['manager']}\n")

        for date in sorted(project["dates"].keys()):
            lines.append(f"\n### {date}\n")
            for user_name, user_data in sorted(project["dates"][date].items()):
                summarize = user_data.get("summarize", "无")
                plan = user_data.get("plan", "无")
                summarize = (
                    summarize.replace("今日：", "")
                    .replace("今日:", "")
                    .replace("今日", "")
                    .strip()
                )
                plan = (
                    plan.replace("明日：", "")
                    .replace("明日:", "")
                    .replace("明日", "")
                    .strip()
                )
                if summarize == "无":
                    continue
                if plan and plan != "无":
                    lines.append(
                        f"- **{user_name}**：今日：{summarize}。明日：{plan}\n"
                    )
                else:
                    lines.append(f"- **{user_name}**：今日：{summarize}\n")
        lines.append("\n---\n")

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)


def _save_users_md(filepath, data, week_start, week_end):
    """保存人员维度的MD文件"""
    lines = []
    lines.append("# 本周个人日报汇总\n")
    lines.append(f"> 统计周期：{week_start} ~ {week_end}\n")

    for user_name in sorted(data.keys()):
        user = data[user_name]
        lines.append(f"\n## {user_name}\n")

        for date in sorted(user["dates"].keys()):
            lines.append(f"\n### {date}\n")
            for project_name, project_data in sorted(user["dates"][date].items()):
                summarize = project_data.get("summarize", "无")
                plan = project_data.get("plan", "无")
                project_name = project_data.get("projectName", project_name)
                summarize = (
                    summarize.replace("今日：", "")
                    .replace("今日:", "")
                    .replace("今日", "")
                    .strip()
                )
                plan = (
                    plan.replace("明日：", "")
                    .replace("明日:", "")
                    .replace("明日", "")
                    .strip()
                )
                if summarize == "无":
                    continue
                if plan and plan != "无":
                    lines.append(
                        f"- **{project_name}**：今日：{summarize}。明日：{plan}\n"
                    )
                else:
                    lines.append(f"- **{project_name}**：今日：{summarize}\n")
        lines.append("\n---\n")

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)


def format_missing_fields_message(missing):
    """格式化缺失字段提示"""
    lines = ["请补充以下信息："]
    name_map = {
        "date": "日期",
        "projectName": "项目名称",
        "projectStage": "项目阶段",
        "projectCode": "项目编号",
        "projectManager": "项目经理",
        "daySummarizeNow": "今日工作总结",
        "dayPlanNext": "明日工作计划",
        "dayReportType": "日报类型",
    }
    for i, (key, name) in enumerate(missing, 1):
        display_name = name_map.get(key, name)
        lines.append(f"{i}. {display_name}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="日报填写脚本")
    parser.add_argument(
        "--submit",
        dest="submit",
        action="store_true",
        help="生成参数文件并提交",
    )
    parser.add_argument(
        "--validate", dest="validate", action="store_true", help="仅校验参数"
    )
    parser.add_argument(
        "--json-file", dest="json_file", help="从文件读取日报参数（备用）"
    )
    parser.add_argument("--date", dest="date", help="日期（YYYY-MM-DD，默认当天）")
    parser.add_argument("--project-code", dest="project_code", help="项目编号")
    parser.add_argument("--project-name", dest="project_name", help="项目名称")
    parser.add_argument("--project-stage", dest="project_stage", help="项目阶段")
    parser.add_argument("--project-manager", dest="project_manager", help="项目经理")
    parser.add_argument(
        "--day-summarize-now", dest="day_summarize_now", help="今日工作总结"
    )
    parser.add_argument("--day-plan-next", dest="day_plan_next", help="明日工作计划")
    parser.add_argument("--problem-risk", dest="problem_risk", help="问题与风险（选填）")
    parser.add_argument(
        "--request-instructions", dest="request_instructions", help="请示事项（选填）"
    )
    parser.add_argument(
        "--day-report-type",
        dest="day_report_type",
        type=int,
        default=2,
        help="日报类型（默认2）",
    )
    parser.add_argument(
        "-q",
        "--query-projects",
        dest="query_projects",
        nargs="?",
        const="",
        default=None,
        type=str,
        help="根据项目名称查询项目列表（可选，不传则查询全部）",
    )
    parser.add_argument(
        "--select", dest="select", help="从查询结果中选择项目（数字索引）"
    )
    parser.add_argument("--report-user", dest="report_user", help="填报人用户名（默认为登录用户）")
    parser.add_argument("--report-name", dest="report_name", help="填报人姓名（默认为登录用户名）")

    args = parser.parse_args()

    base_url = PM_BASE_URL
    username = PM_USERNAME
    password = PM_PASSWORD

    if (
        not args.submit
        and not args.validate
        and args.query_projects is None
        and not args.select
    ):
        print("""
日报填写脚本

用法:
  python daily-report.py --query-projects <项目名称关键词>
  python daily-report.py --submit --project-code <编号> --project-name <名称> ...
""")
        return

    temp_dir = os.path.join(os.path.expanduser("~"), "nextclaw-temp", "daily-report")

    def get_week_dir(date_str=None):
        if date_str:
            date = datetime.strptime(date_str, "%Y-%m-%d")
        else:
            date = datetime.now()
        monday = date - timedelta(days=date.weekday())
        sunday = monday + timedelta(days=6)
        return os.path.join(
            temp_dir, f"{monday.strftime('%Y-%m-%d')}_{sunday.strftime('%Y-%m-%d')}"
        )

    report_user = args.report_user or "unknown"
    report_name = args.report_name or report_user

    query_file_name = (
        f"projects_query_{report_user}.json"
        if report_user
        else f"projects_query_{username}.json"
    )

    if args.query_projects is not None:
        if not username or not password:
            print("错误: 需要登录凭据", file=sys.stderr)
            return
        try:
            token = login(base_url, username, password)
            result = query_projects(base_url, token, args.query_projects)
            if result.get("code") == 0 and result.get("data"):
                records = result["data"].get("records", [])
                total = result["data"].get("total", 0)
                week_dir = get_week_dir()
                os.makedirs(week_dir, exist_ok=True)
                query_file = os.path.join(week_dir, query_file_name)
                with open(query_file, "w", encoding="utf-8") as f:
                    json.dump(
                        {"records": records, "total": total}, f, ensure_ascii=False
                    )
                print(format_projects_for_selection(records, total))
                print(
                    f"\n请使用 --select <数字> 选择项目",
                    file=sys.stderr,
                )
            else:
                print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
                return
        except Exception as e:
            print(f"[日报] 错误: {e}", file=sys.stderr)
            return
        return

    if args.select:
        week_dir = get_week_dir()
        query_file = os.path.join(week_dir, query_file_name)
        if not os.path.exists(query_file):
            print(
                "错误: 没有可选择的项目，请先使用 --query-projects 查询",
                file=sys.stderr,
            )
            return
        with open(query_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            records = data.get("records", [])
        project_info = get_project_info(records, int(args.select))
        if not project_info:
            print(
                f"错误: 无效的选择，请输入 1-{len(records)} 之间的数字", file=sys.stderr
            )
            return
        print(json.dumps(project_info, ensure_ascii=False, indent=2))
        return
        with open(query_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            records = data.get("records", [])

        select_str = args.select.replace(",", " ").replace("，", " ")
        indices = []
        for part in select_str.split():
            if part.strip().isdigit():
                indices.append(int(part.strip()))

        if not indices:
            print(
                f"错误: 无效的选择，请输入 1-{len(records)} 之间的数字", file=sys.stderr
            )
            return

        project_infos = []
        for idx in indices:
            if idx < 1 or idx > len(records):
                print(
                    f"错误: 无效的选择 {idx}，有效范围 1-{len(records)}",
                    file=sys.stderr,
                )
                return
            project_infos.append(get_project_info(records, idx))

        print(json.dumps(project_infos, ensure_ascii=False, indent=2))
        return

    if args.validate:
        report_data = {}
        if args.json_file:
            try:
                with open(args.json_file, "r", encoding="utf-8") as f:
                    report_data = json.load(f)
            except json.JSONDecodeError as e:
                print(f"错误: JSON格式解析失败: {e}", file=sys.stderr)
                return
        else:
            if args.project_code:
                report_data["projectCode"] = args.project_code
            if args.project_name:
                report_data["projectName"] = args.project_name
            if args.project_stage:
                report_data["projectStage"] = args.project_stage
            if args.project_manager:
                report_data["projectManager"] = args.project_manager
            if args.day_summarize_now:
                report_data["daySummarizeNow"] = args.day_summarize_now
            if args.day_plan_next:
                report_data["dayPlanNext"] = args.day_plan_next
            if args.problem_risk:
                report_data["problemRisk"] = args.problem_risk
            if args.request_instructions:
                report_data["requestInstructions"] = args.request_instructions
            if args.date:
                report_data["date"] = args.date
                report_data["dayReportTime"] = args.date
            else:
                report_data["date"] = datetime.now().strftime("%Y-%m-%d")
                report_data["dayReportTime"] = report_data["date"]
            report_data["dayReportType"] = args.day_report_type

        normalize_field_names(report_data)
        missing = validate_report_data(report_data)
        if missing:
            print(format_missing_fields_message(missing), file=sys.stderr)
            return
        print(
            json.dumps(
                {"valid": True, "data": report_data}, ensure_ascii=False, indent=2
            )
        )
        return

    report_data = {}
    if args.json_file:
        try:
            with open(args.json_file, "r", encoding="utf-8") as f:
                report_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"错误: JSON格式解析失败: {e}", file=sys.stderr)
            return

    if args.project_code:
        report_data["projectCode"] = args.project_code
    if args.project_name:
        report_data["projectName"] = args.project_name
    if args.project_stage:
        report_data["projectStage"] = args.project_stage
    if args.project_manager:
        report_data["projectManager"] = args.project_manager
    if args.day_summarize_now:
        report_data["daySummarizeNow"] = args.day_summarize_now
    if args.day_plan_next:
        report_data["dayPlanNext"] = args.day_plan_next
    if args.problem_risk:
        report_data["problemRisk"] = args.problem_risk
    if args.request_instructions:
        report_data["requestInstructions"] = args.request_instructions
    if args.date:
        report_data["date"] = args.date
        report_data["dayReportTime"] = args.date
    elif "date" not in report_data:
        report_data["date"] = datetime.now().strftime("%Y-%m-%d")
        report_data["dayReportTime"] = report_data["date"]

    report_data["dayReportType"] = args.day_report_type

    normalize_field_names(report_data)
    missing = validate_report_data(report_data)

    if missing:
        print(format_missing_fields_message(missing), file=sys.stderr)
        return

    prepared_data = prepare_report_data(report_data)

    print("=" * 50, flush=True)
    print("日报预览：", flush=True)
    print("=" * 50, flush=True)
    print(f"日期：{prepared_data['date']}", flush=True)
    print(f"项目：{prepared_data['chanceProjectName']}", flush=True)
    print(f"编号：{prepared_data['projectCode']}", flush=True)
    print(f"经理：{prepared_data['projectManager']}", flush=True)
    print(f"阶段：{prepared_data['chanceProjectSchedule']}", flush=True)
    print(f"工时：{prepared_data['workHourProportion']}", flush=True)
    print(f"今日总结：{prepared_data['daySummarizeNow']}", flush=True)
    print(f"明日计划：{prepared_data['dayPlanNext']}", flush=True)
    print("=" * 50, flush=True)
    print(flush=True)

    week_dir = get_week_dir(prepared_data["date"])
    os.makedirs(week_dir, exist_ok=True)

    now = datetime.now().strftime("%Y%m%d%H%M%S")
    file_user = args.report_user if args.report_user else username
    file_name = f"param_{prepared_data['projectCode']}_{file_user}_{now}.json"
    param_file = os.path.join(week_dir, file_name)

    with open(param_file, "w", encoding="utf-8") as f:
        json.dump(prepared_data, f, ensure_ascii=False, indent=2)

    print(f"[日报] 参数文件已生成：{param_file}", flush=True)

    if not username or not password:
        print("错误: 需要登录凭据", file=sys.stderr)
        if os.path.exists(param_file):
            os.remove(param_file)
        return

    try:
        print("[日报] 正在登录...", flush=True)
        token = login(base_url, username, password)
        print("[日报] 登录成功", flush=True)

        print("[日报] 正在提交日报...", flush=True)
        sys.stdout.flush()

        if report_user == "unknown":
            print("[日报] 错误: 请确认填报人信息", file=sys.stderr)
            if os.path.exists(param_file):
                os.remove(param_file)
            return

        report_name = args.report_name or report_user

        result = submit_report(base_url, token, prepared_data, report_user, report_name)

        if result.get("code") == 0:
            try:
                result_data = result.get("data", {})
                if isinstance(result_data, str):
                    result_data = {}
                prepared_data.update(result_data)
            except:
                pass

            md_dir = generate_daily_report_md_files(prepared_data, report_user, report_name)

            print("", flush=True)
            print("==================================================", flush=True)
            print("【成功】日报提交成功", flush=True)
            print("【存档】MD文件已生成", flush=True)
            print("==================================================", flush=True)
        else:
            error_msg = result.get("message", "提交失败")
            try:
                inner_error = json.loads(error_msg)
                error_text = inner_error.get("msg", error_msg)
            except:
                error_text = error_msg

            print("", flush=True)
            print("==================================================", flush=True)
            print(f"【错误】{error_text}", flush=True)
            print("==================================================", flush=True)
            print("", flush=True)
            if os.path.exists(param_file):
                os.remove(param_file)
            return

    except Exception as e:
        print(f"[日报] 运行时错误: {e}", flush=True)
        if os.path.exists(param_file):
            os.remove(param_file)
        return


if __name__ == "__main__":
    main()
