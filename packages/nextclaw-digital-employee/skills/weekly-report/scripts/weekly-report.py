#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""周报技能 - 主入口

用法:
  python weekly-report.py personal --user <用户名> [--review|--submit]
  python weekly-report.py dept-daily --dept-name <部门名>
  python weekly-report.py dept-weekly --dept-name <部门名>
  python weekly-report.py company
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

from api import APIClient
from config import Config
from models import get_week_range, get_daily_report_week_dir, parse_users_md, parse_projects_md, parse_raw_dailies
from cli import handle_personal, handle_dept_daily, handle_dept_weekly, handle_company


def build_parser():
    """构建命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description="项目周报生成脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="命令类型")

    # 个人周报
    personal_parser = subparsers.add_parser("personal", help="生成个人周报")
    personal_parser.add_argument("--user", dest="user_name", help="用户名")
    personal_parser.add_argument("--name", dest="user_display_name", help="用户姓名")
    personal_parser.add_argument("--review", action="store_true", help="预览周报")
    personal_parser.add_argument("--submit", action="store_true", help="提交周报")
    personal_parser.add_argument("--week", dest="week_offset", type=int, default=0, help="周偏移量")
    personal_parser.add_argument("--week-start", dest="week_start_date", help="周开始日期 YYYY-MM-DD")
    personal_parser.add_argument("--week-end", dest="week_end_date", help="周结束日期 YYYY-MM-DD")

    # 部门日报汇总
    dept_daily_parser = subparsers.add_parser("dept-daily", help="查询部门日报汇总")
    dept_daily_parser.add_argument("--dept-name", dest="dept_name", required=True, help="部门名称")
    dept_daily_parser.add_argument("--week", dest="week_offset", type=int, default=0, help="周偏移量")
    dept_daily_parser.add_argument("--week-start", dest="week_start_date", help="周开始日期 YYYY-MM-DD")
    dept_daily_parser.add_argument("--week-end", dest="week_end_date", help="周结束日期 YYYY-MM-DD")

    # 部门周报
    dept_weekly_parser = subparsers.add_parser("dept-weekly", help="生成部门周报")
    dept_weekly_parser.add_argument("--dept-name", dest="dept_name", required=True, help="部门名称")
    dept_weekly_parser.add_argument("--week", dest="week_offset", type=int, default=0, help="周偏移量")
    dept_weekly_parser.add_argument("--week-start", dest="week_start_date", help="周开始日期 YYYY-MM-DD")
    dept_weekly_parser.add_argument("--week-end", dest="week_end_date", help="周结束日期 YYYY-MM-DD")

    # 全公司周报
    company_parser = subparsers.add_parser("company", help="生成全公司周报")
    company_parser.add_argument("--week", dest="week_offset", type=int, default=0, help="周偏移量")
    company_parser.add_argument("--week-start", dest="week_start_date", help="周开始日期 YYYY-MM-DD")
    company_parser.add_argument("--week-end", dest="week_end_date", help="周结束日期 YYYY-MM-DD")

    return parser


def main():
    Config.validate_and_exit()

    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    # 计算周起止日期
    week_start, week_end = get_week_range(
        week_offset=getattr(args, "week_offset", 0),
        week_start_date=getattr(args, "week_start_date", None),
        week_end_date=getattr(args, "week_end_date", None),
    )

    # 加载日报数据
    week_dir = get_daily_report_week_dir(week_start, week_end)
    users_data = {}
    projects_data = {}
    raw_dailies = []

    if week_dir:
        users_data = parse_users_md(f"{week_dir}/users.md")
        projects_data = parse_projects_md(f"{week_dir}/projects.md")
        raw_dailies = parse_raw_dailies(f"{week_dir}/raw_dailies.json")

    # 初始化 API 客户端
    client = APIClient()
    if client.username and client.password:
        try:
            client.login()
        except Exception as e:
            print(f"[警告] 登录失败: {e}", file=sys.stderr)

    # 路由到对应处理函数
    if args.command == "personal":
        handle_personal(args, week_start, week_end, users_data, raw_dailies, client)
    elif args.command == "dept-daily":
        handle_dept_daily(args, week_start, week_end, users_data, client)
    elif args.command == "dept-weekly":
        handle_dept_weekly(args, week_start, week_end, users_data, client)
    elif args.command == "company":
        handle_company(args, week_start, week_end, users_data)


if __name__ == "__main__":
    main()
