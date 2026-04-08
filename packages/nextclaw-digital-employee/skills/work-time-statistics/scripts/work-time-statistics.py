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


def clean_previous_output():
    if not os.path.exists(TEMP_DIR):
        return
    pattern = os.path.join(TEMP_DIR, f"{SKILL_NAME}_*.json")
    for f in glob.glob(pattern):
        try:
            os.remove(f)
        except Exception:
            pass


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
    return fetch(url, token, TIMEOUT)


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
    str_len = len(json_str)

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

    if str_len > 10000:
        print(f"[数据已保存到文件: {output_path}]")
        print(f"[字符数: {str_len}]")
    else:
        print(json_str)


def main():
    parser = argparse.ArgumentParser(description="工时查询")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("list", help="列出所有项目")

    query_parser = subparsers.add_parser("query", help="查询项目人员工时")
    query_parser.add_argument("projectCode", nargs="?", help="项目编号 (可选)")
    query_parser.add_argument("startDay", nargs="?", help="开始日期 (YYYY-MM-DD, 可选)")
    query_parser.add_argument("endDay", nargs="?", help="结束日期 (YYYY-MM-DD, 可选)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        print("\n示例:")
        print("  python work-time-query.py list")
        print("  python work-time-query.py query XM001 2026-04-01 2026-04-02")
        sys.exit(0)

    try:
        clean_previous_output()
        token = get_token()

        if args.command == "list":
            result = list_projects(token)
            output_result(result, "list")

        elif args.command == "query":
            result = query_work_hours(
                token, args.projectCode, args.startDay, args.endDay
            )
            output_result(result, "query", args.projectCode)

    except Exception as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
