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

import os
import re
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta

DEFAULT_BASE_URL = "http://shangji.dcg-internal-services.dev.dcginner:10003/api"
LOGIN_ENDPOINT = "/admin/oauth2/token"
WEEK_REPORT_ENDPOINT = "/admin/weekReport"
DAY_REPORT_QUERY_ENDPOINT = "/admin/day/report/page"
DEPT_TREE_ENDPOINT = "/admin/dept/tree"
USER_PAGE_ENDPOINT = "/admin/user/page"

PM_BASE_URL = os.environ.get("PM_BASE_URL")
PM_BASIC_AUTH = os.environ.get("PM_BASIC_AUTH")
PM_USERNAME = os.environ.get("PM_USERNAME")
PM_PASSWORD = os.environ.get("PM_PASSWORD")


def post_form(url, form_data, timeout=120):
    data = urllib.parse.urlencode(form_data).encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "nextclaw-weekly-report/1.0",
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


def fetch_json_get(url, token, timeout=120):
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-weekly-report/1.0",
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
        "User-Agent": "nextclaw-weekly-report/1.0",
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


def get_week_range(week_offset=0, week_start_date=None, week_end_date=None):
    if week_start_date and week_end_date:
        return datetime.strptime(week_start_date, "%Y-%m-%d"), datetime.strptime(week_end_date, "%Y-%m-%d")
    
    today = datetime.now()
    if week_offset != 0:
        today = today - timedelta(days=7 * abs(week_offset))
    
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def get_daily_report_week_dir(week_start, week_end):
    base_dir = os.path.join(os.path.expanduser("~"), "nextclaw-temp", "daily-report")
    week_dir = os.path.join(base_dir, f"{week_start.strftime('%Y-%m-%d')}_{week_end.strftime('%Y-%m-%d')}")
    if os.path.exists(week_dir):
        return week_dir
    return None


def parse_users_md_new(filepath):
    """解析新版 users.md 格式"""
    users_data = {}
    if not os.path.exists(filepath):
        return users_data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    current_user = None
    current_date = None
    current_item_key = None
    current_item_data = None

    for line in lines:
        if line.startswith("## "):
            header = line.replace("## ", "").strip()
            dept_match = re.search(r"（部门：(.+?)）", header)
            if dept_match:
                current_user = header.replace(f"（部门：{dept_match.group(1)}）", "").strip()
            else:
                current_user = header
            if current_user not in users_data:
                users_data[current_user] = {"dates": {}, "dept": dept_match.group(1) if dept_match else None}
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_user and current_date:
                if current_date not in users_data[current_user]["dates"]:
                    users_data[current_user]["dates"][current_date] = []
            current_item_key = None
            current_item_data = None
        elif line.startswith("- **"):
            parts = line.split("**")
            if len(parts) >= 2 and current_user and current_date:
                current_item_key = parts[1]
                rest = parts[2].strip()
                if rest.startswith(":") or rest.startswith(":"):
                    rest = rest[1:].strip()
                
                item_data = {
                    "itemKey": current_item_key,
                    "dayReportType": 1 if "商机" in current_item_key else 2,
                }
                
                if item_data["dayReportType"] == 1:
                    title_parts = current_item_key.replace("【商机日报】", "").strip().split("|")
                    if len(title_parts) >= 1:
                        item_data["visitClientName"] = title_parts[0].strip()
                    for part in title_parts[1:]:
                        if "对接人：" in part:
                            item_data["contractPersonName"] = part.replace("对接人：", "").strip()
                else:
                    proj_name = current_item_key.replace("【项目日报】", "").strip()
                    if proj_name:
                        item_data["projectName"] = proj_name
                
                users_data[current_user]["dates"][current_date].append(item_data)
                current_item_data = item_data
        elif line.startswith("  - ") and current_item_data is not None:
            content_text = line.replace("  - ", "").strip()
            if content_text.startswith("拜访记录："):
                current_item_data["visitRecord"] = content_text.replace("拜访记录：", "").strip()
            elif content_text.startswith("客户期望："):
                current_item_data["clientHope"] = content_text.replace("客户期望：", "").strip()
            elif content_text.startswith("下一步计划："):
                current_item_data["plan"] = content_text.replace("下一步计划：", "").strip()
            elif content_text.startswith("今日："):
                current_item_data["summarize"] = content_text.replace("今日：", "").strip()
            elif content_text.startswith("明日："):
                current_item_data["plan"] = content_text.replace("明日：", "").strip()
            elif content_text.startswith("问题与风险："):
                current_item_data["problemRisk"] = content_text.replace("问题与风险：", "").strip()
            elif content_text.startswith("请示事项："):
                current_item_data["requestInstructions"] = content_text.replace("请示事项：", "").strip()

    return users_data


def parse_projects_md_new(filepath):
    """解析新版 projects.md 格式"""
    projects_data = {}
    if not os.path.exists(filepath):
        return projects_data

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
                if project_code not in projects_data:
                    projects_data[project_code] = {
                        "name": project_name,
                        "manager": "",
                        "dates": {},
                    }
        elif line.startswith("**经理**: "):
            if current_project:
                projects_data[current_project]["manager"] = line.replace("**经理**: ", "").strip()
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_project and current_date:
                if current_date not in projects_data[current_project]["dates"]:
                    projects_data[current_project]["dates"][current_date] = []
        elif line.startswith("- **"):
            parts = line.split("**")
            if len(parts) >= 3 and current_project and current_date:
                user_name = parts[1]
                rest = parts[2].strip()
                if rest.startswith(":") or rest.startswith(":"):
                    rest = rest[1:].strip()
                
                projects_data[current_project]["dates"][current_date].append({
                    "user": user_name,
                    "summarize": rest,
                })

    return projects_data


def parse_raw_dailies(filepath):
    """解析 raw_dailies.json"""
    if not os.path.exists(filepath):
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def query_daily_reports_from_api(base_url, token, week_start, week_end, username=None, day_report_type=2, page=1, size=50):
    params = {
        "dayReportTimeQuery[0]": week_start.strftime("%Y-%m-%d"),
        "dayReportTimeQuery[1]": week_end.strftime("%Y-%m-%d"),
        "dayReportType": day_report_type,
        "queryType": 1,
        "current": page,
        "size": size,
    }
    if username:
        params["createBy"] = username
    url = f"{base_url}{DAY_REPORT_QUERY_ENDPOINT}?{urllib.parse.urlencode(params)}"
    return fetch_json_get(url, token)


def query_dept_tree(base_url, token):
    url = f"{base_url}{DEPT_TREE_ENDPOINT}"
    return fetch_json_get(url, token)


def query_users_by_dept(base_url, token, dept_id, size=200):
    url = f"{base_url}{USER_PAGE_ENDPOINT}?current=1&size={size}&deptId={dept_id}"
    return fetch_json_get(url, token)


def get_dept_children(dept_tree, dept_id):
    """获取部门及其所有子部门的ID"""
    result = []
    if str(dept_tree.get("id")) == str(dept_id):
        result.append(str(dept_id))
        for child in dept_tree.get("children", []):
            result.extend(get_dept_children(child, dept_id))
        return result
    
    for child in dept_tree.get("children", []):
        result.extend(get_dept_children(child, dept_id))
    return result


def get_user_dept_id(user_data, dept_tree_list):
    """获取用户的部门ID"""
    return user_data.get("deptId")


def is_user_in_dept(user_data, dept_id, dept_tree_list):
    """判断用户是否在指定部门或其子部门"""
    user_dept_id = user_data.get("deptId")
    if str(user_dept_id) == str(dept_id):
        return True
    
    dept_id_str = str(dept_id)
    for top_dept in dept_tree_list:
        children_ids = get_dept_children(top_dept, dept_id_str)
        if user_dept_id in children_ids:
            return True
    return False


def get_dept_name_by_id(dept_tree_list, dept_id):
    """根据部门ID获取部门名称"""
    dept_id_str = str(dept_id)
    for top_dept in dept_tree_list:
        name = _find_dept_name(top_dept, dept_id_str)
        if name:
            return name
    return None


def _find_dept_name(dept_tree, target_id):
    if str(dept_tree.get("id")) == target_id:
        return dept_tree.get("name", "")
    for child in dept_tree.get("children", []):
        name = _find_dept_name(child, target_id)
        if name:
            return name
    return None


def deduplicate(items):
    seen = set()
    result = []
    for item in items:
        item = item.strip()
        item = item.replace("今日：", "").replace("今日:", "").replace("今日", "")
        if item and item not in seen and item not in ["无", "暂无", "暂无计划"]:
            seen.add(item)
            result.append(item)
    return result


def split_and_deduplicate(items):
    all_items = []
    for item in items:
        item = item.replace("明日：", "").replace("明日:", "").replace("明日", "")
        parts = item.replace("；", ";").split(";")
        for part in parts:
            part = part.strip()
            if len(part) >= 2 and not part.isdigit():
                all_items.append(part)
    return deduplicate(all_items)


def generate_personal_week_reports(user_name, users_data, raw_dailies, week_start, week_end):
    """生成个人周报（按项目分别生成）"""
    if user_name not in users_data:
        return []

    user_info = users_data[user_name]
    projects = {}
    chances = []
    
    project_info_map = {}
    for record in raw_dailies:
        if record.get("createBy") == user_name or record.get("createName") == user_name:
            if record.get("dayReportType") == 2 and record.get("projectCode"):
                proj_name = record.get("projectName", "")
                if proj_name and proj_name not in project_info_map:
                    project_info_map[proj_name] = {
                        "projectCode": record.get("projectCode", ""),
                        "projectName": record.get("projectName", ""),
                        "projectStage": record.get("projectStage", "项目进行中"),
                        "projectManager": record.get("projectManager", ""),
                    }
    
    for date in sorted(user_info.get("dates", {}).keys()):
        for item in user_info["dates"][date]:
            day_type = item.get("dayReportType", 2)
            if day_type == 1:
                visit_client = item.get("visitClientName", "")
                visit_record = item.get("visitRecord", "")
                client_hope = item.get("clientHope", "")
                plan = item.get("plan", "")
                
                if visit_client:
                    chances.append({
                        "client": visit_client,
                        "record": visit_record,
                        "hope": client_hope,
                        "plan": plan,
                    })
            else:
                summarize = item.get("summarize", "")
                plan = item.get("plan", "")
                project_name = item.get("projectName", "")
                
                if project_name:
                    if project_name not in projects:
                        projects[project_name] = {
                            "summarize": [],
                            "plan": [],
                        }
                    if summarize:
                        projects[project_name]["summarize"].append(summarize)
                    if plan:
                        projects[project_name]["plan"].append(plan)

    reports = []
    
    for project_name, project_data in projects.items():
        week_summarize = "\n".join([f"{i + 1}. {s}" for i, s in enumerate(deduplicate(project_data["summarize"]))])
        week_plan = "；".join(split_and_deduplicate(project_data["plan"])) if project_data["plan"] else "继续推进工作"
        
        p_info = project_info_map.get(project_name, {})
        
        reports.append({
            "user_name": user_name,
            "dept": user_info.get("dept"),
            "project_name": project_name,
            "project_code": p_info.get("projectCode", ""),
            "project_stage": p_info.get("projectStage", ""),
            "project_manager": p_info.get("projectManager", ""),
            "project_summarize": week_summarize or "无",
            "project_plan": week_plan or "无",
            "week_start": week_start.strftime("%Y-%m-%d"),
            "week_end": week_end.strftime("%Y-%m-%d"),
            "report_type": 2,
        })
    
    if chances:
        chance_summaries = []
        chance_plans = []
        for c in chances:
            if c["record"]:
                chance_summaries.append(f"拜访{c['client']}：{c['record']}")
            if c["hope"]:
                chance_summaries.append(f"客户期望：{c['hope']}")
            if c["plan"]:
                chance_plans.append(c["plan"])
        
        week_chance_summary = "\n".join([f"{i + 1}. {s}" for i, s in enumerate(deduplicate(chance_summaries))])
        week_chance_plan = "；".join(split_and_deduplicate(chance_plans)) if chance_plans else "继续跟进客户"
        
        reports.append({
            "user_name": user_name,
            "dept": user_info.get("dept"),
            "project_name": "商机汇总",
            "chance_summarize": week_chance_summary or "无",
            "chance_plan": week_chance_plan or "无",
            "week_start": week_start.strftime("%Y-%m-%d"),
            "week_end": week_end.strftime("%Y-%m-%d"),
            "report_type": 1,
        })
    
    return reports


def generate_project_week_report(project_code, project_data, week_start, week_end):
    """生成项目周报"""
    if not project_data.get("dates"):
        return None

    all_summaries = []
    all_plans = []
    users_involved = set()

    for date in sorted(project_data["dates"].keys()):
        for item in project_data["dates"][date]:
            if item.get("summarize"):
                all_summaries.append(item["summarize"])
            if item.get("user"):
                users_involved.add(item["user"])

    week_summarize = "\n".join([f"{i + 1}. {s}" for i, s in enumerate(deduplicate(all_summaries))])
    week_plan = "；".join(split_and_deduplicate(all_plans)) if all_plans else "继续推进项目"

    return {
        "project_code": project_code,
        "project_name": project_data["name"],
        "project_manager": project_data["manager"],
        "week_summarize": week_summarize or "无",
        "week_plan": week_plan or "无",
        "users_count": len(users_involved),
        "users": list(users_involved),
        "week_start": week_start.strftime("%Y-%m-%d"),
        "week_end": week_end.strftime("%Y-%m-%d"),
    }


def generate_department_daily_summary(dept_name, users_data, week_start, week_end):
    """生成部门日报汇总"""
    lines = [f"# {dept_name} - 本周日报汇总"]
    lines.append(f"> 统计周期：{week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}")
    lines.append("")

    for user_name in sorted(users_data.keys()):
        user_info = users_data[user_name]
        dept = user_info.get("dept", "")
        user_header = user_name
        if dept:
            user_header += f"（{dept}）"
        
        lines.append(f"## {user_header}")
        lines.append("")

        for date in sorted(user_info.get("dates", {}).keys()):
            lines.append(f"### {date}")
            for item in user_info["dates"][date]:
                day_type = item.get("dayReportType", 2)
                if day_type == 1:
                    visit_client = item.get("visitClientName", "")
                    visit_record = item.get("visitRecord", "")
                    if visit_client and visit_record:
                        lines.append(f"- 【商机】拜访{visit_client}：{visit_record}")
                else:
                    summarize = item.get("summarize", "")
                    project_name = item.get("projectName", "")
                    if summarize:
                        prefix = f"【{project_name}】" if project_name else ""
                        lines.append(f"- {prefix}{summarize}")
            lines.append("")

    return "\n".join(lines)


def generate_department_week_report(dept_name, dept_id, users_data, week_start, week_end):
    """生成部门周报"""
    lines = [f"# {dept_name} - 本周工作汇总"]
    lines.append(f"> 统计周期：{week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}")
    lines.append("")

    all_project_summaries = []
    all_chance_summaries = []
    all_project_plans = []
    all_chance_plans = []
    total_users = 0

    for user_name in sorted(users_data.keys()):
        user_info = users_data[user_name]
        total_users += 1

        for date in sorted(user_info.get("dates", {}).keys()):
            for item in user_info["dates"][date]:
                day_type = item.get("dayReportType", 2)
                if day_type == 1:
                    visit_client = item.get("visitClientName", "")
                    visit_record = item.get("visitRecord", "")
                    client_hope = item.get("clientHope", "")
                    plan = item.get("plan", "")
                    
                    if visit_record:
                        all_chance_summaries.append(f"{user_name} 拜访{visit_client}：{visit_record}")
                    if client_hope:
                        all_chance_summaries.append(f"{user_name} - 客户期望：{client_hope}")
                    if plan:
                        all_chance_plans.append(f"{user_name}：{plan}")
                else:
                    summarize = item.get("summarize", "")
                    plan = item.get("plan", "")
                    project_name = item.get("projectName", "")
                    
                    if summarize:
                        proj_prefix = f"【{project_name}】" if project_name else ""
                        all_project_summaries.append(f"{user_name} {proj_prefix}{summarize}")
                    if plan:
                        all_project_plans.append(f"{user_name}：{plan}")

    lines.append(f"## 部门概况")
    lines.append(f"- 参与人数：{total_users} 人")
    lines.append("")

    lines.append(f"## 本周项目工作总结")
    if all_project_summaries:
        for i, s in enumerate(deduplicate(all_project_summaries)):
            lines.append(f"{i + 1}. {s}")
    else:
        lines.append("无项目日报记录")
    lines.append("")

    lines.append(f"## 本周商机拜访总结")
    if all_chance_summaries:
        for i, s in enumerate(deduplicate(all_chance_summaries)):
            lines.append(f"{i + 1}. {s}")
    else:
        lines.append("无商机日报记录")
    lines.append("")

    lines.append(f"## 下周工作计划")
    all_plans = all_project_plans + all_chance_plans
    if all_plans:
        for i, p in enumerate(deduplicate(all_plans)):
            lines.append(f"{i + 1}. {p}")
    else:
        lines.append("暂无计划")
    lines.append("")

    return "\n".join(lines)


def get_dept_paths_from_tree(dept_tree):
    """从部门树扁平化提取所有部门路径"""
    result = []
    
    def flatten(tree, prefix=None):
        if isinstance(tree, list):
            for item in tree:
                flatten(item, prefix)
            return
        
        name = tree.get("name", "")
        if prefix:
            full_path = f"{prefix}/{name}"
        else:
            full_path = name
        
        result.append({
            "id": tree.get("id"),
            "name": name,
            "fullPath": full_path,
            "parentId": tree.get("parentId"),
            "children": tree.get("children", [])
        })
        
        for child in tree.get("children", []):
            flatten(child, full_path)
    
    if isinstance(dept_tree, list):
        flatten(dept_tree)
    elif dept_tree:
        flatten(dept_tree)
    return result


def find_matching_depts_from_api(dept_tree, keyword):
    """从部门树模糊匹配（不区分大小写，包含匹配）"""
    all_depts = get_dept_paths_from_tree(dept_tree)
    keyword_lower = keyword.lower()
    matched = []
    for dept in all_depts:
        if keyword_lower in dept["name"].lower() or keyword_lower in dept["fullPath"].lower():
            matched.append(dept)
    return matched


def generate_company_week_report(dept_tree_list, all_users_data, week_start, week_end):
    """生成全公司周报"""
    lines = [f"# 全公司 - 本周工作汇总"]
    lines.append(f"> 统计周期：{week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}")
    lines.append("")

    dept_summaries = {}
    
    for user_name, user_info in sorted(all_users_data.items()):
        dept = user_info.get("dept", "未分配部门")
        if dept not in dept_summaries:
            dept_summaries[dept] = {
                "users": set(),
                "project_summaries": [],
                "chance_summaries": [],
                "project_plans": [],
                "chance_plans": [],
            }
        
        dept_summaries[dept]["users"].add(user_name)
        
        for date in sorted(user_info.get("dates", {}).keys()):
            for item in user_info["dates"][date]:
                day_type = item.get("dayReportType", 2)
                summarize = item.get("summarize", "")
                plan = item.get("plan", "")
                project_name = item.get("projectName", "")
                
                if day_type == 1:
                    visit_client = item.get("visitClientName", "")
                    visit_record = item.get("visitRecord", "")
                    if visit_record:
                        dept_summaries[dept]["chance_summaries"].append(f"{user_name} 拜访{visit_client}：{visit_record}")
                else:
                    if summarize:
                        proj_prefix = f"【{project_name}】" if project_name else ""
                        dept_summaries[dept]["project_summaries"].append(f"{user_name} {proj_prefix}{summarize}")
                    if plan:
                        dept_summaries[dept]["project_plans"].append(f"{user_name}：{plan}")

    for dept_name in sorted(dept_summaries.keys()):
        dept_data = dept_summaries[dept_name]
        lines.append(f"## {dept_name}（{len(dept_data['users'])} 人）")
        lines.append("")

        if dept_data["project_summaries"]:
            lines.append("### 项目工作")
            for i, s in enumerate(deduplicate(dept_data["project_summaries"])[:10]):
                lines.append(f"{i + 1}. {s}")
            lines.append("")

        if dept_data["chance_summaries"]:
            lines.append("### 商机拜访")
            for i, s in enumerate(deduplicate(dept_data["chance_summaries"])[:5]):
                lines.append(f"{i + 1}. {s}")
            lines.append("")

    return "\n".join(lines)


def query_user_by_username(base_url, token, username):
    """根据用户名查询用户信息"""
    url = f"{base_url}{USER_PAGE_ENDPOINT}?current=1&size=10&username={urllib.parse.quote(username)}"
    return fetch_json_get(url, token)


def get_user_id(base_url, token, username):
    """获取用户ID"""
    result = query_user_by_username(base_url, token, username)
    if result.get("code") == 0 and result.get("data"):
        records = result["data"].get("records", [])
        for record in records:
            if record.get("username") == username:
                return str(record.get("userId", ""))
    return ""


def main():
    parser = argparse.ArgumentParser(
        description="项目周报生成脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    
    subparsers = parser.add_subparsers(dest="command", help="命令类型")

    personal_parser = subparsers.add_parser("personal", help="生成个人周报")
    personal_parser.add_argument("--user", dest="user_name", help="用户名（从会话上下文获取）")
    personal_parser.add_argument("--name", dest="user_display_name", help="用户姓名")
    personal_parser.add_argument("--review", action="store_true", help="预览周报")
    personal_parser.add_argument("--submit", action="store_true", help="提交周报")
    personal_parser.add_argument("--week", dest="week_offset", type=int, default=0, help="周偏移量")
    personal_parser.add_argument("--week-start", dest="week_start_date", help="周开始日期 YYYY-MM-DD")
    personal_parser.add_argument("--week-end", dest="week_end_date", help="周结束日期 YYYY-MM-DD")

    dept_daily_parser = subparsers.add_parser("dept-daily", help="查询部门日报汇总")
    dept_daily_parser.add_argument("--dept-name", dest="dept_name", required=True, help="部门名称（如：总经办、临时部门）")
    dept_daily_parser.add_argument("--week", dest="week_offset", type=int, default=0, help="周偏移量")
    dept_daily_parser.add_argument("--week-start", dest="week_start_date", help="周开始日期 YYYY-MM-DD")
    dept_daily_parser.add_argument("--week-end", dest="week_end_date", help="周结束日期 YYYY-MM-DD")

    dept_weekly_parser = subparsers.add_parser("dept-weekly", help="生成部门周报")
    dept_weekly_parser.add_argument("--dept-name", dest="dept_name", required=True, help="部门名称（如：总经办、临时部门）")
    dept_weekly_parser.add_argument("--week", dest="week_offset", type=int, default=0, help="周偏移量")
    dept_weekly_parser.add_argument("--week-start", dest="week_start_date", help="周开始日期 YYYY-MM-DD")
    dept_weekly_parser.add_argument("--week-end", dest="week_end_date", help="周结束日期 YYYY-MM-DD")

    company_parser = subparsers.add_parser("company", help="生成全公司周报")
    company_parser.add_argument("--week", dest="week_offset", type=int, default=0, help="周偏移量")
    company_parser.add_argument("--week-start", dest="week_start_date", help="周开始日期 YYYY-MM-DD")
    company_parser.add_argument("--week-end", dest="week_end_date", help="周结束日期 YYYY-MM-DD")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    week_start, week_end = get_week_range(
        week_offset=args.week_offset if hasattr(args, 'week_offset') else 0,
        week_start_date=args.week_start_date if hasattr(args, 'week_start_date') else None,
        week_end_date=args.week_end_date if hasattr(args, 'week_end_date') else None,
    )

    week_dir = get_daily_report_week_dir(week_start, week_end)
    
    users_data = {}
    projects_data = {}
    raw_dailies = []
    
    if week_dir:
        users_file = os.path.join(week_dir, "users.md")
        projects_file = os.path.join(week_dir, "projects.md")
        raw_file = os.path.join(week_dir, "raw_dailies.json")
        
        users_data = parse_users_md_new(users_file)
        projects_data = parse_projects_md_new(projects_file)
        raw_dailies = parse_raw_dailies(raw_file)

    base_url = PM_BASE_URL
    username = PM_USERNAME
    password = PM_PASSWORD
    token = None
    
    if username and password:
        try:
            token = login(base_url, username, password)
        except Exception as e:
            print(f"[警告] 登录失败: {e}", file=sys.stderr)

    if args.command == "personal":
        target_user = args.user_name
        if not target_user:
            print("错误: 请指定 --user 参数（从会话上下文获取的用户名）", file=sys.stderr)
            return

        reports = generate_personal_week_reports(target_user, users_data, raw_dailies, week_start, week_end)
        if not reports:
            print(f"未找到用户 {target_user} 的本周日报数据", file=sys.stderr)
            return

        print("=" * 60)
        print(f"## 个人周报：{reports[0]['user_name']}")
        if reports[0].get('dept'):
            print(f"部门：{reports[0]['dept']}")
        print(f"统计周期：{reports[0]['week_start']} ~ {reports[0]['week_end']}")
        print(f"周报份数：{len(reports)}")
        print()
        
        for i, report in enumerate(reports):
            print(f"### 周报 {i + 1}：{report['project_name']}")
            if report['report_type'] == 1:
                print("类型：商机日报")
                print(report.get('chance_summarize', '无'))
                print()
                print("下周计划：")
                print(report.get('chance_plan', '无'))
            else:
                print("类型：项目日报")
                print("本周总结：")
                print(report.get('project_summarize', '无'))
                print()
                print("下周计划：")
                print(report.get('project_plan', '无'))
            print()
        
        print("=" * 60)

        if args.submit:
            if not token:
                print("\n错误: 需要登录凭据才能提交周报", file=sys.stderr)
                return
            
            lookup_user = args.user_name
            if not lookup_user.isascii():
                lookup_user = PM_USERNAME
            
            user_id = get_user_id(base_url, token, lookup_user)
            if not user_id:
                print(f"\n错误: 无法获取用户ID", file=sys.stderr)
                return
            
            print(f"\n将提交 {len(reports)} 份周报")
            
            for i, report in enumerate(reports):
                submit_data = {
                    "weekPlanNow": "无",
                    "date": f"{report['week_start']} ~ {report['week_end']}",
                    "chanceProjectName": report.get('project_name', ''),
                    "chanceProjectSchedule": report.get('project_stage', ''),
                    "projectCode": report.get('project_code', '') if report['report_type'] == 2 else "",
                    "projectManager": report.get('project_manager', '') if report['report_type'] == 2 else "",
                    "weekSummarizeNow": report.get('project_summarize', report.get('chance_summarize', '无')),
                    "weekPlanNext": report.get('project_plan', report.get('chance_plan', '无')),
                    "problemRisk": "无",
                    "requestInstructions": "无",
                    "reportUserList": [user_id],
                    "weekStartTime": f"{report['week_start']} 00:00:00",
                    "weekEndTime": f"{report['week_end']} 23:59:59",
                    "weekReportType": report['report_type'],
                }
                
                print(f"\n[{i + 1}/{len(reports)}] 正在提交 {report['project_name']} 周报...", file=sys.stderr)
                try:
                    url = f"{base_url}{WEEK_REPORT_ENDPOINT}"
                    params = {"createBy": lookup_user}
                    result = fetch_json_post(url, [submit_data], token, params=params)
                    
                    if result.get("code") == 0 or result.get("success"):
                        print(f"[{i + 1}/{len(reports)}] ✓ 提交成功", file=sys.stderr)
                    else:
                        print(f"[{i + 1}/{len(reports)}] ✗ 提交失败: {result.get('message', result)}", file=sys.stderr)
                except Exception as e:
                    print(f"[{i + 1}/{len(reports)}] ✗ 提交错误: {e}", file=sys.stderr)
            
            print("\n周报提交完成", file=sys.stderr)

    elif args.command == "dept-daily":
        dept_keyword = args.dept_name
        
        if not token:
            print("错误: 需要登录凭据才能查询部门", file=sys.stderr)
            return
        
        dept_tree_result = query_dept_tree(base_url, token)
        if dept_tree_result.get("code") != 0 and not dept_tree_result.get("data"):
            print(f"查询部门树失败: {dept_tree_result.get('message', '未知错误')}", file=sys.stderr)
            return
        
        dept_tree = dept_tree_result.get("data", {})
        
        all_depts = get_dept_paths_from_tree(dept_tree)
        
        matched_depts = find_matching_depts_from_api(dept_tree, dept_keyword)
        
        if len(matched_depts) == 0:
            print(f"未匹配到部门 '{dept_keyword}'")
            print(f"\n系统中现有以下部门：")
            for i, dept in enumerate(all_depts[:20], 1):
                print(f"  {i}. {dept['fullPath']}")
            if len(all_depts) > 20:
                print(f"  ...（共 {len(all_depts)} 个部门）")
            print(f"\n请确认要查询的部门（输入完整部门路径或序号）")
            return
        
        if len(matched_depts) > 1:
            print(f"找到 {len(matched_depts)} 个匹配的部门，请确认：")
            for i, dept in enumerate(matched_depts[:20], 1):
                child_count = len(dept["children"]) if dept.get("children") else 0
                child_info = f"（含 {child_count} 个子部门）" if child_count else ""
                print(f"  {i}. {dept['fullPath']}{child_info}")
            if len(matched_depts) > 20:
                print(f"  ...（共 {len(matched_depts)} 个匹配）")
            print(f"\n请确认要查询的部门（输入完整部门路径或序号）")
            return
        
        selected_dept = matched_depts[0]
        dept_path = selected_dept["fullPath"]
        dept_id = selected_dept["id"]
        
        print(f"确认查询部门：{dept_path}")
        
        dept_users_data = {}
        for user_name, user_info in users_data.items():
            user_dept = user_info.get("dept") or ""
            if dept_path == user_dept:
                dept_users_data[user_name] = user_info
        
        if not dept_users_data:
            print(f"\n注意: 部门 '{dept_path}' 暂无本周日报数据")
        
        summary = generate_department_daily_summary(dept_path, dept_users_data, week_start, week_end)
        print(summary)

    elif args.command == "dept-weekly":
        dept_keyword = args.dept_name
        
        if not token:
            print("错误: 需要登录凭据才能查询部门", file=sys.stderr)
            return
        
        dept_tree_result = query_dept_tree(base_url, token)
        if dept_tree_result.get("code") != 0 and not dept_tree_result.get("data"):
            print(f"查询部门树失败: {dept_tree_result.get('message', '未知错误')}", file=sys.stderr)
            return
        
        dept_tree = dept_tree_result.get("data", {})
        
        all_depts = get_dept_paths_from_tree(dept_tree)
        
        matched_depts = find_matching_depts_from_api(dept_tree, dept_keyword)
        
        if len(matched_depts) == 0:
            print(f"未匹配到部门 '{dept_keyword}'")
            print(f"\n系统中现有以下部门：")
            for i, dept in enumerate(all_depts[:20], 1):
                print(f"  {i}. {dept['fullPath']}")
            if len(all_depts) > 20:
                print(f"  ...（共 {len(all_depts)} 个部门）")
            print(f"\n请确认要生成周报的部门（输入完整部门路径或序号）")
            return
        
        if len(matched_depts) > 1:
            print(f"找到 {len(matched_depts)} 个匹配的部门，请确认：")
            for i, dept in enumerate(matched_depts[:20], 1):
                child_count = len(dept["children"]) if dept.get("children") else 0
                child_info = f"（含 {child_count} 个子部门）" if child_count else ""
                print(f"  {i}. {dept['fullPath']}{child_info}")
            if len(matched_depts) > 20:
                print(f"  ...（共 {len(matched_depts)} 个匹配）")
            print(f"\n请确认要生成周报的部门（输入完整部门路径或序号）")
            return
        
        selected_dept = matched_depts[0]
        dept_path = selected_dept["fullPath"]
        dept_id = selected_dept["id"]
        
        print(f"确认生成部门周报：{dept_path}")
        
        dept_users_data = {}
        for user_name, user_info in users_data.items():
            user_dept = user_info.get("dept") or ""
            if dept_path == user_dept:
                dept_users_data[user_name] = user_info
        
        if not dept_users_data:
            print(f"\n注意: 部门 '{dept_path}' 暂无本周日报数据")
        
        weekly = generate_department_week_report(dept_path, "", dept_users_data, week_start, week_end)
        print(weekly)

    elif args.command == "company":
        weekly = generate_company_week_report([], users_data, week_start, week_end)
        print(weekly)


if __name__ == "__main__":
    main()
