#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io
import os
import json
import argparse
import urllib.request
import urllib.parse
import glob

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

PM_BASE_URL = os.environ.get("PM_BASE_URL", "")
TIMEOUT = int(os.environ.get("PM_TIMEOUT", "600000"))
BASIC_AUTH = os.environ.get("PM_BASIC_AUTH", "")
API_USERNAME = os.environ.get("PM_USERNAME", "admin")
API_PASSWORD = os.environ.get("PM_PASSWORD", "")

TEMP_DIR = os.path.expanduser("~/nextclaw-temp")
SKILL_NAME = "work-time-statistics"


def clean_previous_output(specific_file=None):
    if not os.path.exists(TEMP_DIR):
        return
    if specific_file:
        pattern = os.path.join(TEMP_DIR, f"{SKILL_NAME}_{specific_file}.json")
    else:
        pattern = os.path.join(TEMP_DIR, f"{SKILL_NAME}_*.json")
    for f in glob.glob(pattern):
        try:
            os.remove(f)
        except Exception:
            pass


def get_date_range(period):
    from datetime import datetime, timedelta, timezone

    tz = timezone(timedelta(hours=8))
    today = datetime.now(tz).date()

    if period == "本周":
        days_since_monday = today.weekday()
        week_start = today - timedelta(days=days_since_monday)
        week_end = week_start + timedelta(days=6)
        return week_start.strftime("%Y-%m-%d"), week_end.strftime("%Y-%m-%d")
    elif period == "上周":
        days_since_monday = today.weekday()
        week_start = today - timedelta(days=days_since_monday)
        prev_week_start = week_start - timedelta(days=7)
        prev_week_end = week_start - timedelta(days=1)
        return prev_week_start.strftime("%Y-%m-%d"), prev_week_end.strftime("%Y-%m-%d")
    elif period == "本月":
        month_start = today.replace(day=1)
        if today.month == 12:
            month_end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(
                days=1
            )
        else:
            month_end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
        return month_start.strftime("%Y-%m-%d"), month_end.strftime("%Y-%m-%d")
    elif period == "上月":
        first_day_this_month = today.replace(day=1)
        prev_month_end = first_day_this_month - timedelta(days=1)
        prev_month_start = prev_month_end.replace(day=1)
        return prev_month_start.strftime("%Y-%m-%d"), prev_month_end.strftime(
            "%Y-%m-%d"
        )

    return None, None


def post_form(url, form_data, timeout):
    data = urllib.parse.urlencode(form_data).encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": BASIC_AUTH,
        "Accept": "application/json",
        "User-Agent": "nextclaw-work-time-query/1.0",
    }
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout / 1000) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def fetch(url, token, timeout):
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-work-time-query/1.0",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout / 1000) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def get_token():
    if not PM_BASE_URL:
        raise Exception("PM_BASE_URL 环境变量未设置")

    token_url = f"{PM_BASE_URL}/admin/oauth2/token"
    form_data = {
        "grant_type": "password",
        "username": API_USERNAME,
        "password": API_PASSWORD,
        "login_type": "quick",
    }
    result = post_form(token_url, form_data, TIMEOUT)

    if "access_token" in result:
        return result["access_token"]
    raise Exception(f"获取Token失败: {json.dumps(result)}")


def list_projects(token):
    url = f"{PM_BASE_URL}/admin/project/getProjectCodeNameList"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "nextclaw-work-time-query/1.0",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT / 1000) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def query_work_hours(token, project_code=None, start_day=None, end_day=None):
    url = f"{PM_BASE_URL}/admin/project/workHour/getProjectUserWorkHour"
    form_data = {}
    if project_code:
        form_data["projectCode"] = project_code
    if start_day:
        form_data["startDay"] = start_day
    if end_day:
        form_data["endDay"] = end_day

    data = json.dumps(form_data).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "nextclaw-work-time-query/1.0",
    }
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT / 1000) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise Exception(f"请求失败：{e}")


def output_result(data, command, project_code=None):
    json_str = json.dumps(data, ensure_ascii=False, indent=2)

    if command == "list":
        filename = "projects.json"
    elif command == "query":
        if project_code:
            filename = f"workhours_{project_code}.json"
        else:
            filename = "workhours_all.json"
    else:
        filename = "output.json"

    output_path = os.path.join(TEMP_DIR, f"{SKILL_NAME}_{filename}")

    os.makedirs(TEMP_DIR, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(json_str)

    print(f"[数据已保存到文件: {output_path}]")


def main():
    parser = argparse.ArgumentParser(description="工时查询")
    subparsers = parser.add_subparsers(dest="command")

    list_parser = subparsers.add_parser("list", help="列出所有项目")
    list_parser.add_argument("args", nargs="*", help="参数 (可选, 格式: key=value)")

    query_parser = subparsers.add_parser("query", help="查询项目人员工时")
    query_parser.add_argument(
        "args",
        nargs="*",
        help="参数 (可选, 格式: key=value 或 period=本周/上周/本月/上月)",
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        print("\n示例:")
        print("  python work-time-statistics.py list")
        print("  python work-time-statistics.py list projectType=自研")
        print(
            "  python work-time-statistics.py query startDay=2026-04-01 endDay=2026-04-07"
        )
        print("  python work-time-statistics.py query period=本周")
        print("  python work-time-statistics.py query period=本月 projectType=承建")
        sys.exit(0)

    try:
        token = get_token()

        if args.command == "list":
            kwargs = {}
            if args.args:
                for arg in args.args:
                    if "=" in arg:
                        k, v = arg.split("=", 1)
                        kwargs[k] = v

            filter_type = kwargs.get("projectType")
            project_type_map = {
                "承建": "2",
                "自研": "1",
                "运营": "3",
                "商机项目": "4",
            }
            filter_type_code = project_type_map.get(filter_type, filter_type)

            clean_previous_output("projects.json")
            result = list_projects(token)

            if filter_type_code:
                filtered_data = [
                    p
                    for p in result.get("data", [])
                    if p.get("projectType") == filter_type_code
                ]
                result = {"code": result.get("code", 0), "data": filtered_data}

            output_result(result, "list")

        elif args.command == "query":
            project_code = None
            kwargs = {}
            if args.args:
                for arg in args.args:
                    if "=" in arg:
                        k, v = arg.split("=", 1)
                        kwargs[k] = v

                if "period" in kwargs:
                    start_day, end_day = get_date_range(kwargs["period"])
                    if start_day:
                        kwargs["startDay"] = start_day
                        kwargs["endDay"] = end_day
                    del kwargs["period"]

                project_code = kwargs.get("projectCode")

            clean_previous_output(
                f"workhours_{project_code}.json"
                if project_code
                else "workhours_all.json"
            )
            result = query_work_hours(
                token,
                kwargs.get("projectCode"),
                kwargs.get("startDay"),
                kwargs.get("endDay"),
            )
            output_result(result, "query", project_code)

    except Exception as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
