# v0.14.28 chat architecture governance implementation

## 迭代完成说明

本次迭代按聊天治理设计文档，对 `packages/nextclaw-digital-employee` 的聊天模块完成第一轮落地改造，主要包括：

1. 新增 `chat_sessions / chat_messages` 持久化模型、索引、仓储与迁移脚本。
2. 为聊天 run 补充显式 `session_key` 关联，并新增 `aborted` 状态。
3. 新增员工维度的会话列表、创建会话、按 `sessionKey` 分页读取消息、按 `runId` 取消聊天等接口。
4. 将员工聊天发送接口改为 SSE 流式返回，支持 `run_started / thinking / tool_call / tool_result / reply_delta / reply_final / run_failed / run_aborted / done` 事件。
5. 聊天页改造为多会话侧边栏 + 会话切换 + 流式渲染 + 服务端取消。
6. 新增聊天持久化/流式取消测试，修复消息分页游标重复问题。

## 测试/验证/验收方式

1. 执行 `pnpm -C packages/nextclaw-digital-employee tsc`，确认类型检查通过。
2. 执行 `pnpm -C packages/nextclaw-digital-employee test -- employee-chat-service employee-run-service database-and-skill-gateway chat-optimistic-rollback`，确认聊天相关测试通过。
3. 执行 `pnpm -C packages/nextclaw-digital-employee lint`，当前结果仍会被仓库中既有的 `max-lines-per-function` warnings 阻断；本轮未新增新的 lint warning。

## 发布/部署方式

1. 若本地/测试环境数据库尚未包含聊天表结构，先运行项目既有迁移流程（如应用启动时自动迁移，或按项目数据库迁移命令执行）。
2. 启动 `nextclaw-digital-employee` 服务后，打开员工聊天页验证会话与流式链路。
3. 若需要正式发布，按项目既有发布流程发布 `nextclaw-digital-employee` 所在应用。

## 用户/产品视角的验收步骤

1. 进入任意数字员工的聊天页，确认左侧可看到会话列表，并可点击“新建”创建新会话。
2. 在不同会话间切换，确认每个会话都能读取自己的历史消息，且不会再落到固定唯一会话。
3. 发送一条需要长时间处理或会触发工具调用的消息，确认页面会持续收到流式回复，并可看到工具调用/结果过程。
4. 在执行中点击“取消”，确认页面收到取消状态，服务端 run 状态变为已取消。
5. 刷新页面或重启服务后再次进入同一会话，确认新产生的聊天记录仍能从数据库中读出。
