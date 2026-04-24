"""经营管理分析技能 - API 请求模块

封装 Token 获取和 HTTP 请求逻辑。
"""
import json
import urllib.parse
import urllib.request

from config import Config


def get_token():
    """OAuth2 登录获取 token"""
    url = f"{Config.BASE_URL}/admin/oauth2/token"
    form_data = {
        "grant_type": "password",
        "username": Config.USERNAME,
        "password": Config.PASSWORD,
        "login_type": "quick",
    }
    result = _post_form(url, form_data)
    if "access_token" in result:
        return result["access_token"]
    raise Exception(f"获取Token失败: {json.dumps(result)}")


def _post_form(url, form_data, timeout=None):
    """POST 表单请求"""
    if timeout is None:
        timeout = Config.TIMEOUT / 1000

    data = urllib.parse.urlencode(form_data).encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "nextclaw-bm-query/1.0",
    }
    if Config.BASIC_AUTH:
        headers["Authorization"] = Config.BASIC_AUTH

    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise Exception(f"请求失败: {e}")
