"""钉钉通知技能 - 数据处理模块

处理文件读取、编码处理和钉钉ID提取。
"""
import os


def read_file_content(file_path):
    """读取文件内容，自动处理编码"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="gbk") as f:
            return f.read()


def extract_dingtalk_id_from_file(file_path):
    """从文件名提取钉钉 ID（格式: user_{dingtalkId}_{timestamp}.md）"""
    if not file_path:
        return None
    basename = os.path.basename(file_path)
    if basename.startswith("user_"):
        parts = basename.split("_")
        if len(parts) >= 2:
            return parts[1]
    return None


def resolve_file_path(file_path, temp_dir):
    """解析文件路径，返回绝对路径和是否在临时目录内"""
    if os.path.isabs(file_path):
        abs_path = file_path
    elif os.path.exists(file_path):
        abs_path = os.path.abspath(file_path)
    else:
        abs_path = os.path.join(os.getcwd(), file_path)

    abs_path = os.path.normpath(abs_path)
    abs_temp_dir = os.path.normpath(os.path.abspath(temp_dir))

    is_in_temp = abs_path.startswith(abs_temp_dir) or abs_path.replace(
        "\\", "/"
    ).startswith(abs_temp_dir.replace("\\", "/"))

    return abs_path, is_in_temp


def copy_to_temp(file_path, temp_dir):
    """复制文件到临时目录"""
    import shutil
    ext = os.path.splitext(file_path)[1] or ".md"
    temp_file = os.path.join(temp_dir, f"msg_{os.getpid()}{ext}")
    shutil.copy(file_path, temp_file)
    return temp_file
