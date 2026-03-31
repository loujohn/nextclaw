#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

"""
钉钉通知脚本

群机器人通知:
  python dingtalk-notify.py markdown 标题 --file content.md

工作通知:
  python dingtalk-notify.py work --user xxx --type markdown --title 标题 --file content.md
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
import base64
import tempfile

WEBHOOK_URL = os.environ.get("DINGTALK_WEBHOOK_URL", "your_webhook_url_here")
WORK_NOTIFY_URL = os.environ.get(
    "DINGTALK_WORK_NOTIFY_URL",
    "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2",
)
TOKEN_URL = os.environ.get(
    "DINGTALK_TOKEN_URL", "https://api.dingtalk.com/v1.0/oauth2/accessToken"
)
DEFAULT_APP_KEY = os.environ.get("DINGTALK_APP_KEY", "your_appkey_here")
DEFAULT_APP_SECRET = os.environ.get("DINGTALK_APP_SECRET", "your_appsecret_here")
DEFAULT_AGENT_ID = os.environ.get("DINGTALK_AGENT_ID", "your_agent_id_here")


def read_file_content(file_path):
    """读取文件内容，自动处理编码"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="gbk") as f:
            return f.read()


def send_request(url, data, timeout=30):
    """发送HTTP请求"""
    if not url:
        raise ValueError("URL未配置，请设置环境变量 DINGTALK_WEBHOOK_URL")
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"errcode": e.code, "errmsg": str(e)}
    except Exception as e:
        return {"errcode": -1, "errmsg": str(e)}


def get_access_token(app_key, app_secret):
    """获取access_token"""
    data = {"appKey": app_key, "appSecret": app_secret}
    result = send_request(TOKEN_URL, data)
    if "accessToken" in result:
        return result["accessToken"]
    raise Exception(f"获取token失败: {result}")


def send_text(content):
    """发送文本消息"""
    body = {"msgtype": "text", "text": {"content": content}}
    return send_request(WEBHOOK_URL, body)


def send_markdown(title, text):
    """发送Markdown消息"""
    body = {"msgtype": "markdown", "markdown": {"title": title, "text": text}}
    return send_request(WEBHOOK_URL, body)


def send_link(title, text, message_url):
    """发送链接消息"""
    body = {
        "msgtype": "link",
        "link": {"title": title, "text": text, "messageUrl": message_url},
    }
    return send_request(WEBHOOK_URL, body)


def send_action_card(title, text, single_title, single_url):
    """发送ActionCard消息"""
    body = {
        "msgtype": "actionCard",
        "actionCard": {
            "title": title,
            "text": text,
            "singleTitle": single_title,
            "singleURL": single_url,
        },
    }
    return send_request(WEBHOOK_URL, body)


def send_work_notify(access_token, agent_id, user_id, msg_type, title, content):
    """发送工作通知"""
    if msg_type == "text":
        msg_content = {"content": content}
    elif msg_type == "markdown":
        msg_content = {"title": title or "", "text": content}
    else:
        raise ValueError("工作通知只支持 text 和 markdown 类型")

    body = {
        "agent_id": int(agent_id),
        "userid_list": user_id,
        "msg": {"msgtype": msg_type, msg_type: msg_content},
    }

    url = f"{WORK_NOTIFY_URL}?access_token={access_token}"
    return send_request(url, body)


def main():
    parser = argparse.ArgumentParser(description="钉钉通知脚本")
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
    parser.add_argument(
        "--cleanup", dest="cleanup", action="store_true", help="发送后删除临时文件"
    )

    args = parser.parse_args()

    # 临时目录：用户主目录下的固定目录（跨平台兼容）
    # Windows: C:\Users\用户名\nextclaw-temp
    # Linux/Mac: /home/用户名/nextclaw-temp 或 /Users/用户名/nextclaw-temp
    home_dir = os.path.expanduser("~")
    temp_dir = args.temp_dir or os.path.join(home_dir, "nextclaw-temp")
    os.makedirs(temp_dir, exist_ok=True)

    msg_type = args.type

    if not msg_type:
        print("""
钉钉通知脚本

用法:
  python dingtalk-notify.py <类型> [参数...]

【群机器人通知】
  python dingtalk-notify.py markdown 标题 --file content.md
  python dingtalk-notify.py link 标题 描述 URL

【工作通知】
  python dingtalk-notify.py work --token xxx --agent 123456 --user user001 --type text --content "内容"
  python dingtalk-notify.py work --appkey xxx --secret xxx --agent 123456 --user user001 --type markdown --title 标题 --file content.md
""")
        return

    # 获取 access_token
    if msg_type == "token":
        if not args.appkey or not args.secret:
            print("错误: 获取 token 需要 --appkey 和 --secret 参数", file=sys.stderr)
            sys.exit(1)
        try:
            token = get_access_token(args.appkey, args.secret)
            print(token)
        except Exception as e:
            print(f"获取 token 失败: {e}", file=sys.stderr)
            sys.exit(1)
        return

    if msg_type == "work":
        access_token = args.token
        agent_id = args.agent or DEFAULT_AGENT_ID
        user_id = args.user
        content_type = args.msgtype
        title = args.title
        content = args.content

        # 从文件读取内容
        source_file = args.file
        temp_file = None
        if source_file:
            content = read_file_content(source_file)
            if args.cleanup and source_file and os.path.exists(source_file):
                temp_file = source_file

        # 如果未指定--user，尝试从文件名提取钉钉ID
        if not user_id and source_file:
            basename = os.path.basename(source_file)
            if basename.startswith("user_"):
                parts = basename.split("_")
                if len(parts) >= 2:
                    user_id = parts[1]

        # 使用默认值或提供的值获取token
        appkey = args.appkey or DEFAULT_APP_KEY
        secret = args.secret or DEFAULT_APP_SECRET

        if not access_token:
            try:
                access_token = get_access_token(appkey, secret)
            except Exception as e:
                print(f"获取 token 失败: {e}", file=sys.stderr)
                sys.exit(1)

        if not agent_id or not user_id or not content_type or not content:
            print(
                "错误: 工作通知需要 (--token 或 --appkey+--secret) + --agent + --user + --type + --content 参数",
                file=sys.stderr,
            )
            sys.exit(1)

        try:
            result = send_work_notify(
                access_token, agent_id, user_id, content_type, title, content
            )
            if result.get("errcode") == 0:
                print(f"工作通知发送成功, task_id: {result.get('task_id')}")
                if args.cleanup and temp_file and os.path.exists(temp_file):
                    os.remove(temp_file)
            else:
                print(
                    f"工作通知发送失败: {result.get('errmsg')} (code: {result.get('errcode')})",
                    file=sys.stderr,
                )
                sys.exit(1)
        except Exception as e:
            print(f"请求失败: {e}", file=sys.stderr)
            sys.exit(1)
        return

    # 群机器人消息
    if msg_type == "text":
        if not args.title:
            print("错误: text 类型需要提供内容", file=sys.stderr)
            sys.exit(1)
        result = send_text(args.title)
    elif msg_type == "markdown":
        title = args.title or ""
        text = args.content or ""
        source_file = args.file
        if source_file:
            if os.path.isabs(source_file):
                abs_source = source_file
            elif os.path.exists(source_file):
                abs_source = os.path.abspath(source_file)
            else:
                abs_source = os.path.join(os.getcwd(), source_file)
            abs_source = os.path.normpath(abs_source)
            abs_temp_dir = os.path.normpath(os.path.abspath(temp_dir))
            is_in_temp = abs_source.startswith(abs_temp_dir) or abs_source.replace(
                "\\", "/"
            ).startswith(abs_temp_dir.replace("\\", "/"))

            if is_in_temp:
                text = read_file_content(abs_source)
                result = send_markdown(title, text)
                if args.cleanup and os.path.exists(abs_source):
                    os.remove(abs_source)
            else:
                import shutil

                ext = os.path.splitext(source_file)[1] or ".md"
                temp_file = os.path.join(temp_dir, f"msg_{os.getpid()}{ext}")
                shutil.copy(abs_source, temp_file)
                text = read_file_content(temp_file)
                result = send_markdown(title, text)
                if args.cleanup and os.path.exists(temp_file):
                    os.remove(temp_file)
        else:
            result = send_markdown(title, text)
    elif msg_type == "link":
        if not args.title or not args.content or not args.link:
            print("错误: link 类型需要提供标题、描述和链接", file=sys.stderr)
            sys.exit(1)
        result = send_link(args.title, args.content, args.link)
    elif msg_type == "actioncard":
        if not args.title or not args.content or not args.btn or not args.btn_url:
            print(
                "错误: actioncard 类型需要提供标题、内容、按钮文字和按钮链接",
                file=sys.stderr,
            )
            sys.exit(1)
        result = send_action_card(args.title, args.content, args.btn, args.btn_url)
    else:
        print(f"错误: 不支持的消息类型: {msg_type}", file=sys.stderr)
        sys.exit(1)

    if result.get("errcode") == 0:
        print(f"发送成功: {result.get('errmsg')}")
    else:
        print(
            f"发送失败: {result.get('errmsg')} (code: {result.get('errcode')})",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
