"""工时填报检查技能 - 配置模块

管理所有环境变量和默认配置。
"""
import os
import sys


class Config:
    """配置类，统一管理环境变量"""

    # API 配置
    BASE_URL = os.environ.get("PM_BASE_URL", "")
    API_URL = os.environ.get("PM_API", "")
    BASIC_AUTH = os.environ.get("PM_BASIC_AUTH", "")
    USERNAME = os.environ.get("PM_USERNAME", "")
    PASSWORD = os.environ.get("PM_PASSWORD", "")
    TIMEOUT = int(os.environ.get("PM_TIMEOUT", "600000"))

    # 工作区配置（仅代码获取）
    _WORKSPACE_ROOT = None

    # 技能名称
    SKILL_NAME = "work-time-fill-check"

    @staticmethod
    def _mask_secret(value):
        """脱敏处理：密码/密钥只显示前4位和后4位"""
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
        if not cls.BASE_URL:
            missing.append("PM_BASE_URL")
        if not cls.USERNAME:
            missing.append("PM_USERNAME")
        if not cls.PASSWORD:
            missing.append("PM_PASSWORD")
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
