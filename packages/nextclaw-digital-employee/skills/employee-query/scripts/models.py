"""人员查询技能 - 数据模型和格式化模块

处理用户数据解析、角色判断和输出格式化。
"""


def get_user_role_level(user_data):
    """根据角色名称判断级别（不依赖 roleId，跨环境稳定）

    - 一级管理员 → 1（公司领导）
    - 二级管理员 → 2（部门负责人）
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
        child_lines = _format_dept_tree_child(child, indent + 1, is_last)
        lines.extend(child_lines)
    return lines


def _format_dept_tree_child(dept_tree, indent, is_last):
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
        child_lines = _format_dept_tree_child(child, indent + 1, child_is_last)
        lines.extend(child_lines)
    return lines
