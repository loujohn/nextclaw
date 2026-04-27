"""钉钉通知技能 - 配置模块

管理所有环境变量和默认配置。
"""
import os
import sys


class Config:
    """配置类，统一管理环境变量"""

    # 群机器人配置
    WEBHOOK_URL = os.environ.get("DINGTALK_WEBHOOK_URL", "")

    # 工作通知配置
    WORK_NOTIFY_URL = os.environ.get(
        "DINGTALK_WORK_NOTIFY_URL",
        "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2",
    )
    TOKEN_URL = os.environ.get(
        "DINGTALK_TOKEN_URL", "https://api.dingtalk.com/v1.0/oauth2/accessToken"
    )
    APP_KEY = os.environ.get("DINGTALK_APP_KEY", "")
    APP_SECRET = os.environ.get("DINGTALK_APP_SECRET", "")
    AGENT_ID = os.environ.get("DINGTALK_AGENT_ID", "")

    # 工作区配置（仅代码获取）
    _WORKSPACE_ROOT = None

    # 技能名称
    SKILL_NAME = "dingtalk-notify"

    @staticmethod
    def _mask_secret(value):
        """脱敏处理：密钥只显示前4位和后4位"""
        if not value or len(value) <= 8:
            return "****"
        return f"{value[:4]}****{value[-4:]}"

    @classmethod
    def get_workspace_root(cls):
        """获取工作区根目录（仅代码动态获取）"""
        if cls._WORKSPACE_ROOT:
            return cls._WORKSPACE_ROOT

        current = os.path.abspath(__file__)
        while current:
            if os.path.basename(current) == "skills":
                cls._WORKSPACE_ROOT = os.path.dirname(current)
                return cls._WORKSPACE_ROOT
            current = os.path.dirname(current)
        return None

    @classmethod
    def get_skills_root(cls):
        """获取 skills-log-files 目录"""
        root = cls.get_workspace_root()
        return os.path.join(root, "skills-log-files") if root else None

    @classmethod
    def get_temp_dir(cls):
        """获取技能临时目录（skills-log-files/技能名/）"""
        skills_root = cls.get_skills_root()
        if not skills_root:
            return None
        temp_dir = os.path.join(skills_root, cls.SKILL_NAME)
        os.makedirs(temp_dir, exist_ok=True)
        return temp_dir

    @classmethod
    def validate(cls):
        """校验环境变量，返回 (是否通过, 错误信息)"""
        missing = []
        if not cls.WEBHOOK_URL:
            missing.append("DINGTALK_WEBHOOK_URL")
        if not cls.APP_KEY:
            missing.append("DINGTALK_APP_KEY")
        if not cls.APP_SECRET:
            missing.append("DINGTALK_APP_SECRET")
        if not cls.AGENT_ID:
            missing.append("DINGTALK_AGENT_ID")
        if missing:
            return False, f"缺少环境变量: {', '.join(missing)}"
        return True, "配置正常"

    @classmethod
    def validate_and_exit(cls):
        """校验环境变量，失败则退出"""
        ok, msg = cls.validate()
        if not ok:
            print(f"[错误] {msg}", file=sys.stderr)
            sys.exit(1)
        return True
