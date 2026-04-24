"""日报技能 - 数据模型和验证模块

定义日报数据结构、校验规则和字段映射。
"""
from datetime import datetime


# 项目日报必填字段
PROJECT_REQUIRED_FIELDS = [
    ("date", "日期"),
    ("projectName", "项目名称"),
    ("projectStage", "项目阶段"),
    ("projectCode", "项目编号"),
    ("projectManager", "项目经理"),
    ("daySummarizeNow", "当日工作总结"),
    ("dayPlanNext", "次日工作计划"),
    ("dayReportType", "日报类型"),
]

# 商机日报必填字段
CHANCE_REQUIRED_FIELDS = [
    ("date", "日期"),
    ("dayReportType", "日报类型"),
    ("customerType", "客户类型（1=客户 2=合作伙伴）"),
    ("visitClientName", "拜访客户"),
    ("contractPersonName", "对接人"),
    ("contractPersonDeptName", "对接部门"),
    ("contractPersonPosition", "对接人职务"),
    ("visitRecord", "拜访记录"),
    ("clientHope", "客户期望"),
    ("dayPlanNext", "下一步计划"),
]

# 字段中文名映射
FIELD_NAME_MAP = {
    "date": "日期",
    "projectName": "项目名称",
    "projectStage": "项目阶段",
    "projectCode": "项目编号",
    "projectManager": "项目经理",
    "daySummarizeNow": "今日工作总结",
    "dayPlanNext": "下一步计划",
    "dayReportType": "日报类型",
    "chanceId": "商机ID",
    "chanceCode": "商机编码",
    "chanceProjectName": "商机/项目名称",
    "chanceProjectSchedule": "商机/项目阶段",
    "groupAttentionStage": "集团关注项目阶段",
    "customerType": "客户类型",
    "visitClientName": "拜访客户",
    "visitClientCode": "拜访客户编码",
    "visitClientId": "拜访客户ID",
    "contractPersonCode": "对接人code",
    "contractPersonName": "对接人",
    "contractPersonDeptName": "对接部门",
    "contractPersonPosition": "对接人职务",
    "contractPersonDeptId": "对接人部门ID",
    "visitRecord": "拜访记录",
    "clientHope": "客户期望",
    "dayPlanNow": "今日工作计划",
}


class ReportData:
    """日报数据模型"""

    def __init__(self, data=None):
        self.data = data or {}

    @property
    def report_type(self):
        """获取日报类型：1=商机日报，2=项目日报"""
        return self.data.get("dayReportType", 2)

    @property
    def is_chance_report(self):
        """是否为商机日报"""
        return self.report_type == 1

    @property
    def is_project_report(self):
        """是否为项目日报"""
        return self.report_type == 2

    def get(self, key, default=None):
        return self.data.get(key, default)

    def set(self, key, value):
        self.data[key] = value

    def normalize(self):
        """统一字段名：双向转换（用户字段 <-> 接口字段）"""
        if "chanceProjectName" in self.data and "projectName" not in self.data:
            self.data["projectName"] = self.data["chanceProjectName"]
        if "projectName" in self.data and "chanceProjectName" not in self.data:
            self.data["chanceProjectName"] = self.data["projectName"]
        if "chanceProjectSchedule" in self.data and "projectStage" not in self.data:
            self.data["projectStage"] = self.data["chanceProjectSchedule"]
        if "projectStage" in self.data and "chanceProjectSchedule" not in self.data:
            self.data["chanceProjectSchedule"] = self.data["projectStage"]
        return self

    def validate(self):
        """校验日报数据，返回缺失字段列表"""
        required = CHANCE_REQUIRED_FIELDS if self.is_chance_report else PROJECT_REQUIRED_FIELDS
        missing = []

        for field_key, field_name in required:
            if field_key not in self.data or self.data[field_key] is None or self.data[field_key] == "":
                missing.append((field_key, field_name))

        if "dayReportTime" not in self.data or not self.data["dayReportTime"]:
            if "date" in self.data and self.data["date"]:
                self.data["dayReportTime"] = self.data["date"]
            else:
                missing.append(("dayReportTime", "日报时间"))

        if "date" not in self.data or not self.data["date"]:
            if "dayReportTime" in self.data and self.data["dayReportTime"]:
                self.data["date"] = self.data["dayReportTime"]
            else:
                missing.append(("date", "日期"))

        return missing

    def prepare_for_submit(self):
        """准备提交数据"""
        self.normalize()
        base = {
            "dayReportTime": self.data.get("dayReportTime", self.data.get("date", "")),
            "dayReportType": self.report_type,
            "dayPlanNow": self.data.get("dayPlanNow", "无"),
            "daySummarizeNow": self.data.get("daySummarizeNow", ""),
            "dayPlanNext": self.data.get("dayPlanNext", ""),
            "problemRisk": self.data.get("problemRisk", ""),
            "requestInstructions": self.data.get("requestInstructions", ""),
            "accompanyingPersonnelList": self.data.get("accompanyingPersonnelList", []),
        }

        if self.is_chance_report:
            base.update({
                "date": self.data.get("date", ""),
                "chanceId": self.data.get("chanceId", ""),
                "chanceCode": self.data.get("chanceCode", ""),
                "chanceProjectName": self.data.get("chanceProjectName", ""),
                "chanceProjectSchedule": self.data.get("chanceProjectSchedule", ""),
                "groupAttentionStage": self.data.get("groupAttentionStage", ""),
                "customerType": self.data.get("customerType", 1),
                "visitClientName": self.data.get("visitClientName", ""),
                "visitClientCode": self.data.get("visitClientCode", ""),
                "visitClientId": self.data.get("visitClientId", ""),
                "contractPersonCode": self.data.get("contractPersonCode", ""),
                "contractPersonName": self.data.get("contractPersonName", ""),
                "contractPersonDeptName": self.data.get("contractPersonDeptName", ""),
                "contractPersonPosition": self.data.get("contractPersonPosition", ""),
                "contractPersonDeptId": self.data.get("contractPersonDeptId", ""),
                "visitRecord": self.data.get("visitRecord", ""),
                "clientHope": self.data.get("clientHope", ""),
                "workHourProportion": self.data.get("workHourProportion", 0),
                "workHourProportionStatus": self.data.get("workHourProportionStatus", 0),
            })
        else:
            base.update({
                "date": self.data.get("date", ""),
                "chanceProjectName": self.data.get("chanceProjectName", ""),
                "workHourProportion": self.data.get("workHourProportion", 0.0),
                "chanceProjectSchedule": self.data.get("chanceProjectSchedule", ""),
                "projectCode": self.data.get("projectCode", ""),
                "projectManager": self.data.get("projectManager", ""),
                "workHourProportionStatus": self.data.get("workHourProportionStatus", 0),
            })

        return base

    def format_missing_message(self, missing_fields):
        """格式化缺失字段提示"""
        lines = ["请补充以下信息："]
        for i, (key, name) in enumerate(missing_fields, 1):
            display_name = FIELD_NAME_MAP.get(key, name)
            lines.append(f"{i}. {display_name}")
        return "\n".join(lines)

    def format_preview(self):
        """格式化预览输出"""
        prepared = self.prepare_for_submit()
        lines = ["=" * 50, "日报预览：", "=" * 50]
        lines.append(f"日期：{prepared.get('date', '')}")
        lines.append(f"日报类型：{'商机日报' if self.is_chance_report else '项目日报'}")

        if self.is_chance_report:
            lines.append(f"客户：{prepared.get('visitClientName', '')}")
            lines.append(f"客户编码：{prepared.get('visitClientCode', '')}")
            lines.append(f"客户类型：{'客户' if prepared.get('customerType') == 1 else '合作伙伴'}")
            lines.append(f"对接人：{prepared.get('contractPersonName', '')}")
            lines.append(f"拜访记录：{prepared.get('visitRecord', '')}")
        else:
            lines.append(f"项目：{prepared.get('chanceProjectName', '')}")
            lines.append(f"编号：{prepared.get('projectCode', '')}")
            lines.append(f"经理：{prepared.get('projectManager', '')}")
            lines.append(f"阶段：{prepared.get('chanceProjectSchedule', '')}")

        lines.append(f"工时：{prepared.get('workHourProportion', 0)}")
        lines.append(f"今日总结：{prepared.get('daySummarizeNow', '')}")
        lines.append(f"明日计划：{prepared.get('dayPlanNext', '')}")
        lines.append("=" * 50)
        return "\n".join(lines)


class SelectionFormatter:
    """查询结果格式化工具"""

    @staticmethod
    def format_projects(records, total=0):
        """格式化项目列表"""
        if not records:
            return "未找到匹配项目，该用户无项目可填写日报，请核实数据"

        lines = [f"共找到 {total} 个项目，请确认要填写的项目：\n"]
        for i, p in enumerate(records, 1):
            lines.append(
                f"{i}. {p.get('projectName', '')}"
                f"（编号: {p.get('projectCode', '')}"
                f"，经理: {p.get('projectManager', '')}"
                f"，阶段: {p.get('projectStageNewName', '')}）"
            )
        if total > len(records):
            lines.append(f"\n（显示前 {len(records)} 条，共有 {total} 条，可输入更精确的关键词缩小范围）")
        return "\n".join(lines)

    @staticmethod
    def format_chances(records, total=0):
        """格式化商机列表"""
        if not records:
            return "未找到匹配商机"

        lines = [f"共找到 {total} 个商机，请确认要填写的商机：\n"]
        for i, c in enumerate(records, 1):
            lines.append(
                f"{i}. {c.get('chanceName', '')}"
                f"（编码: {c.get('chanceCode', '')}"
                f"，客户: {c.get('customerName', '')}"
                f"，阶段: {c.get('chanceStageName', '')}）"
            )
        if total > len(records):
            lines.append(f"\n（显示前 {len(records)} 条，共有 {total} 条，可输入更精确的关键词缩小范围）")
        return "\n".join(lines)

    @staticmethod
    def format_clients(records, total=0):
        """格式化客户列表"""
        if not records:
            return "未找到匹配客户"

        lines = [f"共找到 {total} 个客户，请确认拜访的客户：\n"]
        for i, c in enumerate(records, 1):
            customer_type = c.get("customerType", "")
            type_name = "客户" if customer_type == 1 else "合作伙伴"
            lines.append(f"{i}. {c.get('customerName', '')}（编码: {c.get('customerCode', '')}，类型: {type_name}）")
        if total > len(records):
            lines.append(f"\n（显示前 {len(records)} 条，共有 {total} 条，可输入更精确的关键词缩小范围）")
        return "\n".join(lines)

    @staticmethod
    def format_contacts(records, total=0):
        """格式化对接人列表"""
        if not records:
            return "未找到匹配对接人"

        lines = [f"共找到 {total} 个对接人，请确认对接人：\n"]
        for i, c in enumerate(records, 1):
            lines.append(
                f"{i}. {c.get('contactsName', '')}"
                f"（部门: {c.get('depart', '')}"
                f"，职务: {c.get('business', '')}"
                f"，客户: {c.get('customerName', '')}）"
            )
        if total > len(records):
            lines.append(f"\n（显示前 {len(records)} 条，共有 {total} 条，可输入更精确的关键词缩小范围）")
        return "\n".join(lines)


class SelectionParser:
    """从查询结果中提取选中项"""

    @staticmethod
    def get_project_info(records, index):
        """获取项目信息"""
        if index < 1 or index > len(records):
            return None
        p = records[index - 1]
        return {
            "projectName": p.get("projectName", ""),
            "projectCode": p.get("projectCode", ""),
            "projectManager": p.get("projectManager", ""),
            "projectStage": p.get("projectStageNewName", ""),
        }

    @staticmethod
    def get_client_info(records, index):
        """获取客户信息"""
        if index < 1 or index > len(records):
            return None
        c = records[index - 1]
        return {
            "visitClientName": c.get("customerName", ""),
            "visitClientCode": c.get("customerCode", ""),
            "visitClientId": c.get("customerId", ""),
            "customerType": c.get("customerType", 1),
        }

    @staticmethod
    def get_chance_info(records, index):
        """获取商机信息"""
        if index < 1 or index > len(records):
            return None
        c = records[index - 1]
        return {
            "chanceId": c.get("id", ""),
            "chanceCode": c.get("chanceCode", ""),
            "chanceProjectName": c.get("chanceName", ""),
            "chanceProjectSchedule": c.get("chanceStageName", ""),
            "groupAttentionStage": c.get("groupAttentionStage", ""),
        }
