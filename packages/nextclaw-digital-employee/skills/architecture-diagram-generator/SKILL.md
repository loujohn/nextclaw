---
name: architecture-diagram-generator
name_zh: 政务架构图生成器
description: "生成专业政务分层架构图（HTML/CSS），支持四横四纵两端、通用分层等布局。当用户需要绘制架构图、系统架构可视化、生成方案架构图时触发。可与'数字重庆建设专家'联动获取架构规范。"
metadata:
  nextclaw:
    emoji: "🏗️"
    category: "solutions"
---

# 架构图生成器

使用 HTML/CSS 技术生成专业的分层架构图，完美支持数字重庆风格的蓝色主题"四横四纵两端"架构图。

## 核心功能

1. **四横四纵两端架构图** - 精确复刻数字重庆官方视觉风格的复杂分层架构图
2. **通用分层架构图** - 支持简单的多层架构图
3. **完全可编辑** - 生成的 HTML 可直接在浏览器中打开编辑和截图
4. **精确布局** - 白底蓝色主题、紧凑表格式布局、右侧四纵竖条

## 架构图类型

### 1. 四横四纵两端架构图（推荐）

使用 `generate_siheng_sizong.js` 脚本，支持以下层类型：

| 层类型(type) | 说明 | 关键字段 |
|-------------|------|---------|
| `duan` | 两端层（渝快政/渝快办） | `modules[].position: left/right` |
| `app` | 业务应用体系（最复杂） | `scene_labels`, `groups[].columns[].items`, `bottom_labels` |
| `support` | 业务支撑层 | `module_groups[].items`, `full_width_bars[]` |
| `data` | 数据资源层 | `drs`, `trusted_space`, `data_warehouse`, `business_dbs`, `topic_dbs` |
| `infra` | 基础设施层 | `main_title`, `items[]` |

### 2. 通用架构图

使用 `generate_architecture.js` 脚本，支持简单的层/模块/子模块结构。

## JSON 数据结构规范（四横四纵两端）

```json
{
  "title": "AI+城市规建运治一体化综合场景驾驶舱",
  "theme": "digital_chongqing",
  "layers": [
    {
      "name": "两端",
      "type": "duan",
      "modules": [
        { "name": "渝快政", "position": "left" },
        { "name": "渝快办", "position": "right" }
      ]
    },
    {
      "name": "业务\n应用\n体系",
      "type": "app",
      "scene_labels": ["场景标签1", "场景标签2"],
      "groups": [
        {
          "name": "分组名称",
          "columns": [
            {
              "name": "列标题",
              "items": ["子项1", "子项2"]
            }
          ],
          "bottom_labels": ["底部标签1"]
        }
      ]
    },
    {
      "name": "业务\n支撑\n层",
      "type": "support",
      "module_groups": [
        {
          "name": "分组名称",
          "items": ["能力1", "能力2"]
        }
      ],
      "full_width_bars": ["全宽条标题1", "全宽条标题2"]
    },
    {
      "name": "数据\n资源\n层",
      "type": "data",
      "drs": {
        "name": "公共数据资源管理系统（DRS）",
        "items": ["数仓1", "数仓2"]
      },
      "trusted_space": {
        "name": "可信数据空间",
        "items": ["管理项1", "管理项2"]
      },
      "data_warehouse": {
        "name": "住建数仓",
        "hq_title": "高质量数据集",
        "hq_items": ["数据集1", "数据集2"]
      },
      "business_dbs": ["业务库1", "业务库2"],
      "topic_dbs": ["专题库1", "专题库2"]
    },
    {
      "name": "基础设\n施层",
      "type": "infra",
      "main_title": "政务云（信创）",
      "items": ["互联网", "电子政务外网", "感知网"]
    }
  ],
  "connection_band": {
    "left": "各区县住房与城乡建设部门",
    "left_label": "纵向、横向贯通",
    "center": "三级数字化城市运行和治理中心",
    "right_label": "多跨协同、综合集成",
    "right": "市规自局、城管局等协同部门"
  },
  "vertical_systems": [
    { "name": "标准规范体系" },
    { "name": "制度规则体系" },
    { "name": "安全防护体系" },
    { "name": "工作推进体系" }
  ],
  "legend": [
    { "label": "新建", "type": "new" },
    { "label": "既有集成", "type": "existing" },
    { "label": "复用", "type": "reuse" }
  ]
}
```

## 使用方法

### 四横四纵两端架构图

```bash
node scripts/generate_siheng_sizong.js --input examples/siheng_sizong_2duan.json --output output
```

### 通用架构图

```bash
node scripts/generate_architecture.js --input examples/digital_chongqing.json --output output
```

### 查看和导出

- 在浏览器中打开生成的 HTML 文件
- 使用浏览器截图功能导出 PNG
- 使用浏览器打印功能导出 PDF

## 布局特征（对标参考图）

1. **白底蓝色主题** - 无PPT渐变头部，简洁专业
2. **两端横条** - 渝快政/渝快办作为简单标题栏
3. **场景驾驶舱** - 跨行显示标题 + 场景标签条
4. **应用层多列布局** - 每个分组内多个竖列子模块
5. **中间连接带** - 纵向横向贯通 → 三级数字化中心 ← 多跨协同
6. **支撑层三分组** + 全宽蓝色底部条（IRS+AI底座、物联感知系统）
7. **数据层圆柱体图标** - CSS实现的数据库圆柱体图标
8. **右侧四纵竖条** - 窄蓝色竖条，文字竖排
9. **右下角图例** - 新建/既有集成/复用标注

## 主题配色

### digital_chongqing（数字重庆蓝）
- 主色调：#1a5694（深蓝）
- 辅助色：#2874a6（中蓝）
- 强调色：#3498db（亮蓝）
- 浅蓝：#85c1e9
- 背景：#ffffff（纯白）
- 文字：#2c3e50
- 边框：#1a5694

## 示例文件

- `examples/siheng_sizong_2duan.json` - **四横四纵两端架构图**（完整示例）
- `examples/digital_chongqing.json` - 数字重庆通用架构
- `examples/fire_intelligence_agent.json` - 消防智能体架构

## 技术栈

- **HTML5** - 页面结构
- **CSS3** - 样式和布局（Flexbox + Grid）
- **JavaScript (Node.js)** - 动态渲染生成
