#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""钉钉通知技能 - 主入口

用法:
  python dingtalk-notify.py markdown 标题 --file content.md
  python dingtalk-notify.py work --user xxx --msgtype markdown --file content.md
"""
import sys
import io
import argparse
import os

# 确保 Windows 控制台使用 UTF-8
if sys.platform == "win32":
    import ctypes
    ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from config import Config
from cli import (
    handle_group_text,
    handle_group_markdown,
    handle_group_link,
    handle_group_action_card,
    handle_work_notify,
    handle_get_token,
)


def build_parser():
    """构建命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description="钉钉通知脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "type",
        nargs="?",
        help="消息类型: text, markdown, link, actioncard, token, work",
    )
    parser.add_argument("title", nargs="?", help="标题")
    parser.add_argument("--file", dest="file", help="从文件读取内容")
    parser.add_argument("--content", dest="content", help="消息内容")
    parser.add_argument("--link", dest="link", help="链接消息的URL")
    parser.add_argument("--btn", dest="btn", help="按钮文字(actioncard)")
    parser.add_argument("--btn-url", dest="btn_url", help="按钮链接(actioncard)")
    parser.add_argument("--token", dest="token", help="access_token")
    parser.add_argument("--appkey", dest="appkey", help="应用appKey")
    parser.add_argument("--secret", dest="secret", help="应用appSecret")
    parser.add_argument("--agent", dest="agent", help="应用AgentID")
    parser.add_argument("--user", dest="user", help="接收者userid")
    parser.add_argument("--msgtype", dest="msgtype", help="消息类型: text, markdown")
    parser.add_argument("--temp-dir", dest="temp_dir", help="临时文件目录")
    parser.add_argument("--cleanup", dest="cleanup", action="store_true", help="发送后删除临时文件")

    return parser


def print_help():
    """打印使用说明"""
    print("""
钉钉通知脚本

用法:
  python dingtalk-notify.py <类型> [参数...]

【群机器人通知】
  python dingtalk-notify.py markdown 标题 --file content.md
  python dingtalk-notify.py link 标题 描述 URL

【工作通知】
  python dingtalk-notify.py work --token xxx --agent 123456 --user user001 --msgtype text --content "内容"
  python dingtalk-notify.py work --appkey xxx --secret xxx --agent 123456 --user user001 --msgtype markdown --title 标题 --file content.md
""")


def main():
    # 第一步：校验环境变量
    Config.validate_and_exit()

    parser = build_parser()
    args = parser.parse_args()

    if not args.type:
        print_help()
        return

    # 临时目录
    temp_dir = args.temp_dir or Config.get_temp_dir()
    os.makedirs(temp_dir, exist_ok=True)

    msg_type = args.type

    try:
        if msg_type == "token":
            handle_get_token(args.appkey, args.secret)

        elif msg_type == "work":
            handle_work_notify(args, temp_dir)

        elif msg_type == "text":
            if not args.title:
                print("错误: text 类型需要提供内容", file=sys.stderr)
                sys.exit(1)
            handle_group_text(args.title)

        elif msg_type == "markdown":
            title = args.title or ""
            content = args.content or ""
            handle_group_markdown(title, content, args.file, args.cleanup, temp_dir)

        elif msg_type == "link":
            if not args.title or not args.content or not args.link:
                print("错误: link 类型需要提供标题、描述和链接", file=sys.stderr)
                sys.exit(1)
            handle_group_link(args.title, args.content, args.link)

        elif msg_type == "actioncard":
            if not args.title or not args.content or not args.btn or not args.btn_url:
                print("错误: actioncard 类型需要提供标题、内容、按钮文字和按钮链接", file=sys.stderr)
                sys.exit(1)
            handle_group_action_card(args.title, args.content, args.btn, args.btn_url)

        else:
            print(f"错误: 不支持的消息类型: {msg_type}", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
