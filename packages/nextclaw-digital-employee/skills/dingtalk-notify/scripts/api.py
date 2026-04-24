"""钉钉通知技能 - API 请求模块

封装钉钉 HTTP 请求和消息发送逻辑。
"""
import json
import urllib.request
import urllib.error

from config import Config


def send_request(url, data, timeout=30):
    """发送 HTTP 请求"""
    if not url:
        raise ValueError("URL 未配置")
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
    """获取 access_token"""
    data = {"appKey": app_key, "appSecret": app_secret}
    result = send_request(Config.TOKEN_URL, data)
    if "accessToken" in result:
        return result["accessToken"]
    raise Exception(f"获取token失败: {result}")


def send_text(content):
    """发送文本消息（群机器人）"""
    body = {"msgtype": "text", "text": {"content": content}}
    return send_request(Config.WEBHOOK_URL, body)


def send_markdown(title, text):
    """发送 Markdown 消息（群机器人）"""
    body = {"msgtype": "markdown", "markdown": {"title": title, "text": text}}
    return send_request(Config.WEBHOOK_URL, body)


def send_link(title, text, message_url):
    """发送链接消息（群机器人）"""
    body = {
        "msgtype": "link",
        "link": {"title": title, "text": text, "messageUrl": message_url},
    }
    return send_request(Config.WEBHOOK_URL, body)


def send_action_card(title, text, single_title, single_url):
    """发送 ActionCard 消息（群机器人）"""
    body = {
        "msgtype": "actionCard",
        "actionCard": {
            "title": title,
            "text": text,
            "singleTitle": single_title,
            "singleURL": single_url,
        },
    }
    return send_request(Config.WEBHOOK_URL, body)


def send_work_notify(access_token, agent_id, user_id, msg_type, title, content):
    """发送工作通知（个人消息）"""
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

    url = f"{Config.WORK_NOTIFY_URL}?access_token={access_token}"
    return send_request(url, body)
