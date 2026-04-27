"""钉钉通知技能 - 命令行交互模块

处理群机器人通知和工作通知的发送逻辑。
"""
import os
import sys

from api import (
    send_text,
    send_markdown,
    send_link,
    send_action_card,
    send_work_notify,
    get_access_token,
)
from models import (
    read_file_content,
    extract_dingtalk_id_from_file,
    resolve_file_path,
    copy_to_temp,
)
from config import Config


def handle_group_text(content):
    """发送群机器人文本消息"""
    result = send_text(content)
    _check_result(result)


def handle_group_markdown(title, content, file_path=None, cleanup=False, temp_dir=None):
    """发送群机器人 Markdown 消息"""
    if file_path:
        abs_path, is_in_temp = resolve_file_path(file_path, temp_dir)

        if is_in_temp:
            text = read_file_content(abs_path)
            result = send_markdown(title, text)
            if cleanup and os.path.exists(abs_path):
                os.remove(abs_path)
        else:
            temp_file = copy_to_temp(abs_path, temp_dir)
            text = read_file_content(temp_file)
            result = send_markdown(title, text)
            if cleanup and os.path.exists(temp_file):
                os.remove(temp_file)
    else:
        result = send_markdown(title, content)

    _check_result(result)


def handle_group_link(title, text, url):
    """发送群机器人链接消息"""
    result = send_link(title, text, url)
    _check_result(result)


def handle_group_action_card(title, text, btn_title, btn_url):
    """发送群机器人 ActionCard 消息"""
    result = send_action_card(title, text, btn_title, btn_url)
    _check_result(result)


def handle_work_notify(args, temp_dir):
    """发送工作通知（个人消息）"""
    access_token = args.token
    agent_id = args.agent or Config.AGENT_ID
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

    # 如果未指定 --user，尝试从文件名提取钉钉ID
    if not user_id and source_file:
        user_id = extract_dingtalk_id_from_file(source_file)

    # 使用默认值或提供的值获取 token
    appkey = args.appkey or Config.APP_KEY
    secret = args.secret or Config.APP_SECRET

    if not access_token:
        try:
            access_token = get_access_token(appkey, secret)
        except Exception as e:
            print(f"获取 token 失败: {e}", file=sys.stderr)
            sys.exit(1)

    if not agent_id or not user_id or not content_type or not content:
        print(
            "错误: 工作通知需要 (--token 或 --appkey+--secret) + --agent + --user + --msgtype + --content 参数",
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


def handle_get_token(appkey, secret):
    """获取 access_token"""
    if not appkey or not secret:
        print("错误: 获取 token 需要 --appkey 和 --secret 参数", file=sys.stderr)
        sys.exit(1)
    try:
        token = get_access_token(appkey, secret)
        print(token)
    except Exception as e:
        print(f"获取 token 失败: {e}", file=sys.stderr)
        sys.exit(1)


def _check_result(result):
    """检查发送结果"""
    if result.get("errcode") == 0:
        print(f"发送成功: {result.get('errmsg')}")
    else:
        print(
            f"发送失败: {result.get('errmsg')} (code: {result.get('errcode')})",
            file=sys.stderr,
        )
        sys.exit(1)
