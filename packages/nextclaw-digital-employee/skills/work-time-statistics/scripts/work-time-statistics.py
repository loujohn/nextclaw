#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""工时统计分析技能 - 主入口

用法:
  python work-time-statistics.py list [参数]
  python work-time-statistics.py query [参数]
"""
import sys
import io
import argparse

# 确保 Windows 控制台使用 UTF-8
if sys.platform == "win32":
    import ctypes
    ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from config import Config
from cli import handle_list, handle_query, clean_previous_output


def build_parser():
    """构建命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description="工时查询",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command")

    list_parser = subparsers.add_parser("list", help="列出所有项目")
    list_parser.add_argument("args", nargs="*", help="参数 (可选, 格式: key=value)")

    query_parser = subparsers.add_parser("query", help="查询项目人员工时")
    query_parser.add_argument(
        "args",
        nargs="*",
        help="参数 (可选, 格式: key=value 或 period=本周/上周/本月/上月)",
    )

    return parser


def print_examples():
    """打印使用示例"""
    print("\n示例:")
    print("  python work-time-statistics.py list")
    print("  python work-time-statistics.py list projectType=自研")
    print("  python work-time-statistics.py query startDay=2026-04-01 endDay=2026-04-07")
    print("  python work-time-statistics.py query period=本周")
    print("  python work-time-statistics.py query period=本月 projectType=承建")


def main():
    # 第一步：校验环境变量
    Config.validate_and_exit()

    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        print_examples()
        sys.exit(0)

    try:
        if args.command == "list":
            clean_previous_output()
            handle_list(args.args)
        elif args.command == "query":
            clean_previous_output()
            handle_query(args.args)
    except Exception as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
