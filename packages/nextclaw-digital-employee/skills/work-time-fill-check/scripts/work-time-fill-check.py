#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""工时填报检查技能 - 主入口

用法:
  python work-time-fill-check.py --output --per-user --per-leader
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
from cli import handle_query, handle_output


def build_parser():
    """构建命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description="工时检查脚本 - 获取工时数据",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--output", action="store_true", help="输出群通知Markdown文件")
    parser.add_argument("--per-user", action="store_true", help="为每个未填写人员生成单独的通知文件")
    parser.add_argument("--per-leader", action="store_true", help="为每个项目负责人生成通知文件")
    return parser


def main():
    # 第一步：校验环境变量
    Config.validate_and_exit()

    parser = build_parser()
    args = parser.parse_args()

    has_output = args.output or args.per_user or args.per_leader

    try:
        if has_output:
            handle_output(
                output_group=args.output,
                per_user=args.per_user,
                per_leader=args.per_leader,
            )
        else:
            handle_query()
    except Exception as e:
        print(f"[工时检查] 失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
