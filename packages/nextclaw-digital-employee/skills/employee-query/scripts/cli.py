"""人员查询技能 - 命令行交互模块

处理各种查询命令的路由和结果输出。
"""
from api import APIClient
from models import (
    get_user_role_level,
    format_users,
    format_dept_managers,
    format_dept_tree,
)


def handle_query_depts(client):
    """查询部门树"""
    result = client.query_dept_tree()
    if result.get("code") == 0 and result.get("data"):
        dept_tree = result["data"]
        lines = ["部门结构：\n"]
        if isinstance(dept_tree, list):
            for dept in dept_tree:
                lines.extend(format_dept_tree(dept))
        else:
            lines.extend(format_dept_tree(dept_tree))
        print("\n".join(lines))
    else:
        print(f"查询失败：{result.get('message', '未知错误')}")


def handle_query_leaders(client):
    """查询公司领导（一级管理员）"""
    result = client.query_users(size=200)
    if result.get("code") == 0 and result.get("data"):
        records = result["data"].get("records", [])
        leaders = [u for u in records if get_user_role_level(u) == 1]
        if not leaders:
            print("未找到公司领导（一级管理员）")
        else:
            print(format_users(leaders, len(leaders)))
    else:
        print(f"查询失败：{result.get('message', '未知错误')}")


def handle_query_dept_managers(client):
    """查询部门负责人（二级管理员）"""
    result = client.query_users(size=200)
    if result.get("code") == 0 and result.get("data"):
        records = result["data"].get("records", [])
        managers = [u for u in records if get_user_role_level(u) == 2]
        if not managers:
            print("未找到部门负责人（二级管理员）")
        else:
            print(format_users(managers, len(managers)))
    else:
        print(f"查询失败：{result.get('message', '未知错误')}")


def handle_query_each_dept_manager(client):
    """查询各部门负责人（按部门分组）"""
    result = client.query_users(size=200)
    if result.get("code") == 0 and result.get("data"):
        records = result["data"].get("records", [])
        if not records:
            print("未找到用户数据")
        else:
            print(format_dept_managers(records))
    else:
        print(f"查询失败：{result.get('message', '未知错误')}")


def handle_query_dept_manager(client, dept_id):
    """查询某部门负责人"""
    result = client.query_users(dept_id=dept_id, size=200)
    if result.get("code") == 0 and result.get("data"):
        records = result["data"].get("records", [])
        managers = [u for u in records if get_user_role_level(u) == 2]
        if not managers:
            print("该部门未找到负责人（二级管理员）")
        else:
            print(format_users(managers, len(managers)))
    else:
        print(f"查询失败：{result.get('message', '未知错误')}")


def handle_query_users(client, name=None, username=None, phone=None, dept_id=None):
    """综合查询用户"""
    result = client.query_users(
        name=name,
        username=username,
        phone=phone,
        dept_id=dept_id,
    )
    if result.get("code") == 0 and result.get("data"):
        records = result["data"].get("records", [])
        total = result["data"].get("total", 0)
        print(format_users(records, total))
    else:
        print(f"查询失败：{result.get('message', '未知错误')}")
