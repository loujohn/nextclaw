#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

import argparse
from datetime import datetime
from chinese_calendar import is_workday, is_holiday, get_holiday_detail


def main():
    parser = argparse.ArgumentParser(description="判断今日是否是工作日")
    parser.add_argument("--date", dest="date", help="指定日期 (YYYY-MM-DD)，默认今日")
    parser.add_argument("--verbose", action="store_true", help="显示详细信息")

    args = parser.parse_args()

    if args.date:
        try:
            target_date = datetime.strptime(args.date, "%Y-%m-%d").date()
        except ValueError:
            print(f"错误: 日期格式应为 YYYY-MM-DD，例如: 2026-03-31", file=sys.stderr)
            sys.exit(1)
    else:
        target_date = datetime.now().date()

    date_str = target_date.strftime("%Y-%m-%d")
    weekday = target_date.strftime("%A")

    cn_weekday = {
        "Monday": "星期一",
        "Tuesday": "星期二",
        "Wednesday": "星期三",
        "Thursday": "星期四",
        "Friday": "星期五",
        "Saturday": "星期六",
        "Sunday": "星期日",
    }

    is_work = is_workday(target_date)
    is_hol = is_holiday(target_date)

    print(f"日期: {date_str} ({cn_weekday.get(weekday, weekday)})")

    if is_work:
        print(f"结果: 是工作日 ✓")
    else:
        print(f"结果: 是节假日/休息日")

    if args.verbose:
        print(f"is_workday: {is_work}")
        print(f"is_holiday: {is_hol}")

    sys.exit(0 if is_work else 1)


if __name__ == "__main__":
    main()
