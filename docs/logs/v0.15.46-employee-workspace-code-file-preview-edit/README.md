# v0.15.46 employee-workspace-code-file-preview-edit

## 迭代完成说明

- 数字员工工作空间现在会把常见代码文件识别为文本，可直接预览和编辑，包括 `.py`、`.js`、`.ts`、`.json`、`.yaml`、`.sh`、`.vue` 等。
- 工作空间树不再一刀切隐藏所有点目录，已定向放开 `.nextclaw-digital-employee`，使员工自己的内部脚本目录可以在 UI 中看到。
- 保持上传文件白名单不变，未因为代码文件预览能力而额外放开 `.py` 等上传类型。
- 补充了工作空间文件服务与附件预览类型的自动化测试，覆盖隐藏目录展示、代码文件读取/保存与上传白名单约束。

## 测试/验证/验收方式

- 运行：`pnpm -C packages/nextclaw-digital-employee exec vitest run tests/chat-attachments.test.ts tests/employee-workspace-file-service.test.ts`
- 验收点：
  - `.nextclaw-digital-employee/.../*.py` 会出现在员工工作空间树中。
  - 选中 `.py` 文件后可看到“预览 / 编辑 / 保存文本”。
  - 上传目录下的 office 文件仍只读，不会被误判为可编辑文本。
  - `.py` 不会被加入聊天上传白名单。

## 发布/部署方式

- 本次仅涉及数字员工前后端代码与测试，无数据库变更。
- 按常规应用发布流程部署 `packages/nextclaw-digital-employee` 对应服务即可。
- 远程 migration：不适用，本次未触达数据库 Schema。

## 用户/产品视角的验收步骤

1. 打开任意数字员工详情页的工作空间面板。
2. 展开 `.nextclaw-digital-employee` 目录并进入脚本文件所在目录。
3. 点击一个 `.py` 文件，确认右侧能看到文本内容预览。
4. 切换到编辑模式，修改一行内容后保存。
5. 重新打开该文件，确认修改已持久化且上传文件目录下的非文本附件仍保持只读。