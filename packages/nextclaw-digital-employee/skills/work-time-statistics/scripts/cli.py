"""工时统计分析技能 - 命令行交互模块

处理 list/query 命令。
"""
import json
import os
import glob
import sys
from datetime import datetime

from api import get_token, list_projects, query_work_hours
from models import get_date_range, filter_projects_by_type
from config import Config


def clean_previous_output():
    """清理上次产生的临时文件"""
    temp_dir = Config.get_temp_dir()
    if not temp_dir or not os.path.exists(temp_dir):
        return
    pattern = os.path.join(temp_dir, f"{Config.SKILL_NAME}_*.json")
    for f in glob.glob(pattern):
        try:
            os.remove(f)
        except Exception:
            pass


def save_result(data, suffix):
    """保存结果到临时文件（带时间戳）"""
    temp_dir = Config.get_temp_dir()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{suffix}_{timestamp}.json"
    output_path = os.path.join(temp_dir, f"{Config.SKILL_NAME}_{filename}")
    json_str = json.dumps(data, ensure_ascii=False, indent=2)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(json_str)
    print(f"[数据已保存到文件: {output_path}]")
    return output_path


def handle_list(args):
    """列出所有项目"""
    token = get_token()

    # 解析参数
    kwargs = {}
    if args:
        for arg in args:
            if "=" in arg:
                k, v = arg.split("=", 1)
                kwargs[k] = v

    filter_type = kwargs.get("projectType")

    result = list_projects(token)

    # 本地过滤
    if filter_type:
        data = result.get("data", [])
        filtered = filter_projects_by_type(data, filter_type)
        result = {"code": result.get("code", 0), "data": filtered}

    save_result(result, "projects")


def handle_query(args):
    """查询项目人员工时"""
    token = get_token()

    # 解析参数
    kwargs = {}
    if args:
        for arg in args:
            if "=" in arg:
                k, v = arg.split("=", 1)
                kwargs[k] = v

        # 处理相对时间
        if "period" in kwargs:
            start_day, end_day = get_date_range(kwargs["period"])
            if start_day:
                kwargs["startDay"] = start_day
                kwargs["endDay"] = end_day
            del kwargs["period"]

    project_code = kwargs.get("projectCode")

    result = query_work_hours(
        token,
        kwargs.get("projectCode"),
        kwargs.get("startDay"),
        kwargs.get("endDay"),
    )

    suffix = f"workhours_{project_code}" if project_code else "workhours_all"
    save_result(result, suffix)
