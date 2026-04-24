"""日报技能 - 命令行交互模块

处理命令行参数解析、查询交互和提交流程。
"""
import json
import sys
from argparse import Namespace

from api import APIClient
from models import ReportData, SelectionFormatter, SelectionParser
from report import get_week_dir, save_query_result, save_param_file, remove_param_file, generate_md_files


def handle_query_projects(args, client):
    """处理项目查询"""
    if args.report_user == "unknown":
        print("[日报] 错误: 请确认填报人信息", file=sys.stderr)
        return False

    try:
        client.login()
        result = client.query_projects(args.report_user, args.query_projects)
        if result.get("code") == 0 and result.get("data"):
            records = result["data"].get("records", [])
            total = result["data"].get("total", 0)
            week_dir = get_week_dir()
            filename = f"projects_query_{args.report_user}.json"
            save_query_result(week_dir, filename, records, total)
            print(SelectionFormatter.format_projects(records, total))
            if records:
                print(f"\n请使用 --select <数字> 选择项目", file=sys.stderr)
            return True
        else:
            print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"[日报] 错误: {e}", file=sys.stderr)
        return False


def handle_query_chances(args, client):
    """处理商机查询"""
    try:
        client.login()
        result = client.query_chances(args.query_chances, args.customer_code)
        if result.get("code") == 0 and result.get("data"):
            records = result["data"].get("records", [])
            total = result["data"].get("total", 0)
            week_dir = get_week_dir()
            filename = f"chances_query_{args.report_user}.json"
            save_query_result(week_dir, filename, records, total)
            print(SelectionFormatter.format_chances(records, total))
            if records:
                print(f"\n请使用 --select <数字> 选择商机", file=sys.stderr)
            return True
        else:
            print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"[日报] 错误: {e}", file=sys.stderr)
        return False


def handle_query_clients(args, client):
    """处理客户查询"""
    try:
        client.login()
        result = client.query_clients(args.query_clients)
        if result.get("code") == 0 and result.get("data"):
            records = result["data"].get("records", [])
            total = result["data"].get("total", 0)
            week_dir = get_week_dir()
            filename = f"clients_query_{args.report_user}.json"
            save_query_result(week_dir, filename, records, total)
            print(SelectionFormatter.format_clients(records, total))
            if records:
                print(f"\n请使用 --select <数字> 选择客户", file=sys.stderr)
            return True
        else:
            print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"[日报] 错误: {e}", file=sys.stderr)
        return False


def handle_query_contacts(args, client):
    """处理对接人查询"""
    try:
        client.login()
        result = client.query_contacts(args.customer_name, args.query_contacts)
        if result.get("code") == 0 and result.get("data"):
            records = result["data"].get("records", [])
            total = result["data"].get("total", 0)
            week_dir = get_week_dir()
            filename = f"contacts_query_{args.report_user}.json"
            save_query_result(week_dir, filename, records, total)
            print(SelectionFormatter.format_contacts(records, total))
            if records:
                print(f"\n请使用 --select <数字> 选择对接人", file=sys.stderr)
            return True
        else:
            print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"[日报] 错误: {e}", file=sys.stderr)
        return False


def handle_select(args):
    """处理选择操作"""
    week_dir = get_week_dir()
    if not week_dir:
        print("错误: 无法获取工作目录", file=sys.stderr)
        return False

    report_user = args.report_user
    possible_files = [
        f"projects_query_{report_user}.json",
        f"chances_query_{report_user}.json",
        f"clients_query_{report_user}.json",
    ]

    query_file = None
    latest_mtime = 0
    for f in possible_files:
        import os
        fp = os.path.join(week_dir, f)
        if os.path.exists(fp):
            mtime = os.path.getmtime(fp)
            if mtime > latest_mtime:
                latest_mtime = mtime
                query_file = fp

    if not query_file:
        print("错误: 没有可选择的项目/商机/客户，请先使用查询命令", file=sys.stderr)
        return False

    with open(query_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        records = data.get("records", [])

    index = int(args.select)
    if not records:
        print("错误: 查询结果为空", file=sys.stderr)
        return False

    # 判断查询类型
    if "customerCode" in records[0] and "chanceCode" not in records[0]:
        info = SelectionParser.get_client_info(records, index)
    elif "chanceCode" in records[0]:
        info = SelectionParser.get_chance_info(records, index)
    else:
        info = SelectionParser.get_project_info(records, index)

    if not info:
        print(f"错误: 无效的选择，请输入 1-{len(records)} 之间的数字", file=sys.stderr)
        return False

    print(json.dumps(info, ensure_ascii=False, indent=2))
    return True


def handle_validate(args):
    """处理验证操作"""
    report_data = ReportData()

    if args.json_file:
        try:
            with open(args.json_file, "r", encoding="utf-8") as f:
                report_data = ReportData(json.load(f))
        except json.JSONDecodeError as e:
            print(f"错误: JSON格式解析失败: {e}", file=sys.stderr)
            return False
    else:
        _apply_args_to_report(report_data, args)

    missing = report_data.validate()
    if missing:
        print(report_data.format_missing_message(missing), file=sys.stderr)
        return False

    print(json.dumps({"valid": True, "data": report_data.data}, ensure_ascii=False, indent=2))
    return True


def handle_submit(args):
    """处理提交操作"""
    report_data = ReportData()

    if args.json_file:
        try:
            with open(args.json_file, "r", encoding="utf-8") as f:
                report_data = ReportData(json.load(f))
        except json.JSONDecodeError as e:
            print(f"错误: JSON格式解析失败: {e}", file=sys.stderr)
            return False

    _apply_args_to_report(report_data, args)
    missing = report_data.validate()

    if missing:
        print(report_data.format_missing_message(missing), file=sys.stderr)
        return False

    prepared = report_data.prepare_for_submit()
    print(report_data.format_preview())

    week_dir = get_week_dir(prepared["date"])
    param_file = save_param_file(week_dir, prepared, args.report_user)
    print(f"[日报] 参数文件已生成：{param_file}")

    client = APIClient()
    if not client.username or not client.password:
        print("错误: 需要登录凭据", file=sys.stderr)
        remove_param_file(param_file)
        return False

    try:
        print("[日报] 正在登录...", flush=True)
        client.login()
        print("[日报] 登录成功", flush=True)

        print("[日报] 正在提交日报...", flush=True)
        sys.stdout.flush()

        if args.report_user == "unknown":
            print("[日报] 错误: 请确认填报人信息", file=sys.stderr)
            remove_param_file(param_file)
            return False

        result = client.submit_report(prepared, args.report_user, args.report_name)

        if result.get("code") == 0:
            try:
                result_data = result.get("data", {})
                if isinstance(result_data, str):
                    result_data = {}
                prepared.update(result_data)
            except:
                pass

            generate_md_files(prepared, args.report_user, args.report_name, client.token, client)

            print("", flush=True)
            print("==================================================", flush=True)
            print("【成功】日报提交成功", flush=True)
            print("【存档】MD文件已生成", flush=True)
            print("==================================================", flush=True)
        else:
            error_msg = result.get("message", "提交失败")
            try:
                inner_error = json.loads(error_msg)
                error_text = inner_error.get("msg", error_msg)
            except:
                error_text = error_msg

            print("", flush=True)
            print("==================================================", flush=True)
            print(f"【错误】{error_text}", flush=True)
            print("==================================================", flush=True)
            print("", flush=True)
            remove_param_file(param_file)
            return False

    except Exception as e:
        print(f"[日报] 运行时错误: {e}", flush=True)
        remove_param_file(param_file)
        return False

    return True


def _apply_args_to_report(report_data, args):
    """从命令行参数填充日报数据"""
    if args.project_code:
        report_data.set("projectCode", args.project_code)
    if args.project_name:
        report_data.set("projectName", args.project_name)
    if args.project_stage:
        report_data.set("projectStage", args.project_stage)
    if args.project_manager:
        report_data.set("projectManager", args.project_manager)
    if args.day_summarize_now:
        report_data.set("daySummarizeNow", args.day_summarize_now)
    if args.day_plan_next:
        report_data.set("dayPlanNext", args.day_plan_next)
    if args.problem_risk:
        report_data.set("problemRisk", args.problem_risk)
    if args.request_instructions:
        report_data.set("requestInstructions", args.request_instructions)

    if args.date:
        report_data.set("date", args.date)
        report_data.set("dayReportTime", args.date)
    elif not report_data.get("date"):
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        report_data.set("date", today)
        report_data.set("dayReportTime", today)

    report_data.set("dayReportType", args.day_report_type)

    if args.day_report_type == 1:
        chance_fields = {
            "chance_id": "chanceId",
            "chance_code": "chanceCode",
            "chance_name": "chanceProjectName",
            "chance_schedule": "chanceProjectSchedule",
            "group_attention_stage": "groupAttentionStage",
            "customer_type": "customerType",
            "visit_client_name": "visitClientName",
            "visit_client_code": "visitClientCode",
            "visit_client_id": "visitClientId",
            "contract_person_code": "contractPersonCode",
            "contract_person_name": "contractPersonName",
            "contract_person_dept_name": "contractPersonDeptName",
            "contract_person_position": "contractPersonPosition",
            "contract_person_dept_id": "contractPersonDeptId",
            "visit_record": "visitRecord",
            "client_hope": "clientHope",
            "day_plan_now": "dayPlanNow",
        }
        for attr, key in chance_fields.items():
            value = getattr(args, attr, None)
            if value is not None:
                report_data.set(key, value)
