#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

"""
日报填写脚本

前置环境变量（与工时统计分析技能共用）：
  PM_BASE_URL   - 基础URL（默认：http://shangji.dcg-internal-services.dev.dcginner:10003）
  PM_USERNAME   - 登录用户名
  PM_PASSWORD   - 登录密码

用法:
  python daily-report.py --submit --json '<json参数>'
  python daily-report.py --validate --json '<json参数>'
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime

DEFAULT_BASE_URL = "http://shangji.dcg-internal-services.dev.dcginner:10003"
LOGIN_ENDPOINT = "/admin/oauth2/token"
REPORT_ENDPOINT = "/admin/day/report"
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


def fetch_json_post(url, data, token, timeout=120):
    """POST JSON请求（需要Bearer token）"""
    body = json.dumps(data).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-daily-report/1.0",
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


def prepare_report_data(report_data):
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
        "accompanyingPersonnelList": report_data.get("accompanyingPersonnelList", []),
        "dayReportTime": report_data.get("dayReportTime", report_data.get("date", "")),
        "dayReportType": report_data.get("dayReportType", 2),
    }


def submit_report(base_url, token, report_data):
    """提交日报"""
    url = f"{base_url}{REPORT_ENDPOINT}"
    data = [prepare_report_data(report_data)]
    return fetch_json_post(url, data, token)


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
        help="生成预览并提交（需要 --confirm 确认）",
    )
    parser.add_argument(
        "--validate", dest="validate", action="store_true", help="仅校验参数"
    )
    parser.add_argument("--json", dest="json_data", help="JSON格式的日报参数")
    parser.add_argument(
        "--json-file", dest="json_file", help="从文件读取日报参数（用于实际提交）"
    )
    parser.add_argument("--date", dest="date", help="日期（YYYY-MM-DD，默认当天）")
    parser.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="仅显示预览",
    )
    parser.add_argument(
        "--confirm",
        dest="confirm",
        action="store_true",
        help="确认提交（需与 --submit 一起使用）",
    )
    parser.add_argument("--base-url", dest="base_url", help="API基础URL")
    parser.add_argument("--username", dest="username", help="登录用户名")
    parser.add_argument("--password", dest="password", help="登录密码")
    parser.add_argument(
        "--query-projects", dest="query_projects", help="根据项目名称查询项目列表"
    )
    parser.add_argument(
        "--select", dest="select", help="从查询结果中选择项目（数字索引）"
    )

    args = parser.parse_args()

    base_url = args.base_url or PM_BASE_URL
    username = args.username or PM_USERNAME
    password = args.password or PM_PASSWORD

    if (
        not args.submit
        and not args.validate
        and not args.dry_run
        and not args.query_projects
        and not args.select
        and not args.confirm
    ):
        print("""
日报填写脚本

用法:
  python daily-report.py --submit --json '<json参数>'
  python daily-report.py --validate --json '<json参数>'
  python daily-report.py --dry-run --json '<json参数>'
  python daily-report.py --query-projects <项目名称关键词>
  python daily-report.py --confirm --json-file <参数文件>

前置环境变量（与工时统计分析技能共用）：
  PM_BASE_URL   - 基础URL
  PM_USERNAME   - 登录用户名
  PM_PASSWORD   - 登录密码
""")
        return

    temp_dir = os.path.join(os.path.expanduser("~"), "nextclaw-temp", "daily-report")
    os.makedirs(temp_dir, exist_ok=True)

    if args.query_projects:
        if not username or not password:
            print("错误: 需要设置 PM_USERNAME 和 PM_PASSWORD 环境变量", file=sys.stderr)
            sys.exit(1)
        try:
            token = login(base_url, username, password)
            result = query_projects(base_url, token, args.query_projects)
            if result.get("code") == 0 and result.get("data"):
                records = result["data"].get("records", [])
                total = result["data"].get("total", 0)
                query_file = os.path.join(temp_dir, "daily_report_query.json")
                with open(query_file, "w", encoding="utf-8") as f:
                    json.dump(
                        {"records": records, "total": total}, f, ensure_ascii=False
                    )
                print(format_projects_for_selection(records, total))
                print(
                    f"\n（查询结果已缓存，如需选择项目请使用 --select <数字> 参数）",
                    file=sys.stderr,
                )
            else:
                print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
                sys.exit(1)
        except Exception as e:
            print(f"[日报] 错误: {e}", file=sys.stderr)
            sys.exit(1)
        return

    if args.select:
        query_file = os.path.join(temp_dir, "daily_report_query.json")
        if not os.path.exists(query_file):
            print(
                "错误: 没有可选择的项目，请先使用 --query-projects 查询",
                file=sys.stderr,
            )
            sys.exit(1)
        with open(query_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            records = data.get("records", [])
        project_info = get_project_info(records, int(args.select))
        if not project_info:
            print(
                f"错误: 无效的选择，请输入 1-{len(records)} 之间的数字", file=sys.stderr
            )
            sys.exit(1)
        print(json.dumps(project_info, ensure_ascii=False, indent=2))
        return

    if args.validate:
        try:
            if args.json_file:
                with open(args.json_file, "r", encoding="utf-8") as f:
                    report_data = json.load(f)
            else:
                report_data = json.loads(args.json_data)
        except json.JSONDecodeError as e:
            print(f"错误: JSON格式解析失败: {e}", file=sys.stderr)
            sys.exit(1)

        normalize_field_names(report_data)
        missing = validate_report_data(report_data)
        if missing:
            print(format_missing_fields_message(missing), file=sys.stderr)
            sys.exit(1)
        print(
            json.dumps(
                {"valid": True, "data": report_data}, ensure_ascii=False, indent=2
            )
        )
        return

    if args.confirm:
        if not args.json_file:
            print("错误: --confirm 需要配合 --json-file 使用", file=sys.stderr)
            sys.exit(1)
        try:
            with open(args.json_file, "r", encoding="utf-8") as f:
                report_data = json.load(f)
        except Exception as e:
            print(f"错误: 读取参数文件失败: {e}", file=sys.stderr)
            sys.exit(1)

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

        if not username or not password:
            print("错误: 需要设置 PM_USERNAME 和 PM_PASSWORD 环境变量", file=sys.stderr)
            sys.exit(1)

        try:
            print("[日报] 正在登录...", flush=True)
            token = login(base_url, username, password)
            print("[日报] 登录成功", flush=True)

            print("[日报] 正在提交日报...", flush=True)
            sys.stdout.flush()
            result = submit_report(base_url, token, prepared_data)

            if result.get("code") == 0:
                print("", flush=True)
                print("==================================================", flush=True)
                print("【成功】日报提交成功", flush=True)
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
                print("请根据上述错误信息决定如何处理。", flush=True)
                sys.exit(1)

        except Exception as e:
            print(f"[日报] 运行时错误: {e}", flush=True)
            sys.exit(1)
        return

    if not args.json_data and not args.json_file:
        print("错误: 需要提供 --json 或 --json-file 参数", file=sys.stderr)
        sys.exit(1)

    try:
        if args.json_file:
            with open(args.json_file, "r", encoding="utf-8") as f:
                report_data = json.load(f)
        else:
            report_data = json.loads(args.json_data)
    except json.JSONDecodeError as e:
        print(f"错误: JSON格式解析失败: {e}", file=sys.stderr)
        sys.exit(1)

    if args.date:
        report_data.setdefault("date", args.date)
        report_data.setdefault("dayReportTime", args.date)

    if not report_data.get("date"):
        today = datetime.now().strftime("%Y-%m-%d")
        report_data["date"] = today
        report_data["dayReportTime"] = today

    if "dayReportType" not in report_data:
        report_data["dayReportType"] = 2

    normalize_field_names(report_data)
    missing = validate_report_data(report_data)

    if missing:
        print(format_missing_fields_message(missing), file=sys.stderr)
        sys.exit(1)

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

    if args.dry_run:
        return

    temp_dir = os.path.join(os.path.expanduser("~"), "nextclaw-temp", "daily-report")
    os.makedirs(temp_dir, exist_ok=True)

    now = datetime.now().strftime("%Y%m%d%H%M%S")
    file_name = f"param_{prepared_data['projectCode']}_{username}_{now}.json"
    param_file = os.path.join(temp_dir, file_name)

    with open(param_file, "w", encoding="utf-8") as f:
        json.dump(prepared_data, f, ensure_ascii=False, indent=2)

    print('⚠️  请确认以上信息，确认无误后回复"确认"或"提交"', flush=True)


if __name__ == "__main__":
    main()
