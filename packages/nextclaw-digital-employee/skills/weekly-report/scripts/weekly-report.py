#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

import os
import argparse
from datetime import datetime


def get_temp_dir():
    # 临时目录：用户主目录下的固定目录（跨平台兼容）
    # Windows: C:\Users\用户名\nextclaw-temp
    # Linux/Mac: /home/用户名/nextclaw-temp 或 /Users/用户名/nextclaw-temp
    home_dir = os.path.expanduser("~")
    return os.path.join(home_dir, "nextclaw-temp")


def main():
    parser = argparse.ArgumentParser(description="周报临时文件生成")
    parser.add_argument("--title", dest="title", default="周报总结", help="标题")
    parser.add_argument("--file", dest="file", help="从文件读取内容")
    parser.add_argument("--content", dest="content", help="直接传入内容")
    args = parser.parse_args()

    temp_dir = get_temp_dir()
    os.makedirs(temp_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            content = f.read()
    elif args.content:
        content = args.content
    else:
        content = sys.stdin.read()

    report_file = os.path.join(temp_dir, f"weekly_{timestamp}.md")
    with open(report_file, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"[周报] 已生成: {report_file}", file=sys.stderr)


if __name__ == "__main__":
    main()
