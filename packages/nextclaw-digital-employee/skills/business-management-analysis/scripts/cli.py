"""经营管理分析技能 - 命令行交互模块

处理 list/call/all 命令。
"""
import json
import os
import glob
import sys
from datetime import datetime

from api import get_token
from mcporter import run_mcporter
from config import Config


def clean_previous_output():
    """清理上次产生的临时文件"""
    temp_dir = Config.get_temp_dir()
    if not temp_dir or not os.path.exists(temp_dir):
        return
    pattern = os.path.join(temp_dir, f"{Config.SKILL_NAME}_*.json")
    for f in glob.glob(pattern):
        try:
            os.remove(f)
        except Exception:
            pass


def save_result(data, tool_name):
    """保存结果到临时文件（带时间戳）"""
    temp_dir = Config.get_temp_dir()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{tool_name}_{timestamp}.json"
    output_path = os.path.join(temp_dir, f"{Config.SKILL_NAME}_{filename}")
    json_str = json.dumps(data, ensure_ascii=False, indent=2)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(json_str)
    print(f"[数据已保存到文件: {output_path}]")
    return output_path


def handle_list():
    """列出可用工具"""
    result = run_mcporter("list")
    if result.returncode != 0:
        print(f"错误: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    print(result.stdout)


def handle_call(tool_name, args=None):
    """调用单个工具"""
    token = get_token()
    params = f"token={token}"
    if args:
        params = f"{' '.join(args)} {params}"

    result = run_mcporter(f"call {tool_name} {params}")
    if result.returncode != 0:
        print(f"调用失败: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    try:
        output = json.loads(result.stdout)
        save_result(output, tool_name)
    except:
        print(result.stdout)


def handle_all():
    """获取所有经营数据"""
    token = get_token()
    tools = [
        ("stageCount", f"token={token}"),
        ("forewarn", f"token={token}"),
        ("allCollect", f"timeFlag=4 token={token}"),
        ("payCondition", f"timeFlag=4 token={token}"),
        ("chanceStatistics", f"timeFlag=1 token={token}"),
        ("selfBuildYear", f"timeFlag=1 token={token}"),
    ]

    results = {}
    for tool_name, args in tools:
        result = run_mcporter(f"call {tool_name} {args}")
        if result.returncode == 0:
            try:
                results[tool_name] = json.loads(result.stdout)
            except:
                results[tool_name] = result.stdout
        else:
            results[tool_name] = {"error": result.stderr}

    save_result(results, "all")

