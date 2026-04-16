---
name: is-workday
name_zh: 工作日检查
version: 1.0.0
description: "判断今日是否是工作日，支持中国法定节假日判断。使用 chinese-calendar 库。"
metadata:
  nextclaw:
    emoji: "📅"
    category: "tools"
---

# 工作日检查技能

判断指定日期是否是工作日，支持中国法定节假日和调休上班日判断。

## 脚本位置

```
<本技能目录>/scripts/is-workday.py
```

## 使用方法

```bash
# 判断今日是否是工作日
python scripts/is-workday.py

# 判断指定日期
python scripts/is-workday.py --date 2026-04-05

# 显示详细信息
python scripts/is-workday.py --verbose
```

## 返回值

- 退出码 `0`: 是工作日
- 退出码 `1`: 是节假日或休息日

## 示例输出

```
日期: 2026-03-31 (星期二)
结果: 是工作日 ✓
```

```
日期: 2026-04-04 (星期六)
结果: 是周末（休息日）
```

```
日期: 2026-04-04 (星期六)
结果: 是节假日 - 清明节
```
