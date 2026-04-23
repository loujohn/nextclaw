#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

if sys.platform == "win32":
    import ctypes
    ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

import os
import json
import urllib.request
import urllib.parse
import urllib.error
import argparse

PM_BASE_URL = os.environ.get("PM_BASE_URL")
PM_USERNAME = os.environ.get("PM_USERNAME")
PM_PASSWORD = os.environ.get("PM_PASSWORD")
PM_BASIC_AUTH = os.environ.get("PM_BASIC_AUTH")

LOGIN_ENDPOINT = "/admin/oauth2/token"
USER_PAGE_ENDPOINT = "/admin/user/page"
DEPT_TREE_ENDPOINT = "/admin/dept/tree"


def post_form(url, data, auth_header=None):
    """POST form data"""
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if auth_header:
        headers["Authorization"] = auth_header
    form_data = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=form_data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        return {"message": str(e)}


def login(base_url, username, password):
    """OAuth2登录获取token"""
    url = f"{base_url}{LOGIN_ENDPOINT}"
    form_data = {
        "grant_type": "password",
        "username": username,
        "password": password,
        "login_type": "quick",
    }
    result = post_form(url, form_data, PM_BASIC_AUTH if PM_BASIC_AUTH else None)

    if "access_token" in result:
        return result["access_token"]
    raise Exception(f"登录失败: {result.get('message', result)}")


def fetch_json(url, token, timeout=30):
    """GET 请求获取 JSON"""
    body = None
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-employee-query/1.0",
    }

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


def query_users(dept_id=None, username=None, phone=None, name=None, current=1, size=50):
    """查询用户列表"""
    token = login(PM_BASE_URL, PM_USERNAME, PM_PASSWORD)
    url = f"{PM_BASE_URL}{USER_PAGE_ENDPOINT}?current={current}&size={size}"
    if dept_id:
        url += f"&deptId={urllib.parse.quote(dept_id)}"
    if username:
        url += f"&username={urllib.parse.quote(username)}"
    if phone:
        url += f"&phone={urllib.parse.quote(phone)}"
    if name:
        url += f"&name={urllib.parse.quote(name)}"
    return fetch_json(url, token)


def query_dept_tree():
    """查询部门树"""
    token = login(PM_BASE_URL, PM_USERNAME, PM_PASSWORD)
    url = f"{PM_BASE_URL}{DEPT_TREE_ENDPOINT}"
    return fetch_json(url, token)


def get_user_role_level(user_data):
    """根据角色名称判断级别（不依赖 roleId，跨环境稳定）
    
    - 一级管理员 → 公司领导
    - 二级管理员 → 部门负责人
    """
    role_list = user_data.get("roleList", [])
    if not role_list:
        return None
    
    for role in role_list:
        role_name = role.get("roleName", "")
        if "一级管理员" in role_name:
            return 1
        elif "二级管理员" in role_name:
            return 2
    return None


def format_users(records, total=0, show_email=False):
    """格式化用户列表"""
    if not records:
        return "未找到匹配用户"

    lines = [f"共找到 {total} 个用户：\n"]
    for i, u in enumerate(records, 1):
        name = u.get("name", "")
        username = u.get("username", "")
        phone = u.get("phone", "")
        email = u.get("email", "")
        dept_name = u.get("deptName", "")
        role_list = u.get("roleList", [])
        role_names = u.get("roleNames", "")

        role_level = get_user_role_level(u)
        if role_level == 1:
            role_desc = " 【公司领导】"
        elif role_level == 2:
            role_desc = " 【部门负责人】"
        else:
            role_desc = ""

        line_parts = [f"{i}. {name}"]
        line_parts.append(f"用户名：{username}")
        if phone:
            line_parts.append(f"手机：{phone}")
        if show_email and email:
            line_parts.append(f"邮箱：{email}")
        if dept_name:
            line_parts.append(f"部门：{dept_name}")
        if role_names:
            line_parts.append(f"角色：{role_names}")
        
        lines.append(f"   {' | '.join(line_parts)}{role_desc}")
    
    if total > len(records):
        lines.append(f"\n（显示前 {len(records)} 条，共有 {total} 条，可使用更精确的关键词缩小范围）")
    return "\n".join(lines)


def format_dept_managers(records):
    """按部门格式化部门负责人"""
    dept_managers = {}
    for u in records:
        if get_user_role_level(u) == 2:
            dept_name = u.get("deptName", "") or "未分配部门"
            if dept_name not in dept_managers:
                dept_managers[dept_name] = []
            dept_managers[dept_name].append(u)

    if not dept_managers:
        return "未找到部门负责人（二级管理员）"

    lines = ["各部门负责人：\n"]
    for dept_name in sorted(dept_managers.keys()):
        users = dept_managers[dept_name]
        lines.append(f"\n【{dept_name}】")
        for u in users:
            name = u.get("name", "")
            username = u.get("username", "")
            phone = u.get("phone", "")
            lines.append(f"  - {name}（用户名：{username}，手机：{phone}）")
    return "\n".join(lines)


def format_dept_tree(dept_tree, indent=0):
    """格式化部门树"""
    lines = []
    prefix = "│   " * indent
    connector = "├── " if indent > 0 else ""
    name = dept_tree.get("name", "")
    dept_id = dept_tree.get("id", "")
    lines.append(f"{prefix}{connector}{name}（ID: {dept_id}）")

    children = dept_tree.get("children", [])
    for i, child in enumerate(children):
        is_last = (i == len(children) - 1)
        child_lines = format_dept_tree_child(child, indent + 1, is_last)
        lines.extend(child_lines)
    return lines


def format_dept_tree_child(dept_tree, indent, is_last):
    """格式化部门树（支持最后一行）"""
    lines = []
    prefix = "│   " * (indent - 1)
    connector = "└── " if is_last else "├── "
    name = dept_tree.get("name", "")
    dept_id = dept_tree.get("id", "")
    lines.append(f"{prefix}{connector}{name}（ID: {dept_id}）")

    children = dept_tree.get("children", [])
    for i, child in enumerate(children):
        child_is_last = (i == len(children) - 1)
        child_lines = format_dept_tree_child(child, indent + 1, child_is_last)
        lines.extend(child_lines)
    return lines


def main():
    parser = argparse.ArgumentParser(description="人员查询工具")
    parser.add_argument(
        "--query-depts",
        action="store_true",
        help="查询部门树",
    )
    parser.add_argument(
        "--query-leaders",
        action="store_true",
        help="查询公司领导（一级管理员）",
    )
    parser.add_argument(
        "--query-dept-managers",
        dest="query_dept_managers",
        action="store_true",
        help="查询部门负责人（二级管理员）",
    )
    parser.add_argument(
        "--query-each-dept-manager",
        dest="query_each_dept_manager",
        action="store_true",
        help="查询每个部门的负责人",
    )
    parser.add_argument(
        "--query-users",
        dest="query_users",
        nargs="?",
        const="",
        default=None,
        type=str,
        help="根据姓名/用户名查询用户",
    )
    parser.add_argument(
        "--dept-id",
        dest="dept_id",
        type=str,
        help="部门ID，查询某部门人员",
    )
    parser.add_argument(
        "--name",
        type=str,
        help="按姓名查询",
    )
    parser.add_argument(
        "--username",
        type=str,
        help="按用户名查询",
    )
    parser.add_argument(
        "--phone",
        type=str,
        help="按手机号查询",
    )
    parser.add_argument(
        "--dept-manager",
        dest="dept_manager",
        type=str,
        help="查询某部门指定角色（一级管理员/二级管理员/所有）",
    )

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
        print("  --dept-manager <部门 ID>    查询某部门负责人（支持角色过滤）")
        print("\n示例：")
        print("  python employee-query.py --query-depts")
        print("  python employee-query.py --query-leaders")
        print("  python employee-query.py --query-users 张三")
        print("  python employee-query.py --dept-id 1787377767628632065")
        print("  python employee-query.py --dept-manager 1787377767628632065")
        print("  python employee-query.py --dept-manager 1787377767628632065 一级管理员")
        return

    if args.query_depts:
        result = query_dept_tree()
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
        return

    if args.query_leaders:
        result = query_users(size=200)
        if result.get("code") == 0 and result.get("data"):
            records = result["data"].get("records", [])
            leaders = [u for u in records if get_user_role_level(u) == 1]
            if not leaders:
                print("未找到公司领导（一级管理员）")
            else:
                print(format_users(leaders, len(leaders)))
        else:
            print(f"查询失败：{result.get('message', '未知错误')}")
        return

    if args.query_dept_managers:
        result = query_users(size=200)
        if result.get("code") == 0 and result.get("data"):
            records = result["data"].get("records", [])
            managers = [u for u in records if get_user_role_level(u) == 2]
            if not managers:
                print("未找到部门负责人（二级管理员）")
            else:
                print(format_users(managers, len(managers)))
        else:
            print(f"查询失败：{result.get('message', '未知错误')}")
        return

    if args.query_each_dept_manager:
        result = query_users(size=200)
        if result.get("code") == 0 and result.get("data"):
            records = result["data"].get("records", [])
            if not records:
                print("未找到用户数据")
            else:
                print(format_dept_managers(records))
        else:
            print(f"查询失败：{result.get('message', '未知错误')}")
        return

    if args.dept_manager:
        dept_id = args.dept_manager
        result = query_users(dept_id=dept_id, size=200)
        if result.get("code") == 0 and result.get("data"):
            records = result["data"].get("records", [])
            managers = [u for u in records if get_user_role_level(u) == 2]
            if not managers:
                print("该部门未找到负责人（二级管理员）")
            else:
                print(format_users(managers, len(managers)))
        else:
            print(f"查询失败：{result.get('message', '未知错误')}")
        return

    if args.query_users is not None or args.dept_id or args.name or args.username or args.phone:
        keyword = args.query_users if args.query_users is not None else ""
        result = query_users(
            name=keyword if keyword else args.name,
            username=args.username,
            phone=args.phone,
            dept_id=args.dept_id,
        )
        if result.get("code") == 0 and result.get("data"):
            records = result["data"].get("records", [])
            total = result["data"].get("total", 0)
            print(format_users(records, total))
        else:
            print(f"查询失败：{result.get('message', '未知错误')}")
        return


if __name__ == "__main__":
    main()
