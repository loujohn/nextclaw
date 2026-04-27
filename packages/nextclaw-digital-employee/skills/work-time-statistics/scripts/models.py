"""工时统计分析技能 - 数据处理模块

处理日期范围计算和数据过滤。
"""
from datetime import datetime, timedelta, timezone


def get_date_range(period):
    """根据相对时间获取日期范围"""
    tz = timezone(timedelta(hours=8))
    today = datetime.now(tz).date()

    if period == "本周":
        days_since_monday = today.weekday()
        week_start = today - timedelta(days=days_since_monday)
        week_end = week_start + timedelta(days=6)
        return week_start.strftime("%Y-%m-%d"), week_end.strftime("%Y-%m-%d")
    elif period == "上周":
        days_since_monday = today.weekday()
        week_start = today - timedelta(days=days_since_monday)
        prev_week_start = week_start - timedelta(days=7)
        prev_week_end = week_start - timedelta(days=1)
        return prev_week_start.strftime("%Y-%m-%d"), prev_week_end.strftime("%Y-%m-%d")
    elif period == "本月":
        month_start = today.replace(day=1)
        if today.month == 12:
            month_end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            month_end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
        return month_start.strftime("%Y-%m-%d"), month_end.strftime("%Y-%m-%d")
    elif period == "上月":
        first_day_this_month = today.replace(day=1)
        prev_month_end = first_day_this_month - timedelta(days=1)
        prev_month_start = prev_month_end.replace(day=1)
        return prev_month_start.strftime("%Y-%m-%d"), prev_month_end.strftime("%Y-%m-%d")

    return None, None


# 项目类型映射
PROJECT_TYPE_MAP = {
    "承建": "2",
    "自研": "1",
    "运营": "3",
    "商机项目": "4",
}


def filter_projects_by_type(projects, project_type):
    """按项目类型过滤"""
    if not project_type:
        return projects
    type_code = PROJECT_TYPE_MAP.get(project_type, project_type)
    return [p for p in projects if p.get("projectType") == type_code]
