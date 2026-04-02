#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io
import os
import json
import urllib.request
import urllib.parse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

PM_BASE_URL = os.environ.get("PM_BASE_URL", "")
API_USERNAME = os.environ.get("PM_USERNAME", "admin")
API_PASSWORD = os.environ.get("PM_PASSWORD", "")
BASIC_AUTH = os.environ.get("PM_BASIC_AUTH", "")
TIMEOUT = int(os.environ.get("PM_TIMEOUT", "120000"))


def post_form(url, form_data, timeout, token=None):
    data = urllib.parse.urlencode(form_data).encode("utf-8") if form_data else None
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "nextclaw-work-time-query/1.0",
    }
    if BASIC_AUTH:
        headers["Authorization"] = BASIC_AUTH
    if token:
        headers["Authorization"] = f"Bearer {token}"

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


def query_work_hours(token, project_code, start_day, end_day):
    url = f"{PM_BASE_URL}/admin/project/workHour/getProjectUserWorkHour"
    form_data = {
        "projectCode": project_code,
        "startDay": start_day,
        "endDay": end_day,
    }
    return post_form(url, form_data, TIMEOUT, token)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="工时查询")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("list", help="列出所有项目")

    query_parser = subparsers.add_parser("query", help="查询项目人员工时")
    query_parser.add_argument("projectCode", help="项目编号")
    query_parser.add_argument("startDay", help="开始日期 (YYYY-MM-DD)")
    query_parser.add_argument("endDay", help="结束日期 (YYYY-MM-DD)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        print("\n示例:")
        print("  python work-time-query.py list                    # 列出所有项目")
        print("  python work-time-query.py query XM001 2026-04-01 2026-04-02")
        sys.exit(0)

    try:
        token = get_token()

        if args.command == "list":
            result = list_projects(token)
            print(json.dumps(result, ensure_ascii=False, indent=2))

        elif args.command == "query":
            result = query_work_hours(
                token, args.projectCode, args.startDay, args.endDay
            )
            print(json.dumps(result, ensure_ascii=False, indent=2))

    except Exception as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
