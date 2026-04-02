#!/usr/bin/env python3
"""
工时查询脚本 - 待接口实现后完善
"""

import argparse
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="工时查询工具")
    subparsers = parser.add_subparsers(dest="command")

    # 项目工时查询
    subparsers.add_parser("project", help="项目工时查询")

    # 成员工时查询
    subparsers.add_parser("members", help="成员工时查询")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        print("\n⚠️ 待接口实现后完善")
        sys.exit(1)

    print(f"⚠️ 接口待实现，命令: {args.command}")
    sys.exit(1)


if __name__ == "__main__":
    main()
