"""周报技能 - 数据解析和格式化模块

处理日报数据解析、部门树匹配和数据清洗。
"""
import json
import os
import re
from datetime import datetime, timedelta

from config import Config


def get_week_range(week_offset=0, week_start_date=None, week_end_date=None):
    """获取周起止日期"""
    if week_start_date and week_end_date:
        return datetime.strptime(week_start_date, "%Y-%m-%d"), datetime.strptime(week_end_date, "%Y-%m-%d")
    today = datetime.now()
    if week_offset != 0:
        today = today - timedelta(days=7 * abs(week_offset))
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def get_daily_report_week_dir(week_start, week_end):
    """获取日报数据目录"""
    skills_root = Config.get_skills_root()
    if not skills_root:
        return None
    base_dir = os.path.join(skills_root, "daily-report")
    week_dir = os.path.join(base_dir, f"{week_start.strftime('%Y-%m-%d')}_{week_end.strftime('%Y-%m-%d')}")
    if os.path.exists(week_dir):
        return week_dir
    return None


def parse_users_md(filepath):
    """解析 users.md 文件"""
    users_data = {}
    if not os.path.exists(filepath):
        return users_data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    current_user = None
    current_date = None
    current_item_data = None

    for line in content.split("\n"):
        if line.startswith("## "):
            header = line.replace("## ", "").strip()
            dept_match = re.search(r"（部门：(.+?)）", header)
            if dept_match:
                current_user = header.replace(f"（部门：{dept_match.group(1)}）", "").strip()
            else:
                current_user = header
            if current_user not in users_data:
                users_data[current_user] = {"dates": {}, "dept": dept_match.group(1) if dept_match else None}
            current_item_data = None
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_user and current_date:
                if current_date not in users_data[current_user]["dates"]:
                    users_data[current_user]["dates"][current_date] = []
            current_item_data = None
        elif line.startswith("- **") and current_user and current_date:
            parts = line.split("**")
            if len(parts) >= 2:
                current_item_key = parts[1]
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

    return users_data


def parse_projects_md(filepath):
    """解析 projects.md 文件"""
    projects_data = {}
    if not os.path.exists(filepath):
        return projects_data

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    current_project = None
    current_date = None

    for line in content.split("\n"):
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
        elif line.startswith("**经理**: ") and current_project:
            projects_data[current_project]["manager"] = line.replace("**经理**: ", "").strip()
        elif line.startswith("### "):
            current_date = line.replace("### ", "").strip()
            if current_project and current_date:
                if current_date not in projects_data[current_project]["dates"]:
                    projects_data[current_project]["dates"][current_date] = []
        elif line.startswith("- **") and current_project and current_date:
            parts = line.split("**")
            if len(parts) >= 3:
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


class DeptTreeParser:
    """部门树解析器"""

    @staticmethod
    def flatten(tree):
        """扁平化部门树"""
        result = []

        def _flatten(tree, prefix=None):
            if isinstance(tree, list):
                for item in tree:
                    _flatten(item, prefix)
                return
            name = tree.get("name", "")
            full_path = f"{prefix}/{name}" if prefix else name
            result.append({
                "id": tree.get("id"),
                "name": name,
                "fullPath": full_path,
                "parentId": tree.get("parentId"),
                "children": tree.get("children", []),
            })
            for child in tree.get("children", []):
                _flatten(child, full_path)

        if isinstance(tree, list):
            _flatten(tree)
        elif tree:
            _flatten(tree)
        return result

    @staticmethod
    def find_matching_depts(tree, keyword):
        """模糊匹配部门"""
        all_depts = DeptTreeParser.flatten(tree)
        keyword_lower = keyword.lower()
        return [
            dept for dept in all_depts
            if keyword_lower in dept["name"].lower() or keyword_lower in dept["fullPath"].lower()
        ]

    @staticmethod
    def get_dept_children(tree, dept_id):
        """获取部门及所有子部门 ID"""
        result = []
        if str(tree.get("id")) == str(dept_id):
            result.append(str(dept_id))
            for child in tree.get("children", []):
                result.extend(DeptTreeParser.get_dept_children(child, dept_id))
            return result
        for child in tree.get("children", []):
            result.extend(DeptTreeParser.get_dept_children(child, dept_id))
        return result

    @staticmethod
    def get_dept_name_by_id(tree_list, dept_id):
        """根据 ID 获取部门名称"""
        dept_id_str = str(dept_id)
        for top_dept in tree_list:
            name = DeptTreeParser._find_name(top_dept, dept_id_str)
            if name:
                return name
        return None

    @staticmethod
    def _find_name(tree, target_id):
        if str(tree.get("id")) == target_id:
            return tree.get("name", "")
        for child in tree.get("children", []):
            name = DeptTreeParser._find_name(child, target_id)
            if name:
                return name
        return None


def deduplicate(items):
    """去重并清理文本"""
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
    """拆分并去重"""
    all_items = []
    for item in items:
        item = item.replace("明日：", "").replace("明日:", "").replace("明日", "")
        parts = item.replace("；", ";").split(";")
        for part in parts:
            part = part.strip()
            if len(part) >= 2 and not part.isdigit():
                all_items.append(part)
    return deduplicate(all_items)
