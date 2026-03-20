import requests
import json
import time
import sys

class DingTalkClient:
    def __init__(self, app_key, app_secret):
        self.app_key = app_key
        self.app_secret = app_secret
        self.access_token = self._get_access_token()

    def _get_access_token(self):
        """获取 AccessToken"""
        url = "https://oapi.dingtalk.com/gettoken"
        params = {
            "appkey": self.app_key,
            "appsecret": self.app_secret
        }
        resp = requests.get(url, params=params)
        result = resp.json()
        if result.get("errcode") != 0:
            print(f"获取 AccessToken 失败: {result}", file=sys.stderr)
            return None
        return result.get("access_token")

    def get_department_list(self, dept_id=1):
        """获取部门列表"""
        url = "https://oapi.dingtalk.com/topapi/v2/department/listsub"
        params = {"access_token": self.access_token}
        data = {
            "dept_id": dept_id,
            "language": "zh_CN"
        }
        resp = requests.post(url, params=params, json=data)
        result = resp.json()
        if result.get("errcode") != 0:
            print(f"获取部门列表失败 (dept_id={dept_id}): {result}", file=sys.stderr)
            return []
        return result.get("result", [])

    def get_department_users(self, dept_id, cursor=0, size=100):
        """获取部门用户列表"""
        url = "https://oapi.dingtalk.com/topapi/v2/user/list"
        params = {"access_token": self.access_token}
        data = {
            "dept_id": dept_id,
            "cursor": cursor,
            "size": size,
            "language": "zh_CN"
        }
        resp = requests.post(url, params=params, json=data)
        result = resp.json()
        if result.get("errcode") != 0:
            print(f"获取部门用户失败 (dept_id={dept_id}): {result}", file=sys.stderr)
            return {}
        return result.get("result", {})

    def get_user_detail(self, userid):
        """获取用户详情"""
        url = "https://oapi.dingtalk.com/topapi/v2/user/get"
        params = {"access_token": self.access_token}
        data = {
            "userid": userid,
            "language": "zh_CN"
        }
        resp = requests.post(url, params=params, json=data)
        result = resp.json()
        if result.get("errcode") != 0:
            print(f"获取用户详情失败 (userid={userid}): {result}", file=sys.stderr)
            return None
        return result.get("result", {})

    def get_all_departments_recursive(self, dept_id=1, parent_path=None):
        """递归获取所有部门，构建树结构"""
        if parent_path is None:
            parent_path = []

        departments = []
        sub_depts = self.get_department_list(dept_id)

        for dept in sub_depts:
            dept_info = {
                "dept_id": dept.get("dept_id"),
                "name": dept.get("name"),
                "parent_id": dept.get("parent_id"),
                "path": parent_path + [dept.get("name")],
                "sub_depts": []
            }
            # 递归获取子部门
            children = self.get_all_departments_recursive(dept.get("dept_id"), dept_info["path"])
            dept_info["sub_depts"] = children
            departments.append(dept_info)

        return departments

    def get_all_users(self):
        """获取所有用户（跨所有部门）"""
        all_users = {}
        dept_user_map = {}  # 记录每个部门的用户

        # 先获取所有部门
        all_depts = []
        def collect_depts(depts):
            for d in depts:
                all_depts.append(d)
                collect_depts(d.get("sub_depts", []))

        root_depts = self.get_all_departments_recursive()
        collect_depts(root_depts)

        print(f"共发现 {len(all_depts)} 个部门", file=sys.stderr)

        for dept in all_depts:
            dept_id = dept["dept_id"]
            dept_name = dept["name"]
            cursor = 0
            dept_users = []

            while True:
                result = self.get_department_users(dept_id, cursor)
                users = result.get("list", [])

                for user in users:
                    userid = user.get("userid")
                    if userid not in all_users:
                        # 获取用户详细信息
                        detail = self.get_user_detail(userid)
                        if detail:
                            all_users[userid] = detail
                        else:
                            all_users[userid] = user
                    dept_users.append(userid)

                if not result.get("has_more"):
                    break
                cursor = result.get("next_cursor", 0)
                time.sleep(0.1)  # 避免频率限制

            dept_user_map[dept_id] = {
                "dept_name": dept_name,
                "users": dept_users
            }
            print(f"部门 [{dept_name}] 获取到 {len(dept_users)} 个用户", file=sys.stderr)

        return {
            "departments": root_depts,
            "dept_user_map": dept_user_map,
            "users": all_users
        }


if __name__ == "__main__":
    import sys
    import argparse

    parser = argparse.ArgumentParser(description="拉取钉钉组织架构并输出 JSON")
    parser.add_argument("--app-key", required=True, help="钉钉 AppKey")
    parser.add_argument("--app-secret", required=True, help="钉钉 AppSecret")
    args = parser.parse_args()

    client = DingTalkClient(args.app_key, args.app_secret)

    if not client.access_token:
        print(json.dumps({"error": "获取 AccessToken 失败，请检查 AppKey 和 AppSecret"}), file=sys.stderr)
        sys.exit(1)

    result = client.get_all_users()

    # 将结果输出到 stdout（JSON），stderr 用于日志
    print(json.dumps(result, ensure_ascii=False))
