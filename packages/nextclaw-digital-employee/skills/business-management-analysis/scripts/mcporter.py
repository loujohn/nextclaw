"""经营管理分析技能 - mcporter 调用封装

动态查找 mcporter 并执行命令。
"""
import os
import shutil
import subprocess
import platform

from config import Config

_is_windows = platform.system() == "Windows"


def find_mcporter():
    """动态查找 mcporter 命令位置"""
    # 1. 环境变量 MCPORTER_PATH
    env_path = os.environ.get("MCPORTER_PATH", "").strip()
    if env_path:
        if os.path.isfile(env_path):
            if _is_windows or os.access(env_path, os.X_OK):
                print(f"[mcporter] 使用环境变量 MCPORTER_PATH: {env_path}", file=__import__("sys").stderr)
                return env_path
        print(f"[mcporter] 警告: MCPORTER_PATH 设置的路径无效: {env_path}", file=__import__("sys").stderr)

    # 2. 系统 PATH
    path_found = shutil.which("mcporter")
    if path_found:
        print(f"[mcporter] 在 PATH 中找到: {path_found}", file=__import__("sys").stderr)
        return path_found

    # 3. 常见固定路径
    common_paths = [
        "/usr/bin/mcporter",
        "/usr/local/bin/mcporter",
        "/opt/mcporter/bin/mcporter",
        "/opt/bin/mcporter",
        os.path.expanduser("~/.local/bin/mcporter"),
    ]
    if _is_windows:
        common_paths.extend([
            r"C:\Program Files\mcporter\mcporter.exe",
            r"C:\Program Files (x86)\mcporter\mcporter.exe",
            r"C:\mcporter\mcporter.exe",
            os.path.expanduser(r"~\AppData\Local\mcporter\mcporter.exe"),
        ])

    for path in common_paths:
        if os.path.isfile(path):
            if _is_windows or os.access(path, os.X_OK):
                print(f"[mcporter] 在固定路径中找到: {path}", file=__import__("sys").stderr)
                return path

    # 4. fallback
    print("[mcporter] 警告: 未找到 mcporter，将尝试直接使用命令名 'mcporter'", file=__import__("sys").stderr)
    return "mcporter"


# 模块加载时查找
MCPORTER_CMD = find_mcporter()


def run_mcporter(args_str):
    """执行 mcporter 命令"""
    cmd = f"{MCPORTER_CMD} {args_str} --http-url {Config.MCP_URL} --allow-http"
    result = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8" if _is_windows else None,
        errors="replace" if _is_windows else None,
    )
    return result
