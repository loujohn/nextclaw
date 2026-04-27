#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""日报技能 - 主入口

用法:
  python daily-report.py --query-projects [关键词]
  python daily-report.py --submit --project-code <编号> --project-name <名称> ...
  python daily-report.py --validate
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
from cli import (
    handle_query_projects,
    handle_query_chances,
    handle_query_clients,
    handle_query_contacts,
    handle_select,
    handle_validate,
    handle_submit,
)


def build_parser():
    """构建命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description="日报填写脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument("--submit", dest="submit", action="store_true", help="生成参数文件并提交")
    parser.add_argument("--validate", dest="validate", action="store_true", help="仅校验参数")
    parser.add_argument("--json-file", dest="json_file", help="从文件读取日报参数（备用）")
    parser.add_argument("--date", dest="date", help="日期（YYYY-MM-DD，默认当天）")
    parser.add_argument("--project-code", dest="project_code", help="项目编号")
    parser.add_argument("--project-name", dest="project_name", help="项目名称")
    parser.add_argument("--project-stage", dest="project_stage", help="项目阶段")
    parser.add_argument("--project-manager", dest="project_manager", help="项目经理")
    parser.add_argument("--day-summarize-now", dest="day_summarize_now", help="今日工作总结")
    parser.add_argument("--day-plan-next", dest="day_plan_next", help="明日工作计划")
    parser.add_argument("--problem-risk", dest="problem_risk", help="问题与风险（选填）")
    parser.add_argument("--request-instructions", dest="request_instructions", help="请示事项（选填）")
    parser.add_argument("--day-report-type", dest="day_report_type", type=int, default=2, help="日报类型（默认2）")
    parser.add_argument("-q", "--query-projects", dest="query_projects", nargs="?", const="", default=None, type=str, help="查询项目列表")
    parser.add_argument("-qc", "--query-chances", dest="query_chances", nargs="?", const="", default=None, type=str, help="查询商机列表")
    parser.add_argument("--customer-code", dest="customer_code", type=str, help="客户编码（配合查询商机）")
    parser.add_argument("--query-clients", dest="query_clients", nargs="?", const="", default=None, type=str, help="查询客户列表")
    parser.add_argument("--query-contacts", dest="query_contacts", nargs="?", const="", default=None, type=str, help="查询对接人列表")
    parser.add_argument("--customer-name", dest="customer_name", type=str, help="客户名称")
    parser.add_argument("--select", dest="select", help="从查询结果中选择（数字索引）")
    parser.add_argument("--report-user", dest="report_user", help="填报人用户名")
    parser.add_argument("--report-name", dest="report_name", help="填报人姓名")
    parser.add_argument("--chance-id", dest="chance_id", help="商机ID")
    parser.add_argument("--chance-code", dest="chance_code", help="商机编码")
    parser.add_argument("--chance-name", dest="chance_name", help="商机/项目名称")
    parser.add_argument("--chance-schedule", dest="chance_schedule", help="商机/项目阶段")
    parser.add_argument("--group-attention-stage", dest="group_attention_stage", help="集团关注项目阶段")
    parser.add_argument("--customer-type", dest="customer_type", type=int, default=1, help="客户类型（1=客户 2=合作伙伴）")
    parser.add_argument("--visit-client-name", dest="visit_client_name", help="拜访客户")
    parser.add_argument("--visit-client-code", dest="visit_client_code", help="拜访客户编码")
    parser.add_argument("--visit-client-id", dest="visit_client_id", help="拜访客户ID")
    parser.add_argument("--contract-person-code", dest="contract_person_code", help="对接人code")
    parser.add_argument("--contract-person-name", dest="contract_person_name", help="对接人")
    parser.add_argument("--contract-person-dept-name", dest="contract_person_dept_name", help="对接部门")
    parser.add_argument("--contract-person-position", dest="contract_person_position", help="对接人职务")
    parser.add_argument("--contract-person-dept-id", dest="contract_person_dept_id", help="对接人部门ID")
    parser.add_argument("--visit-record", dest="visit_record", help="拜访记录")
    parser.add_argument("--client-hope", dest="client_hope", help="客户期望")
    parser.add_argument("--day-plan-now", dest="day_plan_now", help="今日工作计划")

    return parser


def main():
    Config.validate_and_exit()

    parser = build_parser()
    args = parser.parse_args()

    has_action = any([
        args.submit,
        args.validate,
        args.query_projects is not None,
        args.query_chances is not None,
        args.query_clients is not None,
        args.query_contacts is not None,
        args.select is not None,
    ])
    if not has_action:
        parser.print_help()
        return

    if not args.report_user:
        args.report_user = "unknown"
    if not args.report_name:
        args.report_name = args.report_user

    if args.query_projects is not None:
        handle_query_projects(args, __import__("api", fromlist=["APIClient"]).APIClient())
    elif args.query_chances is not None:
        handle_query_chances(args, __import__("api", fromlist=["APIClient"]).APIClient())
    elif args.query_clients is not None:
        handle_query_clients(args, __import__("api", fromlist=["APIClient"]).APIClient())
    elif args.query_contacts is not None:
        handle_query_contacts(args, __import__("api", fromlist=["APIClient"]).APIClient())
    elif args.select:
        handle_select(args)
    elif args.validate:
        handle_validate(args)
    elif args.submit:
        handle_submit(args)


if __name__ == "__main__":
    main()
