#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""经营管理分析技能 - 主入口

用法:
  python bm-query.py list
  python bm-query.py call <工具名> [参数...]
  python bm-query.py all
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
from cli import handle_list, handle_call, handle_all, clean_previous_output


def build_parser():
    """构建命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description="经营管理分析",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("list", help="列出可用工具")

    call_parser = subparsers.add_parser("call", help="调用MCP工具")
    call_parser.add_argument("tool", help="工具名称")
    call_parser.add_argument("args", nargs="*", help="参数(可选，多个参数用空格分隔)")

    subparsers.add_parser("all", help="一次性获取所有经营数据")

    return parser


def print_examples():
    """打印使用示例"""
    print("\n示例:")
    print("  python bm-query.py call stageCount")
    print("  python bm-query.py call businessDataStatistics")
    print("  python bm-query.py call businessDataStatistics name=数字广安")
    print("  python bm-query.py call allCollect timeFlag=4")
    print("  python bm-query.py call singleCollect name=渝你同行 timeFlag=4")
    print("  python bm-query.py call forewarn")
    print("  python bm-query.py all")


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
        if args.command == "call":
            clean_previous_output()
            handle_call(args.tool, args.args)
        elif args.command == "all":
            clean_previous_output()
            handle_all()
        elif args.command == "list":
            handle_list()
    except Exception as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
