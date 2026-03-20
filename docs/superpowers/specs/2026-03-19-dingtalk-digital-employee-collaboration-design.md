# DingTalk Digital Employee Collaboration Design

## 1. 背景与目标

当前 `nextclaw` 的多 Agent、会话隔离、Agent 间协作能力已经在 `@nextclaw/core` 中具备，但数字员工产品线要在钉钉内真正可用，还缺一层稳定的钉钉入口能力。现有内置钉钉插件仅覆盖基础收发，无法满足以下目标：

- 数字员工接入钉钉私聊；
- 数字员工进入钉钉群聊并通过 `@` 被唤起；
- 一个系统接入多个钉钉机器人；
- 员工在对外单入口回复的前提下，内部继续复用 NextClaw 的多 Agent 协作；
- 数字员工平台可以运营“钉钉连接 -> 员工 -> 群 -> 协作关系”，而不是依赖手写底层配置。

本设计的目标是，在不改动 `@nextclaw/core` 多 Agent 基础模型的前提下，用一个更完整的钉钉插件替换现有薄实现，使数字员工能够在钉钉私聊、群聊、后续多员工协作场景中稳定运行。

## 2. 设计原则

- 渠道能力归渠道层：钉钉 SDK、群聊/私聊识别、消息格式、账号池管理都沉淀在钉钉插件，不写进数字员工业务层。
- 员工仍是平台业务对象：平台继续维护 `employee`、技能绑定、群绑定、调度和集成配置。
- 运行时仍是 Agent：员工执行时继续映射为 `agentId=employee.code`。
- 单入口对外，协作对内：群里默认只有入口员工对外回复，后台再调度其它员工协作，避免多个员工同时抢答。
- 先替换、再增强：先把钉钉入口能力替换为可扩展实现，再逐阶段开放群聊、多机器人、协作运营配置。

## 3. 总体架构

```text
packages/nextclaw-digital-employee
  employee / integrations / group-binding / collaboration
            |
            v
  NextclawEngineGateway
            |
            v
  @nextclaw/core + @nextclaw/runtime + @nextclaw/openclaw-compat
            |
            v
  Forked DingTalk OpenClaw Plugin (repo-local)
```

设计边界如下：

- 保留 `@nextclaw/core`、`@nextclaw/runtime`、`@nextclaw/openclaw-compat` 现有多 Agent 与会话模型。
- 用仓库内 fork 的钉钉插件替换当前内置 `@nextclaw/channel-plugin-dingtalk`。
- 保留 `dingtalk` 作为 channel id，不额外引入第二套钉钉 channel id。
- 数字员工平台不直接依赖钉钉 SDK，只通过 gateway 与 core/runtime 打交道。

## 4. 为什么选择 fork 外部插件而不是继续补当前内置插件

`soimy/openclaw-channel-dingtalk` 已经具备本项目最需要的能力方向：

- 私聊支持；
- 群聊支持；
- 更完整的钉钉消息类型；
- 多机器人/多账号配置模型；
- 针对 OpenClaw 的插件结构已经稳定。

相比之下，当前仓库内置钉钉插件能力过薄，且缺少：

- 群会话建模；
- `@` 唤起规则；
- 多机器人账户池；
- 与群/会话维度绑定的路由元数据。

因此更合理的路线不是在当前内置钉钉实现上继续堆补丁，而是 fork 外部成熟插件到仓库内，收编为本项目的钉钉增强渠道实现。

## 5. 替换策略

### 5.1 替换目标

替换当前 bundled `@nextclaw/channel-plugin-dingtalk` 的实际实现来源，但继续保留：

- channel id: `dingtalk`
- 与 `core` 的交互边界
- 与 `openclaw-compat` 的插件加载模型

### 5.2 不做并存

由于当前仓库内置钉钉插件与外部插件都会注册 `dingtalk` channel id，直接并存会冲突。必须采用“替换”而非“并存安装”策略：

- 从 bundled channel plugin 列表中移除当前钉钉实现；
- 接入新的 repo-local fork 版本；
- 保持对外仍然只有一个 `dingtalk` 渠道。

### 5.3 推荐落地形态

建议在仓库中新增独立插件包，例如：

`packages/extensions/nextclaw-channel-plugin-dingtalk-pro`

或直接替换现有：

`packages/extensions/nextclaw-channel-plugin-dingtalk`

如果追求迁移最平滑，推荐直接替换现有包内容，而不是新造第二个包名后再做二次路由。

## 6. 钉钉插件配置模型

新的钉钉插件配置应从“单机器人配置”升级为“多机器人账户池”：

```json
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "defaultAccountId": "pm-assistant",
      "accounts": {
        "pm-assistant": {
          "enabled": true,
          "name": "项目管理助手",
          "clientId": "...",
          "clientSecret": "...",
          "robotCode": "...",
          "corpId": "...",
          "agentId": "...",
          "dmPolicy": "open",
          "groupPolicy": "open",
          "allowFrom": [],
          "groups": {
            "*": {
              "systemPrompt": ""
            }
          }
        }
      }
    }
  }
}
```

### 6.1 配置语义

- `accounts.<accountId>`：一个钉钉机器人/应用配置。
- `defaultAccountId`：默认出站所用机器人。
- `dmPolicy`：私聊准入策略。
- `groupPolicy`：群聊准入策略。
- `allowFrom`：允许的用户白名单。
- `groups`：按群维度配置额外规则，至少保留扩展位。

### 6.2 与 core 路由模型的关系

新的钉钉插件必须把 `accountId` 注入 inbound/outbound metadata，以便复用现有：

- `bindings: channel + accountId + peer -> agentId`
- `session.dmScope`
- `sessions_send`

这意味着钉钉插件只负责“产出正确元数据”，而不是自己发明一套员工路由系统。

## 7. 入站消息模型

钉钉入站消息需要保留足够的上下文，以支撑：

- 私聊稳定会话；
- 群聊稳定会话；
- `@机器人` 唤起；
- 群内分流到不同员工；
- 后续 agent-to-agent handoff。

建议统一产出如下 metadata：

- `accountId`
- `account_id`
- `conversation_id`
- `chat_id`
- `sender_name`
- `is_group`
- `peer_kind`
- `peer_id`
- `was_mentioned`
- `require_mention`
- `message_id`
- `reply_to`

### 7.1 私聊

- `chatId` 使用稳定私聊会话标识；
- `peer_kind=direct`
- `peer_id=senderId`

### 7.2 群聊

- `chatId` 必须使用群 `conversationId`，不能退化成 `senderId`
- `peer_kind=group`
- `peer_id=conversationId`
- 只在命中 `@机器人`、mention rule 或群策略允许时入模

## 8. 出站消息模型

插件需要同时支持：

- 私聊回复；
- 群聊回复；
- 主动通知到钉钉群；
- 单入口员工最终回群回复。

出站必须能够根据：

- `chatId`
- `accountId`
- `payload`
- `replyTo`

来决定使用哪个机器人、向哪个钉钉目标发送、是否需要引用/卡片/markdown 输出。

## 9. 数字员工与钉钉入口的映射

平台层维持如下映射：

- `employee`：业务对象
- `agentId=employee.code`：运行时身份
- `dingtalk account`：渠道入口
- `group binding`：群到员工或群到入口规则

### 9.1 推荐默认策略

- 私聊：一个机器人默认进入一个员工，或按绑定表映射到默认员工。
- 群聊：默认只有一个入口员工对外回复。
- 多员工协作：只允许内部 handoff，不允许多个员工同时直接在群里抢答。

## 10. 消息流设计

### 10.1 私聊流

1. 用户私聊机器人；
2. 钉钉插件识别 `accountId + senderId`；
3. 经 `bindings` 路由到目标员工对应的 `agentId`；
4. 进入该员工 session；
5. 由该员工直接回复用户。

### 10.2 群聊流

1. 群内 `@机器人` 或命中 mention rule；
2. 钉钉插件保留真实 `conversationId` 并标记 `is_group=true`；
3. `bindings(channel + accountId + peer)` 决定入口员工；
4. 入口员工处理请求；
5. 如有需要，入口员工后台调用其它员工协作；
6. 由入口员工统一回群。

### 10.3 员工协作流

1. 入口员工收到复杂任务；
2. 调用 `spawn` 或 `sessions_send`；
3. 被调用员工在独立 session 执行；
4. 完成结果回流给入口员工；
5. 最终由入口员工对外回复。

## 11. 数字员工平台需要新增的运营配置

### 11.1 钉钉连接管理

新增/升级 integrations，使平台可管理多机器人连接：

- `accountId`
- 展示名
- `clientId/clientSecret`
- `robotCode`
- `corpId/agentId`
- 启用状态

### 11.2 员工入口绑定

每个员工可配置：

- 默认钉钉入口 account
- 私聊是否启用
- 可服务的群
- 群内别名或 mention pattern

### 11.3 群级路由规则

平台应允许配置：

- 某群默认绑定哪个员工
- 某群允许哪些员工被点名
- 某群是否允许后台协作

### 11.4 协作关系

平台应允许配置：

- 员工可委托给哪些员工
- 最大协作深度
- 是否只允许后台协作不直接对外回复

## 12. 实施顺序

### 阶段一：替换钉钉插件并打通私聊

- fork 外部插件到仓库内；
- 替换当前内置 `dingtalk` 插件实现；
- 完成单机器人、单员工、私聊收发闭环；
- 验证数字员工可以通过钉钉私聊工作。

### 阶段二：补群聊与 `@` 规则

- 接入真实群会话模型；
- 接入 `groupPolicy/groups/mentionPatterns`；
- 完成钉钉群 `@机器人` 回复闭环；
- 验证群上下文稳定。

### 阶段三：补多机器人与员工绑定

- 引入 `accounts.<accountId>`；
- 与 `bindings` 打通；
- 平台新增钉钉连接与员工绑定配置；
- 完成“一个员工一个机器人”与“一个机器人多个员工”两种模式。

### 阶段四：补员工协作

- 入口员工复用 `sessions_send/spawn` 做后台协作；
- 平台新增协作白名单和深度限制；
- 打通群内单入口回复、内部多员工协作闭环。

## 13. MVP 定义

第一阶段可用版本定义为：

- 一个数字员工可绑定一个钉钉机器人；
- 支持私聊；
- 支持群聊 `@机器人`；
- 支持群到员工绑定；
- 群里只有入口员工对外回复；
- 协作先只支持后台委托，不做复杂可视化编排。

## 14. 风险与应对

### 14.1 外部插件与本仓库兼容风险

- 风险：外部插件依赖 OpenClaw 运行时约定，接入 NextClaw 兼容层时可能存在边界差异。
- 应对：先做最小私聊闭环与本地 smoke test，再逐步启用群聊、多机器人与卡片能力。

### 14.2 钉钉群消息语义复杂

- 风险：群聊 `@`、引用回复、卡片消息、文件卡片的语义比私聊复杂。
- 应对：先只要求文本与 `@` 唤起稳定；复杂富消息类型后置。

### 14.3 多员工协作带来的回复竞争

- 风险：多个员工直接对外回复会造成群内混乱。
- 应对：默认只允许入口员工对外回复，其它员工只做后台协作。

## 15. 验收标准

### 15.1 私聊

- 用户可通过钉钉私聊某机器人；
- 消息稳定进入指定员工 session；
- 回复可正常回到钉钉；
- 连续多轮对话 session 稳定。

### 15.2 群聊

- 在钉钉群内 `@机器人` 能触发回复；
- 群会话按群维度保持连续上下文；
- 未 `@` 或未命中群策略时不误触发。

### 15.3 多机器人

- 至少支持两个 `accountId`；
- 可分别绑定到不同员工；
- 路由可按 `channel + accountId + peer` 生效。

### 15.4 协作

- 入口员工可后台调用另一个员工；
- 最终仅入口员工对外回复；
- 可配置协作深度上限并正确阻断超限往返。
