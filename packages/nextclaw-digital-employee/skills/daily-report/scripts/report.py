"""日报技能 - 日报业务逻辑模块

处理日报存档、MD 文件生成和周目录管理。
"""
import json
import os
import re
from datetime import datetime, timedelta

from config import Config


def get_week_dir(date_str=None):
    """获取指定日期所在周的目录路径"""
    if date_str:
        date = datetime.strptime(date_str, "%Y-%m-%d")
    else:
        date = datetime.now()
    monday = date - timedelta(days=date.weekday())
    sunday = monday + timedelta(days=6)
    skills_root = Config.get_skills_root()
    if not skills_root:
        return None
    base_dir = os.path.join(skills_root, "daily-report")
    return os.path.join(base_dir, f"{monday.strftime('%Y-%m-%d')}_{sunday.strftime('%Y-%m-%d')}")


def get_week_range(date_str):
    """获取某日期所在周的起止时间"""
    date = datetime.strptime(date_str, "%Y-%m-%d")
    monday = date - timedelta(days=date.weekday())
    sunday = monday + timedelta(days=6)
    return monday.strftime("%Y-%m-%d"), sunday.strftime("%Y-%m-%d")


def save_query_result(week_dir, filename, records, total):
    """保存查询结果到 JSON 文件"""
    os.makedirs(week_dir, exist_ok=True)
    filepath = os.path.join(week_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump({"records": records, "total": total}, f, ensure_ascii=False, indent=2)
    return filepath


def save_param_file(week_dir, report_data, report_user):
    """保存参数文件"""
    os.makedirs(week_dir, exist_ok=True)
    now = datetime.now().strftime("%Y%m%d%H%M%S")
    is_chance = report_data.get("dayReportType") == 1
    code = report_data.get("visitClientCode") if is_chance else report_data.get("projectCode")
    code = code or "unknown"
    prefix = "chance" if is_chance else ""
    filename = f"param_{prefix}{code}_{report_user}_{now}.json"
    filepath = os.path.join(week_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(report_data, f, ensure_ascii=False, indent=2)
    return filepath


def remove_param_file(filepath):
    """删除参数文件"""
    if os.path.exists(filepath):
        os.remove(filepath)


def append_to_raw_dailies(week_dir, record):
    """追加记录到 raw_dailies.json"""
    filepath = os.path.join(week_dir, "raw_dailies.json")
    raw_data = []
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

    exists = any(
        d.get("date") == record.get("date")
        and d.get("projectCode") == record.get("projectCode")
        and d.get("createBy") == record.get("createBy")
        and d.get("dayReportType") == record.get("dayReportType")
        for d in raw_data
    )
    if not exists:
        raw_data.append(record)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(raw_data, f, ensure_ascii=False, indent=2)


def generate_projects_md(week_dir, week_start, week_end, report_data, user_display_name):
    """生成项目维度 MD 文件"""
    if report_data.get("dayReportType") == 1:
        return

    filepath = os.path.join(week_dir, "projects.md")
    data = _load_projects_md(filepath)
    project_code = report_data.get("projectCode", "")
    report_date = report_data.get("date", "")

    if project_code not in data:
        data[project_code] = {
            "name": report_data.get("projectName", ""),
            "manager": report_data.get("projectManager", ""),
            "dates": {},
        }
    if report_date not in data[project_code]["dates"]:
        data[project_code]["dates"][report_date] = {}

    summarize = _clean_text(report_data.get("daySummarizeNow", "无"))
    plan = _clean_text(report_data.get("dayPlanNext", "无"))
    data[project_code]["dates"][report_date][user_display_name] = {
        "summarize": summarize,
        "plan": plan,
    }
    _save_projects_md(filepath, data, week_start, week_end)


def generate_users_md(week_dir, week_start, week_end, report_data, user_display_name, dept_path=None):
    """生成人员维度 MD 文件"""
    filepath = os.path.join(week_dir, "users.md")
    data = _load_users_md(filepath)
    report_date = report_data.get("date", "")
    is_chance = report_data.get("dayReportType") == 1

    if user_display_name not in data:
        data[user_display_name] = {"dates": {}}
    if report_date not in data[user_display_name]["dates"]:
        data[user_display_name]["dates"][report_date] = {}

    if is_chance:
        chance_name = report_data.get("chanceProjectName", "")
        visit_client = report_data.get("visitClientName", "")
        item_key = f"[商机]{chance_name}" if chance_name else f"[商机]{visit_client}"
    else:
        item_key = report_data.get("projectName", "")

    item_data = {
        "projectName": report_data.get("projectName", ""),
        "manager": report_data.get("projectManager", ""),
        "summarize": _clean_text(report_data.get("daySummarizeNow", "无")),
        "plan": _clean_text(report_data.get("dayPlanNext", "无")),
        "dayReportType": report_data.get("dayReportType", 2),
        "reportTypeName": "商机日报" if is_chance else "项目日报",
        "workHourProportion": 0,
        "deptPath": dept_path,
        "problemRisk": report_data.get("problemRisk", ""),
        "requestInstructions": report_data.get("requestInstructions", ""),
    }

    if is_chance:
        chance_fields = [
            "visitClientName", "visitClientCode", "contractPersonName",
            "contractPersonCode", "contractPersonDeptName", "contractPersonDeptId",
            "contractPersonPosition", "visitRecord", "clientHope", "customerType",
        ]
        for field in chance_fields:
            if field in report_data:
                item_data[field] = report_data[field]

    data[user_display_name]["dates"][report_date][item_key] = item_data
    _save_users_md(filepath, data, week_start, week_end)


def generate_md_files(report_data, report_user, report_name=None, token=None, api_client=None):
    """生成日报汇总 MD 文件"""
    report_date = report_data.get("date", "")
    week_start, week_end = get_week_range(report_date)
    week_dir = get_week_dir(report_date)
    if not week_dir:
        return None

    os.makedirs(week_dir, exist_ok=True)
    user_display_name = report_name or report_user

    # 获取用户部门信息
    dept_path = None
    if token and report_user:
        dept_path = _get_user_dept_path(api_client, report_user)

    # 保存原始数据
    record = {
        "date": report_date,
        "projectCode": report_data.get("projectCode", "") if report_data.get("dayReportType") != 1 else report_data.get("chanceCode", ""),
        "projectName": report_data.get("chanceProjectName", report_data.get("projectName", "")),
        "projectManager": report_data.get("projectManager", ""),
        "createBy": report_data.get("createBy") or report_user,
        "createName": user_display_name,
        "summarize": _clean_text(report_data.get("daySummarizeNow", "无")),
        "plan": _clean_text(report_data.get("dayPlanNext", "无")),
        "dayReportType": report_data.get("dayReportType", 2),
        "reportTypeName": "商机日报" if report_data.get("dayReportType") == 1 else "项目日报",
        "submittedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    if report_data.get("dayReportType") == 1:
        record.update({
            "chanceCode": report_data.get("chanceCode", ""),
            "chanceId": report_data.get("chanceId", ""),
            "visitClientName": report_data.get("visitClientName", ""),
            "contractPersonName": report_data.get("contractPersonName", ""),
            "visitRecord": report_data.get("visitRecord", ""),
            "clientHope": report_data.get("clientHope", ""),
        })
    append_to_raw_dailies(week_dir, record)

    # 生成项目维度 MD
    generate_projects_md(week_dir, week_start, week_end, report_data, user_display_name)

    # 生成人员维度 MD
    generate_users_md(week_dir, week_start, week_end, report_data, user_display_name, dept_path)

    return week_dir


# ==================== 内部辅助函数 ====================

def _clean_text(text):
    """清理文本中的前缀标记"""
    if not text:
        return "无"
    return text.replace("今日：", "").replace("今日:", "").replace("今日", "").replace("明日：", "").replace("明日:", "").replace("明日", "").strip() or "无"


def _get_user_dept_path(api_client, username):
    """获取用户部门路径"""
    if not api_client:
        return None
    try:
        user_result = api_client.query_user_by_username(username)
        if user_result.get("code") != 0 or not user_result.get("data"):
            return None
        records = user_result["data"].get("records", [])
        if not records:
            return None
        user = records[0]
        dept_id = user.get("deptId")
        if not dept_id:
            return None

        dept_result = api_client.query_dept_tree()
        if dept_result.get("code") != 0 or not dept_result.get("data"):
            return None
        dept_tree = dept_result["data"]
        dept_tree_list = dept_tree if isinstance(dept_tree, list) else [dept_tree]

        target_id = str(dept_id)
        for top_dept in dept_tree_list:
            path = _find_dept_path(top_dept, target_id)
            if path:
                return "/".join(path)
    except:
        pass
    return None


def _find_dept_path(dept_tree, target_id, path=None):
    """递归查找部门路径"""
    if path is None:
        path = []
    if str(dept_tree.get("id", "")) == target_id:
        path.append(dept_tree.get("name", ""))
        return path.copy()
    for child in dept_tree.get("children", []):
        result = _find_dept_path(child, target_id, path.copy())
        if result:
            result.insert(0, dept_tree.get("name", ""))
            return result
    return None


def _load_projects_md(filepath):
    """加载项目维度结构化数据"""
    data = {}
    if not os.path.exists(filepath):
        return data
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    current_project = None
    current_date = None
    for line in content.split("\n"):
        if line.startswith("## "):
            match = re.match(r"## (.+?)（(.+?)）", line)
            if match:
                current_project = match.group(2)
                if current_project not in data:
                    data[current_project] = {"name": match.group(1), "manager": "", "dates": {}}
        elif line.startswith("**经理**: ") and current_project:
            data[current_project]["manager"] = line.replace("**经理**: ", "")
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_project and current_date and current_date not in data[current_project]["dates"]:
                data[current_project]["dates"][current_date] = {}
        elif line.startswith("- **") and current_project and current_date:
            parts = line.split("**")
            if len(parts) >= 3:
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


def _save_projects_md(filepath, data, week_start, week_end):
    """保存项目维度 MD 文件"""
    lines = ["# 本周项目日报汇总\n", f"> 统计周期：{week_start} ~ {week_end}\n"]
    for project_code in sorted(data.keys()):
        project = data[project_code]
        lines.append(f"\n## {project['name']}（{project_code}）\n")
        if project["manager"]:
            lines.append(f"**经理**: {project['manager']}\n")
        for date in sorted(project["dates"].keys()):
            lines.append(f"\n### {date}\n")
            for user_name, user_data in sorted(project["dates"][date].items()):
                summarize = _clean_text(user_data.get("summarize", "无"))
                plan = _clean_text(user_data.get("plan", "无"))
                if summarize == "无":
                    continue
                if plan != "无":
                    lines.append(f"- **{user_name}**：今日：{summarize}。明日：{plan}\n")
                else:
                    lines.append(f"- **{user_name}**：今日：{summarize}\n")
        lines.append("\n---\n")
    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)


def _load_users_md(filepath):
    """加载人员维度结构化数据"""
    data = {}
    if not os.path.exists(filepath):
        return data
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    current_user = None
    current_date = None
    current_item_data = None

    for line in content.split("\n"):
        if line.startswith("## "):
            header = line.replace("## ", "").strip()
            dept_match = re.search(r"（部门：(.+?)）", header)
            current_user = header.replace(f"（部门：{dept_match.group(1)}）", "").strip() if dept_match else header
            if current_user not in data:
                data[current_user] = {"dates": {}}
            current_item_data = None
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_user and current_date and current_date not in data[current_user]["dates"]:
                data[current_user]["dates"][current_date] = {}
            current_item_data = None
        elif line.startswith("- **") and current_user and current_date:
            parts = line.split("**")
            if len(parts) >= 2:
                title = parts[1]
                current_item_data = {
                    "itemKey": title,
                    "dayReportType": 1 if "商机" in title else 2,
                }
                data[current_user]["dates"][current_date][title] = current_item_data
        elif line.startswith("  - ") and current_user and current_date and current_item_data:
            text = line.replace("  - ", "").strip()
            if text.startswith("拜访记录："):
                current_item_data["visitRecord"] = text.replace("拜访记录：", "").strip()
            elif text.startswith("客户期望："):
                current_item_data["clientHope"] = text.replace("客户期望：", "").strip()
            elif text.startswith("下一步计划："):
                current_item_data["plan"] = text.replace("下一步计划：", "").strip()
            elif text.startswith("今日："):
                current_item_data["summarize"] = text.replace("今日：", "").strip()
            elif text.startswith("明日："):
                current_item_data["plan"] = text.replace("明日：", "").strip()
            elif text.startswith("问题与风险："):
                current_item_data["problemRisk"] = text.replace("问题与风险：", "").strip()
            elif text.startswith("请示事项："):
                current_item_data["requestInstructions"] = text.replace("请示事项：", "").strip()
    return data


def _save_users_md(filepath, data, week_start, week_end):
    """保存人员维度 MD 文件"""
    lines = ["# 本周个人日报汇总\n", f"> 统计周期：{week_start} ~ {week_end}\n"]
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
            items = sorted(user["dates"][date].items(), key=lambda x: (x[1].get("dayReportType", 2), x[0]))

            for item_key, item_data in items:
                if item_data.get("dayReportType") == 1:
                    visit_client = item_data.get("visitClientName", "")
                    chance_name = item_data.get("chanceProjectName", "")
                    contract_person = item_data.get("contractPersonName", "")
                    title = "【商机日报】"
                    if visit_client:
                        title += visit_client
                    if contract_person:
                        title += f"（对接人：{contract_person}）"
                    lines.append(f"- **{title}**\n")
                    if item_data.get("visitRecord"):
                        lines.append(f"  - 拜访记录：{item_data['visitRecord']}\n")
                    if item_data.get("clientHope"):
                        lines.append(f"  - 客户期望：{item_data['clientHope']}\n")
                    if item_data.get("plan"):
                        lines.append(f"  - 下一步计划：{item_data['plan']}\n")
                else:
                    project_name = item_data.get("projectName", "")
                    title = f"【项目日报】{project_name}" if project_name else "【项目日报】"
                    lines.append(f"- **{title}**\n")
                    if item_data.get("summarize"):
                        lines.append(f"  - 今日：{item_data['summarize']}\n")
                    if item_data.get("plan"):
                        lines.append(f"  - 明日：{item_data['plan']}\n")
                    if item_data.get("problemRisk"):
                        lines.append(f"  - 问题与风险：{item_data['problemRisk']}\n")
                    if item_data.get("requestInstructions"):
                        lines.append(f"  - 请示事项：{item_data['requestInstructions']}\n")

        if idx < len(user_list) - 1:
            lines.append("\n---\n")

    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)
