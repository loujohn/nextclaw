#!/usr/bin/env python3
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

import os

ZENTAO_URL = os.environ.get("ZENTAO_URL", "https://zentao.example.com:18080")
ZENTAO_USER = os.environ.get("ZENTAO_USER", "admin")
ZENTAO_PASS = os.environ.get("ZENTAO_PASS", "your_password_here")


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
    result = exec_cmd("zentaopms auth status")
    if result and result.returncode == 0:
        output = result.stdout + result.stderr
        if "connected: True" in output or "connected: true" in output:
            return True
    return False


def ensure_auth():
    if check_auth():
        print("[禅道认证] 已认证，无需重新认证")
        return True

    print("[禅道认证] 未认证，正在进行认证...")
    cmd = f'zentaopms auth setup --url {ZENTAO_URL} --username {ZENTAO_USER} --password "{ZENTAO_PASS}" --insecure'
    result = exec_cmd(cmd)

    if check_auth():
        print("[禅道认证] 认证成功")
        return True
    else:
        print("[禅道认证] 认证失败", file=sys.stderr)
        return False


def main():
    args = sys.argv[1:]

    if "--check" in args:
        is_auth = check_auth()
        print("已认证" if is_auth else "未认证")
        sys.exit(0 if is_auth else 1)
    elif "--help" in args:
        print("""
禅道认证脚本

用法:
  python auth.py           检查并认证（如未认证）
  python auth.py --check  检查认证状态
  python auth.py --help   显示帮助信息
""")
    else:
        ensure_auth()


if __name__ == "__main__":
    main()
