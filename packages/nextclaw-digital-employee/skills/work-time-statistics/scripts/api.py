"""工时统计分析技能 - API 请求模块

封装 Token 获取和 HTTP 请求逻辑。
"""
import json
import urllib.parse
import urllib.request

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
        "User-Agent": "nextclaw-work-time-query/1.0",
    }
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def _fetch_json(url, token, timeout=None):
    """GET 请求"""
    if timeout is None:
        timeout = Config.TIMEOUT / 1000

    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "nextclaw-work-time-query/1.0",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def _fetch_json_post(url, data, token, timeout=None):
    """POST JSON 请求"""
    if timeout is None:
        timeout = Config.TIMEOUT / 1000

    body = json.dumps(data).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "nextclaw-work-time-query/1.0",
    }
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        raise Exception(f"请求失败: {e}")


def list_projects(token):
    """获取项目列表"""
    url = f"{Config.BASE_URL}/admin/project/getProjectCodeNameList"
    return _fetch_json(url, token)


def query_work_hours(token, project_code=None, start_day=None, end_day=None):
    """获取项目人员工时"""
    url = f"{Config.BASE_URL}/admin/project/workHour/getProjectUserWorkHour"
    form_data = {}
    if project_code:
        form_data["projectCode"] = project_code
    if start_day:
        form_data["startDay"] = start_day
    if end_day:
        form_data["endDay"] = end_day
    return _fetch_json_post(url, form_data, token)
