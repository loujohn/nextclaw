"""人员查询技能 - API 请求模块

封装所有 HTTP 请求和登录逻辑。
"""
import json
import urllib.parse
import urllib.request
import urllib.error

from config import Config


class APIClient:
    """API 客户端，封装所有 HTTP 请求"""

    def __init__(self, base_url=None, username=None, password=None, basic_auth=None):
        self.base_url = base_url or Config.BASE_URL
        self.username = username or Config.USERNAME
        self.password = password or Config.PASSWORD
        self.basic_auth = basic_auth or Config.BASIC_AUTH
        self.token = None

    def _post_form(self, url, form_data, timeout=30):
        """POST 表单请求"""
        data = urllib.parse.urlencode(form_data).encode("utf-8")
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "nextclaw-employee-query/1.0",
        }
        if self.basic_auth:
            headers["Authorization"] = self.basic_auth
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as e:
            return {"code": -1, "message": str(e)}

    def _fetch_json(self, url, timeout=30):
        """GET 请求"""
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": "nextclaw-employee-query/1.0",
        }
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                return {"code": e.code, "message": e.read().decode("utf-8")}
            except:
                return {"code": e.code, "message": str(e)}
        except urllib.error.URLError as e:
            return {"code": -1, "message": f"网络请求失败: {e.reason}"}
        except Exception as e:
            return {"code": -1, "message": str(e)}

    def login(self):
        """OAuth2 登录获取 token"""
        url = f"{self.base_url}/admin/oauth2/token"
        form_data = {
            "grant_type": "password",
            "username": self.username,
            "password": self.password,
            "login_type": "quick",
        }
        result = self._post_form(url, form_data)
        if "access_token" in result:
            self.token = result["access_token"]
            return self.token
        raise Exception(f"登录失败: {result.get('message', result)}")

    def query_users(self, dept_id=None, username=None, phone=None, name=None, current=1, size=50):
        """查询用户列表"""
        url = f"{self.base_url}/admin/user/page?current={current}&size={size}"
        if dept_id:
            url += f"&deptId={urllib.parse.quote(dept_id)}"
        if username:
            url += f"&username={urllib.parse.quote(username)}"
        if phone:
            url += f"&phone={urllib.parse.quote(phone)}"
        if name:
            url += f"&name={urllib.parse.quote(name)}"
        return self._fetch_json(url)

    def query_dept_tree(self):
        """查询部门树"""
        url = f"{self.base_url}/admin/dept/tree"
        return self._fetch_json(url)
