#!/usr/bin/env python3
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

import os
import subprocess

PM_BASE_URL = os.environ.get(
    "PM_BASE_URL", "http://shangji.dcg-internal-services.dev.dcginner:10003/api"
)
PM_USERNAME = os.environ.get("PM_USERNAME", "admin")
PM_PASSWORD = os.environ.get("PM_PASSWORD", "")


def exec_cmd(command, check=True):
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        return result
    except subprocess.TimeoutExpired:
        print(f"命令执行超时: {command}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"命令执行失败: {command}, 错误: {e}", file=sys.stderr)
        return None


def check_auth():
    result = exec_cmd("projectmgt auth status")
    if result and result.returncode == 0:
        output = result.stdout + result.stderr
        if "connected: True" in output or "connected: true" in output:
            return True
    return False


def ensure_auth():
    if check_auth():
        print("[ProjectMGT认证] 已认证，无需重新认证")
        return True

    if not PM_PASSWORD:
        print("[ProjectMGT认证] 错误: 未设置 PM_PASSWORD 环境变量", file=sys.stderr)
        return False

    print("[ProjectMGT认证] 未认证，正在进行认证...")
    print(f"[ProjectMGT认证] PM_BASE_URL: {PM_BASE_URL}", file=sys.stderr)
    print(f"[ProjectMGT认证] PM_USERNAME: {PM_USERNAME}", file=sys.stderr)
    cmd = f"projectmgt auth setup --url {PM_BASE_URL} --username {PM_USERNAME} --password '{PM_PASSWORD}'"
    result = exec_cmd(cmd)

    if check_auth():
        print("[ProjectMGT认证] 认证成功")
        return True
    else:
        print("[ProjectMGT认证] 认证失败", file=sys.stderr)
        return False


def main():
    args = sys.argv[1:]

    if "--check" in args:
        is_auth = check_auth()
        print("已认证" if is_auth else "未认证")
        sys.exit(0 if is_auth else 1)
    elif "--help" in args:
        print("""
ProjectMGT 认证脚本

用法:
  python auth.py           检查并认证（如未认证）
  python auth.py --check  检查认证状态
  python auth.py --help   显示帮助信息

环境变量:
  PM_BASE_URL   - API 地址 (默认: http://shangji.dcg-internal-services.dev.dcginner:10003/api)
  PM_USERNAME   - 用户名 (默认: admin)
  PM_PASSWORD   - 密码
""")
    else:
        ensure_auth()


if __name__ == "__main__":
    main()
