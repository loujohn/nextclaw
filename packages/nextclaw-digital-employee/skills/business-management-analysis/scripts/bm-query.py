#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io
import os
import json
import subprocess

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

PM_MCP_URL = os.environ.get("PM_MCP_URL", "")
PM_BASE_URL = os.environ.get("PM_BASE_URL", "")
API_USERNAME = os.environ.get("PM_USERNAME", "admin")
API_PASSWORD = os.environ.get("PM_PASSWORD", "")
BASIC_AUTH = os.environ.get("PM_BASIC_AUTH", "")
TIMEOUT = int(os.environ.get("PM_TIMEOUT", "120000"))

import platform

_is_windows = platform.system() == "Windows"


def post_form(url, form_data, timeout):
    import urllib.request
    import urllib.parse

    data = urllib.parse.urlencode(form_data).encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "nextclaw-bm-query/1.0",
    }
    if BASIC_AUTH:
        headers["Authorization"] = BASIC_AUTH

    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout / 1000) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def get_token():
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


def list_tools():
    if not PM_MCP_URL:
        print("错误: PM_MCP_URL 环境变量未设置", file=sys.stderr)
        sys.exit(1)

    result = subprocess.run(
        "mcporter list --http-url " + PM_MCP_URL + " --allow-http",
        shell=_is_windows,
        capture_output=True,
        text=True,
        encoding="utf-8" if _is_windows else None,
        errors="replace" if _is_windows else None,
    )
    if result.returncode != 0:
        print(f"错误: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    print(result.stdout)


def call_tool(tool_name, args=None):
    if not PM_MCP_URL:
        print("错误: PM_MCP_URL 环境变量未设置", file=sys.stderr)
        sys.exit(1)

    token = get_token()

    # 构建参数
    params = f"token={token}"
    if args:
        params = f"{args} {params}"

    # 使用 server.tool 格式 + --http-url
    cmd = f"mcporter call {tool_name} {params} --http-url {PM_MCP_URL} --allow-http"

    result = subprocess.run(
        cmd,
        shell=_is_windows,
        capture_output=True,
        text=True,
        encoding="utf-8" if _is_windows else None,
        errors="replace" if _is_windows else None,
    )

    if result.returncode != 0:
        print(f"调用失败: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    try:
        output = json.loads(result.stdout)
        print(json.dumps(output, ensure_ascii=False, indent=2))
    except:
        print(result.stdout)


def call_all():
    if not PM_MCP_URL:
        print("错误: PM_MCP_URL 环境变量未设置", file=sys.stderr)
        sys.exit(1)

    token = get_token()
    tools = [
        ("stageCount", "token=" + token),
        ("forewarn", "token=" + token),
        ("businessDataStatistics", "token=" + token),
        ("allCollect", "timeFlag=4 token=" + token),
        ("payCondition", "timeFlag=4 token=" + token),
        ("chanceStatistics", "timeFlag=1 token=" + token),
        ("selfBuildYear", "timeFlag=1 token=" + token),
    ]

    results = {}
    for tool_name, args in tools:
        cmd = f"mcporter call {tool_name} {args} --http-url {PM_MCP_URL} --allow-http"
        result = subprocess.run(
            cmd,
            shell=_is_windows,
            capture_output=True,
            text=True,
            encoding="utf-8" if _is_windows else None,
            errors="replace" if _is_windows else None,
        )
        if result.returncode == 0:
            try:
                results[tool_name] = json.loads(result.stdout)
            except:
                results[tool_name] = result.stdout
        else:
            results[tool_name] = {"error": result.stderr}

    print(json.dumps(results, ensure_ascii=False, indent=2))


def main():
    import argparse

    parser = argparse.ArgumentParser(description="经营管理分析")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("list", help="列出可用工具")

    call_parser = subparsers.add_parser("call", help="调用MCP工具")
    call_parser.add_argument("tool", help="工具名称")
    call_parser.add_argument("args", nargs="?", help="参数(可选)")

    subparsers.add_parser("all", help="一次性获取所有经营数据")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        print("\n示例:")
        print("  python bm-query.py call stageCount")
        print("  python bm-query.py call businessDataStatistics")
        print("  python bm-query.py call allCollect timeFlag=4")
        print("  python bm-query.py call forewarn")
        print("  python bm-query.py all")
        sys.exit(0)

    try:
        if args.command == "list":
            list_tools()
        elif args.command == "call":
            call_tool(args.tool, args.args)
        elif args.command == "all":
            call_all()
    except Exception as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
