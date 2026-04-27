#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人员查询技能 - 主入口

用法:
  python employee-query.py --query-depts
  python employee-query.py --query-leaders
  python employee-query.py --query-dept-managers
  python employee-query.py --query-users <关键词>
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
from api import APIClient
from cli import (
    handle_query_depts,
    handle_query_leaders,
    handle_query_dept_managers,
    handle_query_each_dept_manager,
    handle_query_dept_manager,
    handle_query_users,
)


def build_parser():
    """构建命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description="人员查询工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument("--query-depts", action="store_true", help="查询部门树")
    parser.add_argument("--query-leaders", action="store_true", help="查询公司领导（一级管理员）")
    parser.add_argument("--query-dept-managers", action="store_true", help="查询部门负责人（二级管理员）")
    parser.add_argument("--query-each-dept-manager", action="store_true", help="查询每个部门的负责人")
    parser.add_argument("--query-users", dest="query_users", nargs="?", const="", default=None, type=str, help="根据姓名/用户名查询用户")
    parser.add_argument("--dept-id", dest="dept_id", type=str, help="部门ID，查询某部门人员")
    parser.add_argument("--name", type=str, help="按姓名查询")
    parser.add_argument("--username", type=str, help="按用户名查询")
    parser.add_argument("--phone", type=str, help="按手机号查询")
    parser.add_argument("--dept-manager", dest="dept_manager", type=str, help="查询某部门负责人")

    return parser


def print_help():
    """打印使用说明"""
    print("人员查询工具 - 使用说明：\n")
    print("查询类型：")
    print("  --query-depts              查询部门树")
    print("  --query-leaders            查询公司领导（一级管理员）")
    print("  --query-dept-managers      查询部门负责人（二级管理员）")
    print("  --query-each-dept-manager  查询每个部门的负责人")
    print("\n查询用户（可组合使用）：")
    print("  --query-users <关键词>     综合搜索（姓名/用户名/手机号）")
    print("  --name <姓名>              按姓名查询")
    print("  --username <用户名>        按用户名查询")
    print("  --phone <手机号>           按手机号查询")
    print("  --dept-id <部门 ID>         查询某部门人员")
    print("  --dept-manager <部门 ID>    查询某部门负责人")
    print("\n示例：")
    print("  python employee-query.py --query-depts")
    print("  python employee-query.py --query-leaders")
    print("  python employee-query.py --query-users 张三")
    print("  python employee-query.py --dept-id 1787377767628632065")
    print("  python employee-query.py --dept-manager 1787377767628632065")


def main():
    # 第一步：校验环境变量
    Config.validate_and_exit()

    parser = build_parser()
    args = parser.parse_args()

    has_query = any([
        args.query_depts,
        args.query_leaders,
        args.query_dept_managers,
        args.query_each_dept_manager,
        args.query_users is not None,
        args.dept_id,
        args.dept_manager,
        args.name,
        args.username,
        args.phone,
    ])

    if not has_query:
        print_help()
        return

    client = APIClient()
    client.login()

    if args.query_depts:
        handle_query_depts(client)
    elif args.query_leaders:
        handle_query_leaders(client)
    elif args.query_dept_managers:
        handle_query_dept_managers(client)
    elif args.query_each_dept_manager:
        handle_query_each_dept_manager(client)
    elif args.dept_manager:
        handle_query_dept_manager(client, args.dept_manager)
    else:
        keyword = args.query_users if args.query_users is not None else ""
        handle_query_users(
            client,
            name=keyword if keyword else args.name,
            username=args.username,
            phone=args.phone,
            dept_id=args.dept_id,
        )


if __name__ == "__main__":
    main()
