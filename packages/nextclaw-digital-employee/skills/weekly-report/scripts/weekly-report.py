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
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta

DEFAULT_BASE_URL = "http://shangji.dcg-internal-services.dev.dcginrow"
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


def query_daily_reports(base_url, token, week_start, week_end, page=1, size=50):
    start_str = week_start.strftime("%Y-%m-%d 00:00:00")
    end_str = week_end.strftime("%Y-%m-%d 00:00:00")
    params = {
        "dayReportTimeQuery[0]": week_start.strftime("%Y-%m-%d"),
        "dayReportTimeQuery[1]": week_end.strftime("%Y-%m-%d"),
        "dayReportType": 2,
        "queryType": 2,
        "current": page,
        "size": size,
    }
    url = f"{base_url}{DAY_REPORT_QUERY_ENDPOINT}?{urllib.parse.urlencode(params)}"
    return fetch_json_get(url, token)


def format_daily_reports_for_review(records):
    if not records:
        return "本周暂无日报记录"

    lines = ["=" * 60]
    lines.append("本周日报汇总（用于生成周报）")
    lines.append("=" * 60)

    project_groups = {}
    for record in records:
        project_code = record.get("projectCode", "未知项目")
        if project_code not in project_groups:
            project_groups[project_code] = {
                "projectName": record.get("projectName", ""),
                "projectManager": record.get("projectManager", ""),
                "projectStage": record.get("projectStage", ""),
                "daily_reports": [],
            }
        project_groups[project_code]["daily_reports"].append(record)

    for project_code, group in project_groups.items():
        lines.append("")
        lines.append(f"【项目】{group['projectName']} ({project_code})")
        lines.append(f"  项目经理: {group['projectManager']}")
        lines.append(f"  项目阶段: {group['projectStage']}")
        lines.append("  日报汇总:")
        for report in group["daily_reports"]:
            date = report.get("reportDate", report.get("createTime", "")[:10])
            summarize = report.get("daySummarizeNow", "")
            plan = report.get("dayPlanNext", "")
            lines.append(f"    - {date}:")
            if summarize:
                lines.append(f"      今日: {summarize}")
            if plan:
                lines.append(f"      明日: {plan}")

    lines.append("")
    lines.append("=" * 60)
    return "\n".join(lines)


def validate_week_report_fields(data):
    errors = []
    required_fields = [
        ("weekSummarizeNow", "本周工作总结"),
        ("weekPlanNext", "下周工作计划"),
        ("projectCode", "项目编号"),
        ("projectName", "项目名称"),
        ("projectManager", "项目经理"),
        ("weekStartTime", "周开始时间"),
        ("weekEndTime", "周结束时间"),
    ]
    for field, label in required_fields:
        if not data.get(field):
            errors.append(f"缺少必填字段: {label}")

    if data.get("weekReportType") is None:
        data["weekReportType"] = 2

    return errors


def deduplicate_and_summarize(items):
    seen = set()
    result = []
    for item in items:
        parts = item.replace("；", ";").split(";")
        for part in parts:
            normalized = part.strip()
            if len(normalized) < 2:
                continue
            if normalized.isdigit():
                continue
            if normalized in ["无", "暂无", "暂无计划", "无工作"]:
                continue
            if normalized not in seen:
                seen.add(normalized)
                result.append(normalized)
    return result


def smart_summarize(daily_records):
    if not daily_records:
        return "本周暂无工作总结"

    summarizes = []
    for r in daily_records:
        text = r.get("daySummarizeNow", "").strip()
        if text and text not in ["无", "暂无", "暂无工作"]:
            summarizes.append(text)

    if not summarizes:
        return "本周暂无工作总结"

    summarized = deduplicate_and_summarize(summarizes)
    lines = []
    for i, item in enumerate(summarized, 1):
        lines.append(f"{i}. {item}")
    return "\n".join(lines)


def smart_plan(daily_records, week_end):
    if not daily_records:
        return "下周暂无明确工作计划"

    records_by_date = {}
    for r in daily_records:
        date_str = r.get("dayReportTime", "")[:10]
        if date_str:
            if date_str not in records_by_date:
                records_by_date[date_str] = []
            records_by_date[date_str].append(r)

    sorted_dates = sorted(records_by_date.keys(), reverse=True)

    plans = []
    for r in daily_records:
        text = r.get("dayPlanNext", "").strip()
        if text and text not in ["无", "暂无", "暂无计划"]:
            plans.append(text)

    if not plans:
        return "继续推进项目进度"

    return "；".join(deduplicate_and_summarize(plans))


def generate_week_report_from_dailies(daily_records, week_start, week_end):
    if not daily_records:
        return None

    project_groups = {}
    for record in daily_records:
        project_code = record.get("projectCode", "未知项目")
        if project_code not in project_groups:
            project_groups[project_code] = {
                "projectName": record.get(
                    "chanceProjectName", record.get("projectName", "")
                ),
                "projectManager": record.get("projectManager", ""),
                "projectStage": record.get(
                    "chanceProjectSchedule", record.get("projectStage", "")
                ),
                "records": [],
            }
        project_groups[project_code]["records"].append(record)

    reports = []
    for project_code, group in project_groups.items():
        week_summarize = smart_summarize(group["records"])
        week_plan = smart_plan(group["records"], week_end)

        report = {
            "weekPlanNow": "无",
            "date": f"{week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}",
            "chanceProjectName": group["projectName"],
            "chanceProjectSchedule": group["projectStage"] or "项目进行中",
            "projectCode": project_code,
            "projectManager": group["projectManager"],
            "weekSummarizeNow": week_summarize,
            "weekPlanNext": week_plan,
            "problemRisk": "无",
            "requestInstructions": "无",
            "weekStartTime": f"{week_start.strftime('%Y-%m-%d')} 00:00:00",
            "weekEndTime": f"{week_end.strftime('%Y-%m-%d')} 23:59:59",
            "weekReportType": 2,
        }
        reports.append(report)

    return reports


def main():
    parser = argparse.ArgumentParser(
        description="项目周报生成脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--query-dailies", action="store_true", help="查询本周日报")
    parser.add_argument("--submit", action="store_true", help="提交周报")
    parser.add_argument("--review", action="store_true", help="预览周报（不提交）")
    parser.add_argument("--validate", action="store_true", help="校验周报参数")
    parser.add_argument(
        "--username", default=PM_USERNAME, help="用户名（环境变量 PM_USERNAME）"
    )
    parser.add_argument(
        "--password", default=PM_PASSWORD, help="密码（环境变量 PM_PASSWORD）"
    )
    parser.add_argument("--json-file", help="从JSON文件读取周报参数")
    parser.add_argument("--project-code", help="项目编号")
    parser.add_argument("--project-name", help="项目名称")
    parser.add_argument("--project-manager", help="项目经理")
    parser.add_argument("--week-summarize", dest="week_summarize", help="本周工作总结")
    parser.add_argument("--week-plan", dest="week_plan", help="下周工作计划")
    parser.add_argument("--problem-risk", dest="problem_risk", help="问题与风险")
    parser.add_argument(
        "--request-instructions", dest="request_instructions", help="请示事项"
    )
    parser.add_argument(
        "--week-report-type",
        dest="week_report_type",
        type=int,
        default=2,
        help="周报类型（默认2）",
    )
    parser.add_argument(
        "--week-start-time",
        dest="week_start_time",
        help="周开始时间 YYYY-MM-DD HH:MM:SS",
    )
    parser.add_argument(
        "--week-end-time", dest="week_end_time", help="周结束时间 YYYY-MM-DD HH:MM:SS"
    )
    parser.add_argument("--size", type=int, default=50, help="查询每页大小")
    args = parser.parse_args()

    base_url = PM_BASE_URL
    username = args.username
    password = args.password

    if args.query_dailies:
        if not username or not password:
            print("错误: 需要登录凭据", file=sys.stderr)
            print("设置环境变量或使用 --username --password 参数", file=sys.stderr)
            return

        temp_dir = os.path.join(
            os.path.expanduser("~"), "nextclaw-temp", "weekly-report"
        )
        os.makedirs(temp_dir, exist_ok=True)
        query_file_name = f"daily_reports_query_{username}.json"

        try:
            token = login(base_url, username, password)
            monday, sunday = get_week_range()
            result = query_daily_reports(
                base_url, token, monday, sunday, size=args.size
            )

            if result.get("code") == 0 and result.get("data"):
                records = result["data"].get("records", [])
                total = result["data"].get("total", 0)

                query_file = os.path.join(temp_dir, query_file_name)
                with open(query_file, "w", encoding="utf-8") as f:
                    json.dump(
                        {
                            "records": records,
                            "total": total,
                            "week_start": monday.strftime("%Y-%m-%d"),
                            "week_end": sunday.strftime("%Y-%m-%d"),
                        },
                        f,
                        ensure_ascii=False,
                        indent=2,
                    )

                print(format_daily_reports_for_review(records))
                print(f"\n共 {total} 条日报记录", file=sys.stderr)
                print(f"查询结果已缓存至: {query_file}", file=sys.stderr)
                print("\n使用 --review 参数预览周报", file=sys.stderr)
                print("使用 --submit 参数提交周报", file=sys.stderr)
            else:
                print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
        except Exception as e:
            print(f"[周报] 错误: {e}", file=sys.stderr)
        return

    temp_dir = os.path.join(
        os.path.join(os.path.expanduser("~"), "nextclaw-temp", "weekly-report")
    )
    os.makedirs(temp_dir, exist_ok=True)
    query_file_name = f"daily_reports_query_{username}.json"
    query_file = os.path.join(temp_dir, query_file_name)

    if args.review or args.submit:
        if not os.path.exists(query_file):
            print(
                "错误: 没有查询数据，请先使用 --query-dailies 查询本周日报",
                file=sys.stderr,
            )
            return

        with open(query_file, "r", encoding="utf-8") as f:
            cache_data = json.load(f)
            records = cache_data.get("records", [])
            week_start_str = cache_data.get("week_start")
            week_end_str = cache_data.get("week_end")

        week_start = datetime.strptime(week_start_str, "%Y-%m-%d")
        week_end = datetime.strptime(week_end_str, "%Y-%m-%d")

        week_reports = generate_week_report_from_dailies(records, week_start, week_end)

        if not week_reports:
            print("警告: 未能生成周报数据", file=sys.stderr)
            return

        print("=" * 60, file=sys.stderr)
        print("周报预览（确认后将提交以下数据）", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        print(json.dumps(week_reports, ensure_ascii=False, indent=2), file=sys.stderr)
        print("=" * 60, file=sys.stderr)

        if args.review:
            print("\n预览完成。使用 --submit 参数确认并提交。", file=sys.stderr)
            return

        if not username or not password:
            print("错误: 需要登录凭据", file=sys.stderr)
            return

        try:
            token = login(base_url, username, password)
            url = f"{base_url}{WEEK_REPORT_ENDPOINT}"
            result = fetch_json_post(url, week_reports, token)

            if result.get("code") == 0 or result.get("success"):
                print("周报提交成功", file=sys.stderr)
                if os.path.exists(query_file):
                    os.remove(query_file)
            else:
                print(f"周报提交失败: {result.get('message', result)}", file=sys.stderr)
        except Exception as e:
            print(f"[周报] 错误: {e}", file=sys.stderr)
        return

    if args.validate or args.submit:
        week_data = {}

        if args.json_file:
            with open(args.json_file, "r", encoding="utf-8") as f:
                week_data = json.load(f)
        else:
            if not args.project_code or not args.project_name:
                print("错误: 缺少项目信息", file=sys.stderr)
                return
            week_data = {
                "weekSummarizeNow": args.week_summarize or "",
                "weekPlanNext": args.week_plan or "",
                "projectCode": args.project_code,
                "projectName": args.project_name,
                "projectManager": args.project_manager or "",
                "problemRisk": args.problem_risk or "无",
                "requestInstructions": args.request_instructions or "无",
                "weekReportType": args.week_report_type,
            }

            if args.week_start_time:
                week_data["weekStartTime"] = args.week_start_time
            if args.week_end_time:
                week_data["weekEndTime"] = args.week_end_time

        errors = validate_week_report_fields(week_data)
        if errors:
            print("参数校验失败:", file=sys.stderr)
            for err in errors:
                print(f"  - {err}", file=sys.stderr)
            return

        if args.validate:
            print("参数校验通过", file=sys.stderr)
            print(json.dumps(week_data, ensure_ascii=False, indent=2))
            return

    print(
        """
项目周报生成脚本

用法:
  python weekly-report.py --query-dailies           # 查询本周日报
  python weekly-report.py --review                 # 预览周报（基于查询的日报）
  python weekly-report.py --submit                 # 确认并提交周报
  python weekly-report.py --validate --json-file <path>  # 校验周报参数
""",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
