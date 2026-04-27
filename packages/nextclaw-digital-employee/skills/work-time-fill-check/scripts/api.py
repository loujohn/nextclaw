"""工时填报检查技能 - API 请求模块

封装 Token 获取和 HTTP 请求逻辑。
"""
import json
import urllib.parse
import urllib.request
import urllib.error

from config import Config


def get_token():
    """OAuth2 登录获取 token"""
    if not Config.BASE_URL:
        raise Exception("PM_BASE_URL 环境变量未设置")

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
        "Authorization": Config.BASIC_AUTH,
        "Accept": "application/json",
        "User-Agent": "nextclaw-work-time-check/1.0",
    }
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise Exception(f"HTTP {e.code}: {e.read().decode('utf-8')}")
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def _fetch_json(url, token, timeout=None):
    """GET 请求"""
    if timeout is None:
        timeout = Config.TIMEOUT / 1000

    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-work-time-check/1.0",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise Exception(f"HTTP {e.code}: {e.read().decode('utf-8')}")
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def query_unfilled_details():
    """获取未填写工时详情"""
    api_url = Config.API_URL or f"{Config.BASE_URL}/admin/zenTaoTaskLog/unfilledDetail"
    token = get_token()
    return _fetch_json(api_url, token)
