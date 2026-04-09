#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io
import os
import json
import subprocess
import glob
import platform

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

PM_MCP_URL = os.environ.get("PM_MCP_URL", "")
PM_BASE_URL = os.environ.get("PM_BASE_URL", "")
API_USERNAME = os.environ.get("PM_USERNAME", "admin")
API_PASSWORD = os.environ.get("PM_PASSWORD", "")
BASIC_AUTH = os.environ.get("PM_BASIC_AUTH", "")
TIMEOUT = int(os.environ.get("PM_TIMEOUT", "120000"))

_is_windows = platform.system() == "Windows"

if _is_windows:
    MCPORTER_CMD = "mcporter"
else:
    MCPORTER_CMD = "/usr/local/bin/mcporter"

TEMP_DIR = os.path.expanduser("~/nextclaw-temp")
SKILL_NAME = "business-management-analysis"


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


def run_mcporter(args_str):
    cmd = f"{MCPORTER_CMD} {args_str} --http-url {PM_MCP_URL} --allow-http"
    result = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8" if _is_windows else None,
        errors="replace" if _is_windows else None,
    )
    return result


def list_tools():
    if not PM_MCP_URL:
        print("错误: PM_MCP_URL 环境变量未设置", file=sys.stderr)
        sys.exit(1)

    result = run_mcporter("list")
    if result.returncode != 0:
        print(f"错误: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    print(result.stdout)


def output_result(data, command, tool_name=None):
    json_str = json.dumps(data, ensure_ascii=False, indent=2)

    if command == "all":
        filename = "all.json"
    elif command == "call" and tool_name:
        filename = f"{tool_name}.json"
    else:
        filename = "output.json"

    output_path = os.path.join(TEMP_DIR, f"{SKILL_NAME}_{filename}")

    os.makedirs(TEMP_DIR, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(json_str)

    print(f"[数据已保存到文件: {output_path}]")


def call_tool(tool_name, args=None):
    if not PM_MCP_URL:
        print("错误: PM_MCP_URL 环境变量未设置", file=sys.stderr)
        sys.exit(1)

    token = get_token()

    params = f"token={token}"
    if args:
        params = f"{' '.join(args)} {params}"

    result = run_mcporter(f"call {tool_name} {params}")

    if result.returncode != 0:
        print(f"调用失败: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    try:
        output = json.loads(result.stdout)
        output_result(output, "call", tool_name)
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
        ("allCollect", "timeFlag=4 token=" + token),
        ("payCondition", "timeFlag=4 token=" + token),
        ("chanceStatistics", "timeFlag=1 token=" + token),
        ("selfBuildYear", "timeFlag=1 token=" + token),
    ]

    results = {}
    for tool_name, args in tools:
        result = run_mcporter(f"call {tool_name} {args}")
        if result.returncode == 0:
            try:
                results[tool_name] = json.loads(result.stdout)
            except:
                results[tool_name] = result.stdout
        else:
            results[tool_name] = {"error": result.stderr}

    output_result(results, "all")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="经营管理分析")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("list", help="列出可用工具")

    call_parser = subparsers.add_parser("call", help="调用MCP工具")
    call_parser.add_argument("tool", help="工具名称")
    call_parser.add_argument("args", nargs="*", help="参数(可选，多个参数用空格分隔)")

    subparsers.add_parser("all", help="一次性获取所有经营数据")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        print("\n示例:")
        print("  python bm-query.py call stageCount")
        print("  python bm-query.py call businessDataStatistics")
        print("  python bm-query.py call businessDataStatistics name=数字广安")
        print("  python bm-query.py call allCollect timeFlag=4")
        print("  python bm-query.py call singleCollect name=渝你同行 timeFlag=4")
        print("  python bm-query.py call forewarn")
        print("  python bm-query.py all")
        sys.exit(0)

    try:
        if args.command == "call":
            clean_previous_output(f"{args.tool}.json")
            call_tool(args.tool, args.args)
        elif args.command == "all":
            clean_previous_output("all.json")
            call_all()
        elif args.command == "list":
            list_tools()
    except Exception as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
