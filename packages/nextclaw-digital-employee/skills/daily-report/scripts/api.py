"""日报技能 - API 请求模块

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

    def _post_form(self, url, form_data, timeout=120):
        """POST 表单请求"""
        data = urllib.parse.urlencode(form_data).encode("utf-8")
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "nextclaw-daily-report/1.0",
        }
        if self.basic_auth:
            headers["Authorization"] = self.basic_auth
        req = urllib.request.Request(url, data=data, headers=headers)
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

    def _fetch_json(self, url, timeout=120):
        """GET 请求（需要 Bearer token）"""
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": "nextclaw-daily-report/1.0",
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

    def _fetch_json_post(self, url, data, timeout=120, params=None):
        """POST JSON 请求"""
        body = json.dumps(data).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": "nextclaw-daily-report/1.0",
        }
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, data=body, headers=headers)
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

    def query_projects(self, username, project_name=None, current=1, size=50):
        """查询项目列表"""
        url = (
            f"{self.base_url}/admin/pageProjectForReport"
            f"?username={username}&queryType=3&current={current}&size={size}"
        )
        if project_name:
            url += f"&projectName={urllib.parse.quote(project_name)}"
        return self._fetch_json_post(url, {})

    def query_chances(self, chance_name=None, customer_code=None, current=1, size=50):
        """查询商机列表"""
        url = f"{self.base_url}/admin/business/chance/page?current={current}&size={size}"
        if chance_name:
            url += f"&chanceName={urllib.parse.quote(chance_name)}"
        if customer_code:
            url += f"&customerCode={urllib.parse.quote(customer_code)}"
        return self._fetch_json(url)

    def query_clients(self, client_name=None, current=1, size=50):
        """查询客户列表"""
        url = f"{self.base_url}/admin/getCustomer?current={current}&size={size}"
        if client_name:
            url += f"&customerName={urllib.parse.quote(client_name)}"
        return self._fetch_json_post(url, {})

    def query_contacts(self, customer_name=None, contacts_name=None, contacts_code=None):
        """查询对接人列表"""
        url = f"{self.base_url}/admin/getContacts"
        params = {}
        if customer_name:
            params["customerName"] = customer_name
        if contacts_name:
            params["contactsName"] = contacts_name
        if contacts_code:
            params["contactsCode"] = contacts_code
        return self._fetch_json_post(url, {}, params=params)

    def query_user_by_username(self, username):
        """根据用户名查询用户信息"""
        url = f"{self.base_url}/admin/user/page?current=1&size=10&username={urllib.parse.quote(username)}"
        return self._fetch_json(url)

    def query_dept_tree(self):
        """查询部门树"""
        url = f"{self.base_url}/admin/dept/tree"
        return self._fetch_json(url)

    def submit_report(self, report_data, report_user=None, report_name=None):
        """提交日报"""
        url = f"{self.base_url}/admin/dayReport"
        params = None
        if report_user:
            params = {"createBy": report_user}
        return self._fetch_json_post(url, [report_data], params=params)
