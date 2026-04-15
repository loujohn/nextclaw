# v0.15.14 workspace text only editable label

## 迭代完成说明

- 工作空间模块移除了 image 编辑相关代码，只保留文本文件编辑保存能力。
- `editableMode` 收敛为 `none | text`，删除图片替换接口、前端按钮与服务端替换逻辑。
- 文件详情头部的可编辑标签统一为“可编辑”，不再显示“memory 可编辑”。

## 测试/验证/验收方式

- 执行：`tests/employee-workspace-file-service.test.ts`，确认工作空间文本编辑权限与上传文件只读约束仍然成立。
- 执行：VS Code 问题检查，确认 `EmployeeWorkspacePanel.vue`、工作空间服务、共享类型与测试文件无新增错误。
- 未执行全量 `build/lint/tsc`：本次为局部 UI + 服务收敛改动，采用定向测试与问题检查作为最小充分验证。

## 发布/部署方式

- 本次仅涉及 `packages/nextclaw-digital-employee` 的工作空间模块代码，无 migration、无额外发布脚本调整。
- 按现有数字员工平台常规前后端部署流程发布即可。

## 用户/产品视角的验收步骤

1. 进入“配置”页的“工作空间模块”，选择任意文本文件，确认仍可切换到编辑模式并保存。
2. 选择图片文件，确认仅可预览与下载，不再出现图片替换或上传相关按钮。
3. 观察文件标题区域，确认可编辑文件标签显示为“可编辑”，不再出现“memory 可编辑”。