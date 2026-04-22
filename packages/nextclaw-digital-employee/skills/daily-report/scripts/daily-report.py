#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io
import locale

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

if sys.platform == "win32":
    import ctypes

    ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

"""
日报填写脚本

用法:
  python daily-report.py --query-projects <项目名称关键词>
  python daily-report.py --submit --project-code <编号> --project-name <名称> ...
"""

import os
import sys
import re
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta

DEFAULT_BASE_URL = "http://shangji.dcg-internal-services.dev.dcginner:10003/api"
LOGIN_ENDPOINT = "/admin/oauth2/token"
REPORT_ENDPOINT = "/admin/dayReport"
PROJECT_QUERY_ENDPOINT = "/admin/pageProjectForReport"
CHANCE_QUERY_ENDPOINT = "/admin/business/chance/page"
CLIENT_QUERY_ENDPOINT = "/admin/getCustomer"
CONTACTS_QUERY_ENDPOINT = "/admin/getContacts"
USER_QUERY_ENDPOINT = "/admin/user/page"
DEPT_TREE_ENDPOINT = "/admin/dept/tree"

REQUIRED_FIELDS = [
    ("date", "日期"),
    ("projectName", "项目名称"),
    ("projectStage", "项目阶段"),
    ("projectCode", "项目编号"),
    ("projectManager", "项目经理"),
    ("daySummarizeNow", "当日工作总结"),
    ("dayPlanNext", "次日工作计划"),
    ("dayReportType", "日报类型"),
]

CHANCE_REQUIRED_FIELDS = [
    ("date", "日期"),
    ("dayReportType", "日报类型"),
    ("customerType", "客户类型（1=客户 2=合作伙伴）"),
    ("visitClientName", "拜访客户"),
    ("contractPersonName", "对接人"),
    ("contractPersonDeptName", "对接部门"),
    ("contractPersonPosition", "对接人职务"),
    ("visitRecord", "拜访记录"),
    ("clientHope", "客户期望"),
    ("dayPlanNext", "下一步计划"),
]

REQUIRED_FIELDS_WITH_TIME = REQUIRED_FIELDS + [
    ("dayReportTime", "日报时间"),
]


def get_env(key, default=None):
    return os.environ.get(key, default)


PM_BASE_URL = get_env("PM_BASE_URL", DEFAULT_BASE_URL)
PM_BASIC_AUTH = get_env("PM_BASIC_AUTH", "")
PM_USERNAME = get_env("PM_USERNAME", "admin")
PM_PASSWORD = get_env("PM_PASSWORD", "")


def post_form(url, form_data, timeout=120):
    """POST表单请求（用于登录）"""
    data = urllib.parse.urlencode(form_data).encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "nextclaw-daily-report/1.0",
    }
    if PM_BASIC_AUTH:
        headers["Authorization"] = PM_BASIC_AUTH
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return {"code": e.code, "message": e.read().decode("utf-8")}
        except:
            return {"code": e.code, "message": str(e)}
    except urllib.error.URLError as e:
        return {"code": -1, "message": f"网络请求失败: {e.reason}"}
    except Exception as e:
        return {"code": -1, "message": str(e)}


def fetch_json(url, token, timeout=120):
    """GET请求（需要Bearer token）"""
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-daily-report/1.0",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return {"code": e.code, "message": e.read().decode("utf-8")}
        except:
            return {"code": e.code, "message": str(e)}
    except urllib.error.URLError as e:
        return {"code": -1, "message": f"网络请求失败: {e.reason}"}
    except Exception as e:
        return {"code": -1, "message": str(e)}


def fetch_json_post(url, data, token, timeout=120, params=None):
    body = json.dumps(data).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-daily-report/1.0",
    }

    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return {"code": e.code, "message": e.read().decode("utf-8")}
        except:
            return {"code": e.code, "message": str(e)}
    except urllib.error.URLError as e:
        return {"code": -1, "message": f"网络请求失败: {e.reason}"}
    except Exception as e:
        return {"code": -1, "message": str(e)}


def login(base_url, username, password):
    """OAuth2登录获取token"""
    url = f"{base_url}{LOGIN_ENDPOINT}"
    form_data = {
        "grant_type": "password",
        "username": username,
        "password": password,
        "login_type": "quick",
    }
    result = post_form(url, form_data)

    if "access_token" in result:
        return result["access_token"]
    raise Exception(f"登录失败: {result.get('message', result)}")


def query_projects(base_url, token, username, project_name=None, current=1, size=50):
    """查询项目列表（POST，参数通过URL传递）"""
    url = (
        f"{base_url}{PROJECT_QUERY_ENDPOINT}?username={username}&queryType=3&current={current}&size={size}"
    )
    if project_name:
        url += f"&projectName={urllib.parse.quote(project_name)}"
    return fetch_json_post(url, {}, token)


def query_chances(base_url, token, chance_name=None, customer_code=None, current=1, size=50):
    """查询商机列表"""
    url = f"{base_url}{CHANCE_QUERY_ENDPOINT}?current={current}&size={size}"
    if chance_name:
        url += f"&chanceName={urllib.parse.quote(chance_name)}"
    if customer_code:
        url += f"&customerCode={urllib.parse.quote(customer_code)}"
    return fetch_json(url, token)


def format_projects_for_selection(records, total=0):
    """格式化项目列表供用户选择"""
    if not records:
        return "未找到匹配项目，该用户无项目可填写日报，请核实数据"

    lines = [f"共找到 {total} 个项目，请确认要填写的项目：\n"]
    for i, p in enumerate(records, 1):
        project_code = p.get("projectCode", "")
        project_name = p.get("projectName", "")
        manager = p.get("projectManager", "")
        stage = p.get("projectStageNewName", "")
        lines.append(
            f"{i}. {project_name}（编号: {project_code}，经理: {manager}，阶段: {stage}）"
        )
    if total > len(records):
        lines.append(
            f"\n（显示前 {len(records)} 条，共有 {total} 条，可输入更精确的关键词缩小范围）"
        )
    return "\n".join(lines)


def get_project_info(records, index):
    """从查询结果中获取项目信息"""
    if index < 1 or index > len(records):
        return None
    p = records[index - 1]
    return {
        "projectName": p.get("projectName", ""),
        "projectCode": p.get("projectCode", ""),
        "projectManager": p.get("projectManager", ""),
        "projectStage": p.get("projectStageNewName", ""),
    }


def get_client_info(records, index):
    """从查询结果中获取客户信息"""
    if index < 1 or index > len(records):
        return None
    c = records[index - 1]
    return {
        "visitClientName": c.get("customerName", ""),
        "visitClientCode": c.get("customerCode", ""),
        "visitClientId": c.get("customerId", ""),
        "customerType": c.get("customerType", 1),
    }


def format_chances_for_selection(records, total=0):
    """格式化商机列表供用户选择"""
    if not records:
        return "未找到匹配商机"

    lines = [f"共找到 {total} 个商机，请确认要填写的商机：\n"]
    for i, c in enumerate(records, 1):
        chance_code = c.get("chanceCode", "")
        chance_name = c.get("chanceName", "")
        customer_name = c.get("customerName", "")
        stage = c.get("chanceStageName", "")
        lines.append(f"{i}. {chance_name}（编码: {chance_code}，客户: {customer_name}，阶段: {stage}）")
    if total > len(records):
        lines.append(f"\n（显示前 {len(records)} 条，共有 {total} 条，可输入更精确的关键词缩小范围）")
    return "\n".join(lines)


def format_clients_for_selection(records, total=0):
    """格式化客户列表供用户选择"""
    if not records:
        return "未找到匹配客户"

    lines = [f"共找到 {total} 个客户，请确认拜访的客户：\n"]
    for i, c in enumerate(records, 1):
        customer_name = c.get("customerName", "")
        customer_code = c.get("customerCode", "")
        customer_type = c.get("customerType", "")
        type_name = "客户" if customer_type == 1 else "合作伙伴"
        lines.append(f"{i}. {customer_name}（编码: {customer_code}，类型: {type_name}）")
    if total > len(records):
        lines.append(f"\n（显示前 {len(records)} 条，共有 {total} 条，可输入更精确的关键词缩小范围）")
    return "\n".join(lines)


def format_contacts_for_selection(records, total=0):
    """格式化对接人列表供用户选择"""
    if not records:
        return "未找到匹配对接人"

    lines = [f"共找到 {total} 个对接人，请确认对接人：\n"]
    for i, c in enumerate(records, 1):
        contacts_name = c.get("contactsName", "")
        dept_name = c.get("depart", "")
        position = c.get("business", "")
        customer_name = c.get("customerName", "")
        lines.append(f"{i}. {contacts_name}（部门: {dept_name}，职务: {position}，客户: {customer_name}）")
    if total > len(records):
        lines.append(f"\n（显示前 {len(records)} 条，共有 {total} 条，可输入更精确的关键词缩小范围）")
    return "\n".join(lines)


def get_chance_info(records, index):
    """从查询结果中获取商机信息"""
    if index < 1 or index > len(records):
        return None
    c = records[index - 1]
    return {
        "chanceId": c.get("id", ""),
        "chanceCode": c.get("chanceCode", ""),
        "chanceProjectName": c.get("chanceName", ""),
        "chanceProjectSchedule": c.get("chanceStageName", ""),
        "groupAttentionStage": c.get("groupAttentionStage", ""),
    }


def query_clients(base_url, token, client_name=None, current=1, size=50):
    """查询客户列表（新版接口）"""
    url = f"{base_url}{CLIENT_QUERY_ENDPOINT}?current={current}&size={size}"
    if client_name:
        url += f"&customerName={urllib.parse.quote(client_name)}"
    return fetch_json_post(url, {}, token)


def query_clients_by_type_base(base_url, token, customer_type=None, customer_name=None, current=1, size=50):
    """查询客户列表（带类型）"""
    url = f"{base_url}{CLIENT_QUERY_ENDPOINT}?current={current}&size={size}"
    if customer_type:
        url += f"&customerType={customer_type}"
    if customer_name:
        url += f"&customerName={urllib.parse.quote(customer_name)}"
    return fetch_json_post(url, {}, token)


def query_contacts(base_url, token, customer_name=None, contacts_name=None, contacts_code=None):
    """查询对接人列表（新版接口）"""
    url = f"{base_url}{CONTACTS_QUERY_ENDPOINT}"
    params = {}
    if customer_name:
        params["customerName"] = customer_name
    if contacts_name:
        params["contactsName"] = contacts_name
    if contacts_code:
        params["contactsCode"] = contacts_code
    return fetch_json_post(url, {}, token, params=params)


def query_user_by_username(base_url, token, username):
    """根据用户名查询用户信息"""
    url = f"{base_url}{USER_QUERY_ENDPOINT}?current=1&size=10&username={urllib.parse.quote(username)}"
    return fetch_json(url, token)


def query_dept_tree(base_url, token):
    """查询部门树"""
    url = f"{base_url}{DEPT_TREE_ENDPOINT}"
    return fetch_json(url, token)


def get_dept_path_recursive(dept_tree, dept_id, path=None):
    """递归查找部门路径"""
    if path is None:
        path = []

    current_id = str(dept_tree.get("id", ""))
    target_id = str(dept_id)

    if current_id == target_id:
        path.append(dept_tree.get("name", ""))
        return path.copy()

    children = dept_tree.get("children", [])
    for child in children:
        result = get_dept_path_recursive(child, target_id, path.copy())
        if result:
            result.insert(0, dept_tree.get("name", ""))
            return result

    return None


def find_user_dept_path(dept_tree_list, dept_id):
    """查找用户的完整部门路径"""
    if not dept_id:
        return None
    target_id = str(dept_id)
    for top_dept in dept_tree_list:
        path = get_dept_path_recursive(top_dept, target_id)
        if path:
            return "/".join(path)
    return None


def get_user_with_dept(base_url, token, username):
    """获取用户信息及完整部门路径"""
    user_result = query_user_by_username(base_url, token, username)
    if user_result.get("code") != 0 or not user_result.get("data"):
        return None

    records = user_result["data"].get("records", [])
    if not records:
        return None

    user = records[0]
    dept_id = user.get("deptId")

    if dept_id:
        dept_result = query_dept_tree(base_url, token)
        if dept_result.get("code") == 0 and dept_result.get("data"):
            dept_tree = dept_result["data"]
            if isinstance(dept_tree, list):
                dept_path = find_user_dept_path(dept_tree, str(dept_id))
            else:
                dept_path = find_user_dept_path([dept_tree], str(dept_id))
            if dept_path:
                user["deptPath"] = dept_path

    return user


def normalize_field_names(data):
    """统一字段名：双向转换（用户字段 <-> 接口字段）"""
    if "chanceProjectName" in data and "projectName" not in data:
        data["projectName"] = data["chanceProjectName"]
    if "projectName" in data and "chanceProjectName" not in data:
        data["chanceProjectName"] = data["projectName"]
    if "chanceProjectSchedule" in data and "projectStage" not in data:
        data["projectStage"] = data["chanceProjectSchedule"]
    if "projectStage" in data and "chanceProjectSchedule" not in data:
        data["chanceProjectSchedule"] = data["projectStage"]
    return data


def validate_report_data(data):
    """校验日报数据，返回缺失字段列表"""
    missing = []

    day_report_type = data.get("dayReportType", 2)

    if day_report_type == 1:
        required = CHANCE_REQUIRED_FIELDS
    else:
        required = REQUIRED_FIELDS

    for field_key, field_name in required:
        if field_key not in data or data[field_key] is None or data[field_key] == "":
            missing.append((field_key, field_name))

    if "dayReportTime" not in data or not data["dayReportTime"]:
        if "date" in data and data["date"]:
            data["dayReportTime"] = data["date"]
        else:
            missing.append(("dayReportTime", "日报时间"))

    if "date" not in data or not data["date"]:
        if "dayReportTime" in data and data["dayReportTime"]:
            data["date"] = data["dayReportTime"]
        else:
            missing.append(("date", "日期"))

    return missing


def prepare_report_data(report_data, login_user=None, login_name=None):
    """准备提交数据"""
    normalize_field_names(report_data)

    day_report_type = report_data.get("dayReportType", 2)

    base = {
        "dayReportTime": report_data.get("dayReportTime", report_data.get("date", "")),
        "dayReportType": day_report_type,
        "dayPlanNow": report_data.get("dayPlanNow", "无"),
        "daySummarizeNow": report_data.get("daySummarizeNow", ""),
        "dayPlanNext": report_data.get("dayPlanNext", ""),
        "problemRisk": report_data.get("problemRisk", ""),
        "requestInstructions": report_data.get("requestInstructions", ""),
        "accompanyingPersonnelList": report_data.get("accompanyingPersonnelList", []),
    }

    if day_report_type == 1:
        base.update({
            "date": report_data.get("date", ""),
            "chanceId": report_data.get("chanceId", ""),
            "chanceCode": report_data.get("chanceCode", ""),
            "chanceProjectName": report_data.get("chanceProjectName", ""),
            "chanceProjectSchedule": report_data.get("chanceProjectSchedule", ""),
            "groupAttentionStage": report_data.get("groupAttentionStage", ""),
            "customerType": report_data.get("customerType", 1),
            "visitClientName": report_data.get("visitClientName", ""),
            "visitClientCode": report_data.get("visitClientCode", ""),
            "visitClientId": report_data.get("visitClientId", ""),
            "contractPersonCode": report_data.get("contractPersonCode", ""),
            "contractPersonName": report_data.get("contractPersonName", ""),
            "contractPersonDeptName": report_data.get("contractPersonDeptName", ""),
            "contractPersonPosition": report_data.get("contractPersonPosition", ""),
            "contractPersonDeptId": report_data.get("contractPersonDeptId", ""),
            "visitRecord": report_data.get("visitRecord", ""),
            "clientHope": report_data.get("clientHope", ""),
            "workHourProportion": report_data.get("workHourProportion", 0),
            "workHourProportionStatus": report_data.get("workHourProportionStatus", 0),
        })
    else:
        proportion = 0.0
        base.update({
            "date": report_data.get("date", ""),
            "chanceProjectName": report_data.get("chanceProjectName", ""),
            "workHourProportion": proportion,
            "chanceProjectSchedule": report_data.get("chanceProjectSchedule", ""),
            "projectCode": report_data.get("projectCode", ""),
            "projectManager": report_data.get("projectManager", ""),
            "workHourProportionStatus": report_data.get("workHourProportionStatus", 0),
        })

    return base


def submit_report(base_url, token, report_data, login_user=None, login_name=None):
    """提交日报"""
    url = f"{base_url}{REPORT_ENDPOINT}"
    data = [prepare_report_data(report_data, login_user, login_name)]

    report_user = login_user or login_name or ""
    params = None
    if report_user:
        params = {"createBy": report_user}

    return fetch_json_post(url, data, token, params=params)


def get_week_range(date_str):
    """获取某日期所在周的起止时间"""
    date = datetime.strptime(date_str, "%Y-%m-%d")
    monday = date - timedelta(days=date.weekday())
    sunday = monday + timedelta(days=6)
    return monday.strftime("%Y-%m-%d"), sunday.strftime("%Y-%m-%d")


def append_to_file(filepath, content):
    """追加内容到文件（不存在则创建）"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(content)


def generate_daily_report_md_files(report_data, report_user, report_name=None, token=None):
    """生成两个维度的日报汇总MD文件（区分项目和商机）"""
    report_date = report_data.get("date", "")
    day_report_type = report_data.get("dayReportType", 2)

    project_code = report_data.get("projectCode", "")
    chance_code = report_data.get("chanceCode", "")

    if day_report_type == 1:
        project_code = chance_code

    project_name = report_data.get(
        "chanceProjectName", report_data.get("projectName", "")
    )
    project_manager = report_data.get("projectManager", "")
    create_by = report_data.get("createBy") or report_user or ""
    user_display_name = report_name or create_by

    user_dept_path = None
    if token and create_by:
        user_info = get_user_with_dept(PM_BASE_URL, token, create_by)
        if user_info:
            user_dept_path = user_info.get("deptPath")

    summarize = report_data.get("daySummarizeNow", "无")
    plan = report_data.get("dayPlanNext", "无")
    summarize = (
        summarize.replace("今日：", "").replace("今日:", "").replace("今日", "").strip()
    )
    plan = plan.replace("明日：", "").replace("明日:", "").replace("明日", "").strip()

    week_start, week_end = get_week_range(report_date)

    base_dir = os.path.join(os.path.expanduser("~"), "nextclaw-temp", "daily-report")
    week_dir = os.path.join(base_dir, f"{week_start}_{week_end}")
    os.makedirs(week_dir, exist_ok=True)

    raw_json_file = os.path.join(week_dir, "raw_dailies.json")
    raw_data = []
    if os.path.exists(raw_json_file):
        with open(raw_json_file, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

    exists = any(
        d.get("date") == report_date
        and d.get("projectCode") == project_code
        and d.get("createBy") == create_by
        and d.get("dayReportType") == day_report_type
        for d in raw_data
    )
    if not exists:
        record = {
            "date": report_date,
            "projectCode": project_code,
            "projectName": project_name,
            "projectManager": project_manager,
            "createBy": create_by,
            "createName": user_display_name,
            "summarize": summarize or "无",
            "plan": plan or "无",
            "dayReportType": day_report_type,
            "reportTypeName": "商机日报" if day_report_type == 1 else "项目日报",
            "submittedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        if day_report_type == 1:
            record["chanceCode"] = report_data.get("chanceCode", "")
            record["chanceId"] = report_data.get("chanceId", "")
            record["visitClientName"] = report_data.get("visitClientName", "")
            record["contractPersonName"] = report_data.get("contractPersonName", "")
            record["visitRecord"] = report_data.get("visitRecord", "")
            record["clientHope"] = report_data.get("clientHope", "")

        raw_data.append(record)
        with open(raw_json_file, "w", encoding="utf-8") as f:
            json.dump(raw_data, f, ensure_ascii=False, indent=2)

    # 商机日报只写 users.md，项目日报写 projects.md + users.md
    if day_report_type != 1:
        projects_file = os.path.join(week_dir, "projects.md")
        projects_data = _load_md_structure(projects_file)
        if project_code not in projects_data:
            projects_data[project_code] = {
                "name": project_name,
                "manager": project_manager,
                "dates": {},
            }
        if report_date not in projects_data[project_code]["dates"]:
            projects_data[project_code]["dates"][report_date] = {}
        projects_data[project_code]["dates"][report_date][user_display_name] = {
            "summarize": summarize or "无",
            "plan": plan or "无",
        }
        _save_projects_md(projects_file, projects_data, week_start, week_end)

    users_file = os.path.join(week_dir, "users.md")
    users_data = _load_users_md_structure(users_file)
    if user_display_name not in users_data:
        users_data[user_display_name] = {"dates": {}}
    if report_date not in users_data[user_display_name]["dates"]:
        users_data[user_display_name]["dates"][report_date] = {}

    if day_report_type == 1:
        chance_name = report_data.get("chanceProjectName", "")
        visit_client_name = report_data.get("visitClientName", "")
        if chance_name:
            item_key = f"[商机]{chance_name}"
        else:
            item_key = f"[商机]{visit_client_name}"
    else:
        item_key = project_name

    users_data[user_display_name]["dates"][report_date][item_key] = {
        "projectName": project_name,
        "manager": project_manager,
        "summarize": summarize or "无",
        "plan": plan or "无",
        "dayReportType": day_report_type,
        "reportTypeName": "商机日报" if day_report_type == 1 else "项目日报",
        "workHourProportion": 0,
        "deptPath": user_dept_path,
        "problemRisk": report_data.get("problemRisk", ""),
        "requestInstructions": report_data.get("requestInstructions", ""),
    }

    if day_report_type == 1:
        visit_client_name = report_data.get("visitClientName", "")
        if visit_client_name:
            users_data[user_display_name]["dates"][report_date][item_key]["visitClientName"] = visit_client_name
        visit_client_code = report_data.get("visitClientCode", "")
        if visit_client_code:
            users_data[user_display_name]["dates"][report_date][item_key]["visitClientCode"] = visit_client_code
        contract_person_name = report_data.get("contractPersonName", "")
        if contract_person_name:
            users_data[user_display_name]["dates"][report_date][item_key]["contractPersonName"] = contract_person_name
        contract_person_code = report_data.get("contractPersonCode", "")
        if contract_person_code:
            users_data[user_display_name]["dates"][report_date][item_key]["contractPersonCode"] = contract_person_code
        contract_person_dept_name = report_data.get("contractPersonDeptName", "")
        if contract_person_dept_name:
            users_data[user_display_name]["dates"][report_date][item_key]["contractPersonDeptName"] = contract_person_dept_name
        contract_person_dept_id = report_data.get("contractPersonDeptId", "")
        if contract_person_dept_id:
            users_data[user_display_name]["dates"][report_date][item_key]["contractPersonDeptId"] = contract_person_dept_id
        contract_person_position = report_data.get("contractPersonPosition", "")
        if contract_person_position:
            users_data[user_display_name]["dates"][report_date][item_key]["contractPersonPosition"] = contract_person_position
        visit_record = report_data.get("visitRecord", "")
        if visit_record:
            users_data[user_display_name]["dates"][report_date][item_key]["visitRecord"] = visit_record
        client_hope = report_data.get("clientHope", "")
        if client_hope:
            users_data[user_display_name]["dates"][report_date][item_key]["clientHope"] = client_hope
        customer_type = report_data.get("customerType")
        if customer_type is not None:
            users_data[user_display_name]["dates"][report_date][item_key]["customerType"] = customer_type

    _save_users_md(users_file, users_data, week_start, week_end)

    return week_dir


def _load_md_structure(filepath):
    """加载项目维度的结构化数据"""
    data = {}
    if not os.path.exists(filepath):
        return data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    current_project = None
    current_date = None

    for line in lines:
        if line.startswith("## "):
            match = re.match(r"## (.+?)（(.+?)）", line)
            if match:
                project_name = match.group(1)
                project_code = match.group(2)
                current_project = project_code
                if project_code not in data:
                    data[project_code] = {
                        "name": project_name,
                        "manager": "",
                        "dates": {},
                    }
        elif line.startswith("**经理**: "):
            if current_project:
                data[current_project]["manager"] = line.replace("**经理**: ", "")
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_project and current_date:
                if current_date not in data[current_project]["dates"]:
                    data[current_project]["dates"][current_date] = {}
        elif line.startswith("- **"):
            parts = line.split("**")
            if len(parts) >= 3 and current_project and current_date:
                user_name = parts[1]
                rest = parts[2].replace("**：", "").replace("：", "").strip()
                if "。" in rest:
                    summarize, plan_part = rest.split("。", 1)
                    plan = plan_part.replace("明日：", "").strip()
                else:
                    summarize = rest
                    plan = ""
                data[current_project]["dates"][current_date][user_name] = {
                    "summarize": summarize.replace("今日：", "").strip(),
                    "plan": plan,
                }
    return data


def _load_users_md_structure(filepath):
    """加载人员维度的结构化数据"""
    data = {}
    if not os.path.exists(filepath):
        return data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    current_user = None
    current_date = None
    current_dept = None

    for line in lines:
        if line.startswith("## "):
            header = line.replace("## ", "").strip()
            dept_match = re.search(r"（部门：(.+?)）", header)
            if dept_match:
                current_dept = dept_match.group(1)
                current_user = header.replace(f"（部门：{current_dept}）", "").strip()
            else:
                current_user = header
                current_dept = None
            if current_user not in data:
                data[current_user] = {"dates": {}, "dept": current_dept}
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_user and current_date:
                if current_date not in data[current_user]["dates"]:
                    data[current_user]["dates"][current_date] = {}
        elif line.startswith("- **"):
            parts = line.split("**")
            if len(parts) >= 2 and current_user and current_date:
                title = parts[1]
                
                day_report_type = 2
                if "商机" in title:
                    day_report_type = 1
                
                item_data = {
                    "itemKey": title,
                    "dayReportType": day_report_type,
                }
                
                if day_report_type == 1:
                    title_parts = title.replace("【商机日报】", "").strip().split("|")
                    if len(title_parts) >= 1:
                        item_data["visitClientName"] = title_parts[0].strip()
                    for part in title_parts[1:]:
                        if "对接人：" in part:
                            item_data["contractPersonName"] = part.replace("对接人：", "").strip()
                else:
                    proj_name = title.replace("【项目日报】", "").strip()
                    if proj_name:
                        item_data["projectName"] = proj_name
                
                data[current_user]["dates"][current_date][title] = item_data
        
        elif line.startswith("  - "):
            if current_user and current_date:
                content = line.replace("  - ", "").strip()
                last_date_data = data[current_user]["dates"].get(current_date, {})
                if last_date_data:
                    last_key = list(last_date_data.keys())[-1]
                    item_data = last_date_data[last_key]
                    
                    if content.startswith("拜访记录："):
                        item_data["visitRecord"] = content.replace("拜访记录：", "").strip()
                    elif content.startswith("客户期望："):
                        item_data["clientHope"] = content.replace("客户期望：", "").strip()
                    elif content.startswith("下一步计划："):
                        item_data["plan"] = content.replace("下一步计划：", "").strip()
                    elif content.startswith("今日："):
                        item_data["summarize"] = content.replace("今日：", "").strip()
                    elif content.startswith("明日："):
                        item_data["plan"] = content.replace("明日：", "").strip()
                    elif content.startswith("问题与风险："):
                        item_data["problemRisk"] = content.replace("问题与风险：", "").strip()
                    elif content.startswith("请示事项："):
                        item_data["requestInstructions"] = content.replace("请示事项：", "").strip()
    return data


def _load_chances_md_structure(filepath):
    """加载商机维度的结构化数据"""
    data = {}
    if not os.path.exists(filepath):
        return data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    current_chance = None
    current_date = None

    for line in lines:
        if line.startswith("## "):
            match = re.match(r"## (.+?)（(.+?)）", line)
            if match:
                chance_name = match.group(1)
                chance_code = match.group(2)
                current_chance = chance_code
                if chance_code not in data:
                    data[chance_code] = {
                        "name": chance_name,
                        "dates": {},
                    }
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_chance and current_date:
                if current_date not in data[current_chance]["dates"]:
                    data[current_chance]["dates"][current_date] = {}
        elif line.startswith("- **"):
            parts = line.split("**")
            if len(parts) >= 3 and current_chance and current_date:
                user_name = parts[1]
                rest = parts[2].replace("**：", "").replace("：", "").strip()
                if "。" in rest:
                    summarize, plan_part = rest.split("。", 1)
                    plan = plan_part.replace("明日：", "").strip()
                else:
                    summarize = rest
                    plan = ""
                data[current_chance]["dates"][current_date][user_name] = {
                    "summarize": summarize.replace("今日：", "").strip(),
                    "plan": plan,
                }
    return data


def _save_chances_md(filepath, data, week_start, week_end):
    """保存商机维度的MD文件"""
    lines = []
    lines.append("# 本周商机日报汇总\n")
    lines.append(f"> 统计周期：{week_start} ~ {week_end}\n")

    for chance_code in sorted(data.keys()):
        chance = data[chance_code]
        lines.append(f"\n## {chance['name']}（{chance_code}）\n")

        for date in sorted(chance["dates"].keys()):
            lines.append(f"\n### {date}\n")
            for user_name, user_data in sorted(chance["dates"][date].items()):
                summarize = user_data.get("summarize", "无")
                plan = user_data.get("plan", "无")
                visit_client = user_data.get("visitClientName", "")
                contract_person = user_data.get("contractPersonName", "")
                visit_record = user_data.get("visitRecord", "")
                client_hope = user_data.get("clientHope", "")

                summarize = (
                    summarize.replace("今日：", "")
                    .replace("今日:", "")
                    .replace("今日", "")
                    .strip()
                )
                plan = (
                    plan.replace("明日：", "")
                    .replace("明日:", "")
                    .replace("明日", "")
                    .strip()
                )
                if summarize == "无":
                    continue

                detail_parts = []
                if visit_client:
                    detail_parts.append(f"客户: {visit_client}")
                if contract_person:
                    detail_parts.append(f"对接人: {contract_person}")
                if visit_record:
                    detail_parts.append(f"拜访记录: {visit_record}")
                if client_hope:
                    detail_parts.append(f"客户期望: {client_hope}")

                detail = " | ".join(detail_parts)
                if plan and plan != "无":
                    lines.append(
                        f"- **{user_name}**：今日：{summarize}。明日：{plan}\n"
                    )
                    if detail:
                        lines.append(f"  - {detail}\n")
                else:
                    lines.append(f"- **{user_name}**：今日：{summarize}\n")
                    if detail:
                        lines.append(f"  - {detail}\n")
        lines.append("\n---\n")

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)


def _save_projects_md(filepath, data, week_start, week_end):
    """保存项目维度的MD文件"""
    lines = []
    lines.append("# 本周项目日报汇总\n")
    lines.append(f"> 统计周期：{week_start} ~ {week_end}\n")

    for project_code in sorted(data.keys()):
        project = data[project_code]
        lines.append(f"\n## {project['name']}（{project_code}）\n")
        if project["manager"]:
            lines.append(f"**经理**: {project['manager']}\n")

        for date in sorted(project["dates"].keys()):
            lines.append(f"\n### {date}\n")
            for user_name, user_data in sorted(project["dates"][date].items()):
                summarize = user_data.get("summarize", "无")
                plan = user_data.get("plan", "无")
                summarize = (
                    summarize.replace("今日：", "")
                    .replace("今日:", "")
                    .replace("今日", "")
                    .strip()
                )
                plan = (
                    plan.replace("明日：", "")
                    .replace("明日:", "")
                    .replace("明日", "")
                    .strip()
                )
                if summarize == "无":
                    continue
                if plan and plan != "无":
                    lines.append(
                        f"- **{user_name}**：今日：{summarize}。明日：{plan}\n"
                    )
                else:
                    lines.append(f"- **{user_name}**：今日：{summarize}\n")
        lines.append("\n---\n")

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)


def _save_users_md(filepath, data, week_start, week_end):
    """保存人员维度的 MD 文件"""
    lines = []
    lines.append("# 本周个人日报汇总\n")
    lines.append(f"> 统计周期：{week_start} ~ {week_end}\n")

    user_list = sorted(data.keys())
    for idx, user_name in enumerate(user_list):
        user = data[user_name]
        
        first_dept = user.get("dept")
        if not first_dept:
            for date in user.get("dates", {}).keys():
                for item_key, item_data in user["dates"][date].items():
                    dept_path = item_data.get("deptPath")
                    if dept_path:
                        first_dept = dept_path
                        break
                if first_dept:
                    break

        user_header = user_name
        if first_dept:
            user_header += f"（部门：{first_dept}）"

        lines.append(f"\n## {user_header}\n")

        for date in sorted(user["dates"].keys()):
            lines.append(f"\n### {date}\n")
            
            items = user["dates"][date]
            item_list = sorted(items.items(), key=lambda x: (x[1].get("dayReportType", 2), x[0]))
            
            for item_key, project_data in item_list:
                day_report_type = project_data.get("dayReportType", 2)

                if day_report_type == 1:
                    visit_client_name = project_data.get("visitClientName", "")
                    chance_name = project_data.get("chanceProjectName", "")
                    contract_person_name = project_data.get("contractPersonName", "")
                    contract_person_dept = project_data.get("contractPersonDeptName", "")
                    contract_person_position = project_data.get("contractPersonPosition", "")
                    visit_record = project_data.get("visitRecord", "")
                    client_hope = project_data.get("clientHope", "")
                    plan = project_data.get("plan", "")

                    title = "【商机日报】"
                    if visit_client_name:
                        title += visit_client_name
                    if contract_person_name:
                        title += f"（对接人：{contract_person_name}）"

                    lines.append(f"- **{title}**\n")
                    if visit_record:
                        lines.append(f"  - 拜访记录：{visit_record}\n")
                    if client_hope:
                        lines.append(f"  - 客户期望：{client_hope}\n")
                    if plan:
                        lines.append(f"  - 下一步计划：{plan}\n")
                else:
                    summarize = project_data.get("summarize", "")
                    plan = project_data.get("plan", "")
                    project_name = project_data.get("projectName", "")
                    problem_risk = project_data.get("problemRisk", "")
                    request_instructions = project_data.get("requestInstructions", "")

                    title = f"【项目日报】{project_name}" if project_name else "【项目日报】"

                    lines.append(f"- **{title}**\n")
                    if summarize:
                        lines.append(f"  - 今日：{summarize}\n")
                    if plan:
                        lines.append(f"  - 明日：{plan}\n")
                    if problem_risk:
                        lines.append(f"  - 问题与风险：{problem_risk}\n")
                    if request_instructions:
                        lines.append(f"  - 请示事项：{request_instructions}\n")
        
        if idx < len(user_list) - 1:
            lines.append("\n---\n")

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)


def format_missing_fields_message(missing):
    """格式化缺失字段提示"""
    lines = ["请补充以下信息："]
    name_map = {
        "date": "日期",
        "projectName": "项目名称",
        "projectStage": "项目阶段",
        "projectCode": "项目编号",
        "projectManager": "项目经理",
        "daySummarizeNow": "今日工作总结",
        "dayPlanNext": "下一步计划",
        "dayReportType": "日报类型",
        "chanceId": "商机ID",
        "chanceCode": "商机编码",
        "chanceProjectName": "商机/项目名称",
        "chanceProjectSchedule": "商机/项目阶段",
        "groupAttentionStage": "集团关注项目阶段",
        "customerType": "客户类型",
        "visitClientName": "拜访客户",
        "visitClientCode": "拜访客户编码",
        "visitClientId": "拜访客户ID",
        "contractPersonCode": "对接人code",
        "contractPersonName": "对接人",
        "contractPersonDeptName": "对接部门",
        "contractPersonPosition": "对接人职务",
        "contractPersonDeptId": "对接人部门ID",
        "visitRecord": "拜访记录",
        "clientHope": "客户期望",
        "dayPlanNow": "今日工作计划",
    }
    for i, (key, name) in enumerate(missing, 1):
        display_name = name_map.get(key, name)
        lines.append(f"{i}. {display_name}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="日报填写脚本")
    parser.add_argument(
        "--submit",
        dest="submit",
        action="store_true",
        help="生成参数文件并提交",
    )
    parser.add_argument(
        "--validate", dest="validate", action="store_true", help="仅校验参数"
    )
    parser.add_argument(
        "--json-file", dest="json_file", help="从文件读取日报参数（备用）"
    )
    parser.add_argument("--date", dest="date", help="日期（YYYY-MM-DD，默认当天）")
    parser.add_argument("--project-code", dest="project_code", help="项目编号")
    parser.add_argument("--project-name", dest="project_name", help="项目名称")
    parser.add_argument("--project-stage", dest="project_stage", help="项目阶段")
    parser.add_argument("--project-manager", dest="project_manager", help="项目经理")
    parser.add_argument(
        "--day-summarize-now", dest="day_summarize_now", help="今日工作总结"
    )
    parser.add_argument("--day-plan-next", dest="day_plan_next", help="明日工作计划")
    parser.add_argument("--problem-risk", dest="problem_risk", help="问题与风险（选填）")
    parser.add_argument(
        "--request-instructions", dest="request_instructions", help="请示事项（选填）"
    )
    parser.add_argument(
        "--day-report-type",
        dest="day_report_type",
        type=int,
        default=2,
        help="日报类型（默认2）",
    )
    parser.add_argument(
        "-q",
        "--query-projects",
        dest="query_projects",
        nargs="?",
        const="",
        default=None,
        type=str,
        help="根据项目名称查询项目列表（可选，不传则查询全部）",
    )
    parser.add_argument(
        "-qc",
        "--query-chances",
        dest="query_chances",
        nargs="?",
        const="",
        default=None,
        type=str,
        help="根据商机名称查询商机列表（可选，不传则查询全部）",
    )
    parser.add_argument(
        "--customer-code",
        dest="customer_code",
        type=str,
        help="客户编码（与 --query-chances 配合使用，按客户查询商机）",
    )
    parser.add_argument(
        "--query-clients",
        dest="query_clients",
        nargs="?",
        const="",
        default=None,
        type=str,
        help="根据客户名称查询客户列表（可选，不传则查询全部）",
    )
    parser.add_argument(
        "--query-contacts",
        dest="query_contacts",
        nargs="?",
        const="",
        default=None,
        type=str,
        help="根据对接人名称查询对接人列表（可选）",
    )
    parser.add_argument(
        "--customer-name",
        dest="customer_name",
        type=str,
        help="客户名称（可选，用于过滤对接人，或与 --query-chances 配合查询该客户下的商机）",
    )
    parser.add_argument(
        "--select", dest="select", help="从查询结果中选择项目/商机（数字索引）"
    )
    parser.add_argument("--report-user", dest="report_user", help="填报人用户名（默认为登录用户）")
    parser.add_argument("--report-name", dest="report_name", help="填报人姓名（默认为登录用户名）")

    parser.add_argument("--chance-id", dest="chance_id", help="商机ID（非必填）")
    parser.add_argument("--chance-code", dest="chance_code", help="商机编码（非必填）")
    parser.add_argument("--chance-name", dest="chance_name", help="商机/项目名称（非必填）")
    parser.add_argument("--chance-schedule", dest="chance_schedule", help="商机/项目阶段（非必填）")
    parser.add_argument("--group-attention-stage", dest="group_attention_stage", help="集团关注项目阶段（非必填）")
    parser.add_argument("--customer-type", dest="customer_type", type=int, default=1, help="客户类型（1=客户 2=合作伙伴，必填）")
    parser.add_argument("--visit-client-name", dest="visit_client_name", help="拜访客户（必填）")
    parser.add_argument("--visit-client-code", dest="visit_client_code", help="拜访客户编码（非必填）")
    parser.add_argument("--visit-client-id", dest="visit_client_id", help="拜访客户ID（非必填）")
    parser.add_argument("--contract-person-code", dest="contract_person_code", help="对接人code（非必填）")
    parser.add_argument("--contract-person-name", dest="contract_person_name", help="对接人（必填）")
    parser.add_argument("--contract-person-dept-name", dest="contract_person_dept_name", help="对接部门（必填）")
    parser.add_argument("--contract-person-position", dest="contract_person_position", help="对接人职务（必填）")
    parser.add_argument("--contract-person-dept-id", dest="contract_person_dept_id", help="对接人部门ID（非必填）")
    parser.add_argument("--visit-record", dest="visit_record", help="拜访记录（必填）")
    parser.add_argument("--client-hope", dest="client_hope", help="客户期望（必填）")
    parser.add_argument("--day-plan-now", dest="day_plan_now", help="今日工作计划（非必填）")

    args = parser.parse_args()

    base_url = PM_BASE_URL
    username = PM_USERNAME
    password = PM_PASSWORD

    if (
        not args.submit
        and not args.validate
        and args.query_projects is None
        and args.query_chances is None
        and args.query_clients is None
        and args.query_contacts is None
        and not args.select
    ):
        print("""
日报填写脚本

用法:
  python daily-report.py --query-projects <项目名称关键词>
  python daily-report.py --submit --project-code <编号> --project-name <名称> ...
""")
        return

    temp_dir = os.path.join(os.path.expanduser("~"), "nextclaw-temp", "daily-report")

    def get_week_dir(date_str=None):
        if date_str:
            date = datetime.strptime(date_str, "%Y-%m-%d")
        else:
            date = datetime.now()
        monday = date - timedelta(days=date.weekday())
        sunday = monday + timedelta(days=6)
        return os.path.join(
            temp_dir, f"{monday.strftime('%Y-%m-%d')}_{sunday.strftime('%Y-%m-%d')}"
        )

    report_user = args.report_user or "unknown"
    report_name = args.report_name or report_user

    query_file_name = (
        f"projects_query_{report_user}.json"
        if report_user
        else f"projects_query_{username}.json"
    )

    if args.query_projects is not None:
        if report_user == "unknown":
            print("[日报] 错误: 请确认填报人信息", file=sys.stderr)
            return
        if not username or not password:
            print("错误: 需要登录凭据，请联系管理员", file=sys.stderr)
            return
        try:
            token = login(base_url, username, password)
            result = query_projects(base_url, token, report_user, args.query_projects)
            if result.get("code") == 0 and result.get("data"):
                records = result["data"].get("records", [])
                total = result["data"].get("total", 0)
                week_dir = get_week_dir()
                os.makedirs(week_dir, exist_ok=True)
                query_file = os.path.join(week_dir, query_file_name)
                with open(query_file, "w", encoding="utf-8") as f:
                    json.dump(
                        {"records": records, "total": total}, f, ensure_ascii=False
                    )
                print(format_projects_for_selection(records, total))
                if records:
                    print(
                        f"\n请使用 --select <数字> 选择项目",
                        file=sys.stderr,
                    )
            else:
                print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
                return
        except Exception as e:
            print(f"[日报] 错误: {e}", file=sys.stderr)
            return
        return

    if args.query_chances is not None:
        if not username or not password:
            print("错误: 需要登录凭据，请联系管理员", file=sys.stderr)
            return
        try:
            token = login(base_url, username, password)
            result = query_chances(base_url, token, args.query_chances, args.customer_code)
            if result.get("code") == 0 and result.get("data"):
                records = result["data"].get("records", [])
                total = result["data"].get("total", 0)
                week_dir = get_week_dir()
                os.makedirs(week_dir, exist_ok=True)
                query_file_name = f"chances_query_{report_user}.json"
                query_file = os.path.join(week_dir, query_file_name)
                with open(query_file, "w", encoding="utf-8") as f:
                    json.dump(
                        {"records": records, "total": total}, f, ensure_ascii=False
                    )
                print(format_chances_for_selection(records, total))
                if records:
                    print(
                        f"\n请使用 --select <数字> 选择商机",
                        file=sys.stderr,
                    )
            else:
                print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
                return
        except Exception as e:
            print(f"[日报] 错误: {e}", file=sys.stderr)
            return
        return

    if args.query_clients is not None:
        if not username or not password:
            print("错误: 需要登录凭据，请联系管理员", file=sys.stderr)
            return
        try:
            token = login(base_url, username, password)
            result = query_clients(base_url, token, args.query_clients)
            if result.get("code") == 0 and result.get("data"):
                records = result["data"].get("records", [])
                total = result["data"].get("total", 0)
                week_dir = get_week_dir()
                os.makedirs(week_dir, exist_ok=True)
                query_file_name = f"clients_query_{report_user}.json"
                query_file = os.path.join(week_dir, query_file_name)
                with open(query_file, "w", encoding="utf-8") as f:
                    json.dump(
                        {"records": records, "total": total}, f, ensure_ascii=False
                    )
                print(format_clients_for_selection(records, total))
                if records:
                    print(
                        f"\n请使用 --select <数字> 选择客户",
                        file=sys.stderr,
                    )
            else:
                print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
                return
        except Exception as e:
            print(f"[日报] 错误: {e}", file=sys.stderr)
            return
        return

    if args.query_contacts is not None:
        if not username or not password:
            print("错误: 需要登录凭据，请联系管理员", file=sys.stderr)
            return
        try:
            token = login(base_url, username, password)
            result = query_contacts(base_url, token, customer_name=args.customer_name, contacts_name=args.query_contacts)
            if result.get("code") == 0 and result.get("data"):
                records = result["data"].get("records", [])
                total = result["data"].get("total", 0)
                week_dir = get_week_dir()
                os.makedirs(week_dir, exist_ok=True)
                query_file_name = f"contacts_query_{report_user}.json"
                query_file = os.path.join(week_dir, query_file_name)
                with open(query_file, "w", encoding="utf-8") as f:
                    json.dump(
                        {"records": records, "total": total}, f, ensure_ascii=False
                    )
                print(format_contacts_for_selection(records, total))
                if records:
                    print(
                        f"\n请使用 --select <数字> 选择对接人",
                        file=sys.stderr,
                    )
            else:
                print(f"查询失败: {result.get('message', '未知错误')}", file=sys.stderr)
                return
        except Exception as e:
            print(f"[日报] 错误: {e}", file=sys.stderr)
            return
        return

    if args.select:
        week_dir = get_week_dir()

        possible_files = [
            f"projects_query_{report_user}.json",
            f"chances_query_{report_user}.json",
            f"clients_query_{report_user}.json",
        ]

        query_file = None
        latest_mtime = 0
        for f in possible_files:
            fp = os.path.join(week_dir, f)
            if os.path.exists(fp):
                mtime = os.path.getmtime(fp)
                if mtime > latest_mtime:
                    latest_mtime = mtime
                    query_file = fp

        if not query_file:
            print(
                "错误: 没有可选择的项目/商机/客户，请先使用查询命令",
                file=sys.stderr,
            )
            return
        with open(query_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            records = data.get("records", [])

        if "customerCode" in (records[0] if records else {}) and "chanceCode" not in (records[0] if records else {}):
            client_info = get_client_info(records, int(args.select))
            if not client_info:
                print(
                    f"错误: 无效的选择，请输入 1-{len(records)} 之间的数字", file=sys.stderr
                )
                return
            print(json.dumps(client_info, ensure_ascii=False, indent=2))
        elif "chanceCode" in records[0] if records else False:
            chance_info = get_chance_info(records, int(args.select))
            if not chance_info:
                print(
                    f"错误: 无效的选择，请输入 1-{len(records)} 之间的数字", file=sys.stderr
                )
                return

            if username and password:
                try:
                    token = login(base_url, username, password)
                    chance_id = chance_info.get("chanceId")
                    if chance_id:
                        chance_detail = get_chance_detail(base_url, token, chance_id)
                        if chance_detail.get("code") == 0 and chance_detail.get("data"):
                            detail = chance_detail["data"]
                            chance_info["visitClientName"] = detail.get("customerName", "")
                            chance_info["visitClientCode"] = detail.get("customerCode", "")
                            chance_info["visitClientId"] = detail.get("customerId", "")
                            chance_info["customerType"] = detail.get("customerType", 1)

                            linkman = detail.get("linkman", {}) or {}
                            chance_info["contractPersonCode"] = linkman.get("linkmanCode", "")
                            chance_info["contractPersonName"] = linkman.get("linkmanName", "")
                            chance_info["contractPersonDeptName"] = linkman.get("deptName", "")
                            chance_info["contractPersonPosition"] = linkman.get("position", "")
                            chance_info["contractPersonDeptId"] = linkman.get("deptId", "")
                except Exception as e:
                    print(f"[警告] 自动补充客户信息失败: {e}，将使用基础商机信息", file=sys.stderr)

            print(json.dumps(chance_info, ensure_ascii=False, indent=2))
        else:
            project_info = get_project_info(records, int(args.select))
            if not project_info:
                print(
                    f"错误: 无效的选择，请输入 1-{len(records)} 之间的数字", file=sys.stderr
                )
                return
            print(json.dumps(project_info, ensure_ascii=False, indent=2))
        return

    if args.validate:
        report_data = {}
        if args.json_file:
            try:
                with open(args.json_file, "r", encoding="utf-8") as f:
                    report_data = json.load(f)
            except json.JSONDecodeError as e:
                print(f"错误: JSON格式解析失败: {e}", file=sys.stderr)
                return
        else:
            if args.project_code:
                report_data["projectCode"] = args.project_code
            if args.project_name:
                report_data["projectName"] = args.project_name
            if args.project_stage:
                report_data["projectStage"] = args.project_stage
            if args.project_manager:
                report_data["projectManager"] = args.project_manager
            if args.day_summarize_now:
                report_data["daySummarizeNow"] = args.day_summarize_now
            if args.day_plan_next:
                report_data["dayPlanNext"] = args.day_plan_next
            if args.problem_risk:
                report_data["problemRisk"] = args.problem_risk
            if args.request_instructions:
                report_data["requestInstructions"] = args.request_instructions
            if args.date:
                report_data["date"] = args.date
                report_data["dayReportTime"] = args.date
            else:
                report_data["date"] = datetime.now().strftime("%Y-%m-%d")
                report_data["dayReportTime"] = report_data["date"]
            report_data["dayReportType"] = args.day_report_type

        normalize_field_names(report_data)
        missing = validate_report_data(report_data)
        if missing:
            print(format_missing_fields_message(missing), file=sys.stderr)
            return
        print(
            json.dumps(
                {"valid": True, "data": report_data}, ensure_ascii=False, indent=2
            )
        )
        return

    report_data = {}
    if args.json_file:
        try:
            with open(args.json_file, "r", encoding="utf-8") as f:
                report_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"错误: JSON格式解析失败: {e}", file=sys.stderr)
            return

    if args.project_code:
        report_data["projectCode"] = args.project_code
    if args.project_name:
        report_data["projectName"] = args.project_name
    if args.project_stage:
        report_data["projectStage"] = args.project_stage
    if args.project_manager:
        report_data["projectManager"] = args.project_manager
    if args.day_summarize_now:
        report_data["daySummarizeNow"] = args.day_summarize_now
    if args.day_plan_next:
        report_data["dayPlanNext"] = args.day_plan_next
    if args.problem_risk:
        report_data["problemRisk"] = args.problem_risk
    if args.request_instructions:
        report_data["requestInstructions"] = args.request_instructions
    if args.date:
        report_data["date"] = args.date
        report_data["dayReportTime"] = args.date
    elif "date" not in report_data:
        report_data["date"] = datetime.now().strftime("%Y-%m-%d")
        report_data["dayReportTime"] = report_data["date"]

    report_data["dayReportType"] = args.day_report_type

    if args.day_report_type == 1:
        if args.chance_id:
            report_data["chanceId"] = args.chance_id
        if args.chance_code:
            report_data["chanceCode"] = args.chance_code
        if args.chance_name:
            report_data["chanceProjectName"] = args.chance_name
        if args.chance_schedule:
            report_data["chanceProjectSchedule"] = args.chance_schedule
        if args.group_attention_stage:
            report_data["groupAttentionStage"] = args.group_attention_stage
        if args.customer_type:
            report_data["customerType"] = args.customer_type
        if args.visit_client_name:
            report_data["visitClientName"] = args.visit_client_name
        if args.visit_client_code:
            report_data["visitClientCode"] = args.visit_client_code
        if args.visit_client_id:
            report_data["visitClientId"] = args.visit_client_id
        if args.contract_person_code:
            report_data["contractPersonCode"] = args.contract_person_code
        if args.contract_person_name:
            report_data["contractPersonName"] = args.contract_person_name
        if args.contract_person_dept_name:
            report_data["contractPersonDeptName"] = args.contract_person_dept_name
        if args.contract_person_position:
            report_data["contractPersonPosition"] = args.contract_person_position
        if args.contract_person_dept_id:
            report_data["contractPersonDeptId"] = args.contract_person_dept_id
        if args.visit_record:
            report_data["visitRecord"] = args.visit_record
        if args.client_hope:
            report_data["clientHope"] = args.client_hope
        if args.day_plan_now:
            report_data["dayPlanNow"] = args.day_plan_now

    normalize_field_names(report_data)
    missing = validate_report_data(report_data)

    if missing:
        print(format_missing_fields_message(missing), file=sys.stderr)
        return

    prepared_data = prepare_report_data(report_data)

    day_report_type = prepared_data.get("dayReportType", 2)

    print("=" * 50, flush=True)
    print("日报预览：", flush=True)
    print("=" * 50, flush=True)
    print(f"日期：{prepared_data.get('date', '')}", flush=True)
    print(f"日报类型：{'商机日报' if day_report_type == 1 else '项目日报'}", flush=True)

    if day_report_type == 1:
        print(f"客户：{prepared_data.get('visitClientName', '')}", flush=True)
        print(f"客户编码：{prepared_data.get('visitClientCode', '')}", flush=True)
        print(f"客户类型：{'客户' if prepared_data.get('customerType') == 1 else '合作伙伴'}", flush=True)
        print(f"对接人：{prepared_data.get('contractPersonName', '')}", flush=True)
        print(f"拜访记录：{prepared_data.get('visitRecord', '')}", flush=True)
    else:
        print(f"项目：{prepared_data.get('chanceProjectName', '')}", flush=True)
        print(f"编号：{prepared_data.get('projectCode', '')}", flush=True)
        print(f"经理：{prepared_data.get('projectManager', '')}", flush=True)
        print(f"阶段：{prepared_data.get('chanceProjectSchedule', '')}", flush=True)

    print(f"工时：{prepared_data.get('workHourProportion', 0)}", flush=True)
    print(f"今日总结：{prepared_data.get('daySummarizeNow', '')}", flush=True)
    print(f"明日计划：{prepared_data.get('dayPlanNext', '')}", flush=True)
    print("=" * 50, flush=True)
    print(flush=True)

    week_dir = get_week_dir(prepared_data["date"])
    os.makedirs(week_dir, exist_ok=True)

    now = datetime.now().strftime("%Y%m%d%H%M%S")
    file_user = args.report_user if args.report_user else username

    if day_report_type == 1:
        file_name = f"param_chance_{prepared_data.get('visitClientCode', 'unknown')}_{file_user}_{now}.json"
    else:
        file_name = f"param_{prepared_data.get('projectCode', 'unknown')}_{file_user}_{now}.json"
    param_file = os.path.join(week_dir, file_name)

    with open(param_file, "w", encoding="utf-8") as f:
        json.dump(prepared_data, f, ensure_ascii=False, indent=2)

    print(f"[日报] 参数文件已生成：{param_file}", flush=True)

    if not username or not password:
        print("错误: 需要登录凭据", file=sys.stderr)
        if os.path.exists(param_file):
            os.remove(param_file)
        return

    try:
        print("[日报] 正在登录...", flush=True)
        token = login(base_url, username, password)
        print("[日报] 登录成功", flush=True)

        print("[日报] 正在提交日报...", flush=True)
        sys.stdout.flush()

        if report_user == "unknown":
            print("[日报] 错误: 请确认填报人信息", file=sys.stderr)
            if os.path.exists(param_file):
                os.remove(param_file)
            return

        report_name = args.report_name or report_user

        result = submit_report(base_url, token, prepared_data, report_user, report_name)

        if result.get("code") == 0:
            try:
                result_data = result.get("data", {})
                if isinstance(result_data, str):
                    result_data = {}
                prepared_data.update(result_data)
            except:
                pass

            md_dir = generate_daily_report_md_files(prepared_data, report_user, report_name, token)

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
            if os.path.exists(param_file):
                os.remove(param_file)
            return

    except Exception as e:
        print(f"[日报] 运行时错误: {e}", flush=True)
        if os.path.exists(param_file):
            os.remove(param_file)
        return


if __name__ == "__main__":
    main()
