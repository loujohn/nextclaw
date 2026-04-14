# 设计文档：数字员工聊天模块新增对话文件上传能力

## 1. 背景与目标

当前 `nextclaw-digital-employee` 已具备：

1. 数字员工实时聊天与 SSE 流式回复。
2. 会话列表、消息持久化、历史消息分页回放。
3. 员工工作空间核心文件（`AGENTS.md`、`TOOLS.md` 等）的浏览与部分编辑。

但系统尚未提供“对话文件上传”能力，导致以下问题：

1. 用户无法在聊天时附带业务文档让智能体一并理解。
2. 上传文件无法与会话、消息、发送文本建立稳定关联。
3. 工作空间无法统一查看历史上传文件及其来源上下文。
4. 聊天页、历史记录页、工作空间页之间缺少统一的附件模型与跳转链路。

本次设计目标是在**不新增独立文件主表**的前提下，为数字员工聊天模块补齐文件上传、会话关联、工作空间展示与来源追溯能力，并保持首期实现成本可控。

## 2. 范围与边界

### 2.1 In Scope

1. 聊天输入区支持多文件上传、展示、删除（仅发送前）。
2. 发送对话时同时提交用户文字和文件路径上下文给智能体。
3. 上传文件物理落盘到员工工作空间：
   - `.nextclaw-digital-employee/agents/<employeeCode>/uploadFile/YYYY-MM-DD/<uniquePrefix>_<originalName>`
4. 用户消息持久化时记录附件快照元数据。
5. 实时聊天页、历史记录页展示消息附件列表。
6. 工作空间新增“上传文件”模块，按年月日树状展示所有上传文件。
7. 点击聊天/历史中的附件可跳转到工作空间并默认选中目标文件。
8. 工作空间的“核心文件”和“上传文件”以可展开/收起 tab/section 形式展示。

### 2.2 Out of Scope

1. 发送后删除已关联附件。
2. 图片 OCR。
3. 上传文件在线编辑。
4. 独立文件主表、去重表、全文检索索引表。
5. 对 Office/PDF 的完整高保真在线预览引擎。

### 2.3 已确认的产品决策

1. **文件范围**：首期“文档优先”。
   - 支持上传：`txt`、`md`、`pdf`、`docx`、`xlsx`、`pptx`
   - 图片可上传、可展示，但不做接口层内容抽取
2. **删除语义**：
   - 发送前可删除
   - 发送后不允许从会话中删除
   - 工作空间保留附件与来源记录，仅提供查看/下载
3. **架构方向**：采用**方案 B**
   - 文件存工作空间
   - 会话消息仅保存附件路径与展示快照
   - 不建立独立“文件主表”

## 3. 现状分析

### 3.1 已有前端能力

| 模块 | 当前状态 | 设计影响 |
|---|---|---|
| `app/pages/employees/[id]/chat.vue` | 已支持输入、SSE 流式回复、会话切换、历史分页 | 适合扩展附件上传区与消息附件渲染 |
| `app/pages/employees/[id]/workspace.vue` | 当前只展示核心文件，支持预览/编辑 | 需要扩展为“核心文件 + 上传文件”双分组 |
| `shared/ui-models.ts` | `ChatMessageView` 尚无附件结构 | 需要扩展消息附件视图模型 |

### 3.2 已有后端能力

| 模块 | 当前状态 | 设计影响 |
|---|---|---|
| `server/api/employees/[id]/chat.post.ts` | 仅接收 `message` + `sessionKey` | 需要扩展请求体支持附件引用 |
| `server/services/employee-run-service.ts` | 已持久化会话与消息 | 适合在 user message metadata 中挂载附件快照 |
| `server/api/employees/[id]/workspace/index.get.ts` | 仅返回核心文件列表 | 需要扩展返回上传文件树 |
| `server/api/employees/[id]/workspace/[filename].get.ts` | 仅支持固定核心文件名 | 需要新增上传文件读取接口 |
| `server/engine/employee-workspace.ts` | 已能解析员工工作空间根目录 | 可直接扩展上传文件目录解析 |

补充判断：

1. 当前工作空间模块尚未具备“上传文件 -> 会话 / 消息”关联查询能力。
2. 当前历史消息链路也没有现成的附件关联模型。
3. 因此前端历史页与工作空间详情页都不能依赖“文件名推断”或“目录扫描后猜测来源”，必须设计成**精确按消息附件记录回查**。

## 4. 总体方案

### 4.1 核心原则

1. **物理文件是事实来源**：所有上传文件统一落在员工工作空间 `uploadFile/` 下。
2. **消息元数据是会话快照**：用户消息 metadata 保存附件展示快照，保证历史回放稳定。
3. **工作空间是统一浏览入口**：聊天页与历史页点击附件，都跳转到工作空间统一预览面板。
4. **首期不做独立文件主表**：优先降低改造成本，后续若性能或检索复杂度上升，再演进为索引表。

### 4.2 总体架构图

```text
Chat UI
  ├─ 选择文件 / 删除待发送文件
  ├─ POST /api/employees/:id/upload-files
  │    └─ EmployeeUploadFileService
  │         ├─ 路径分配 uploadFile/YYYY-MM-DD
  │         ├─ 文件名净化 / 同名冲突处理
  │         ├─ 文件校验 / 存储
  │         └─ 返回附件引用快照
  └─ POST /api/employees/:id/chat
       └─ EmployeeRunService.streamChatTurn
            ├─ 写 user message + attachments metadata
             ├─ 拼装 message + file path context
            ├─ 调用 agent runtime
            └─ 持久化 assistant/tool 消息

Workspace UI
  ├─ GET /api/employees/:id/workspace
  │    └─ 核心文件 + 上传文件树 + 来源信息
  └─ GET /api/employees/:id/workspace/uploaded?path=...
       └─ 文件内容/预览元数据/来源信息
```

## 5. 存储设计

### 5.1 工作空间目录结构

每个员工的上传文件落在：

```text
packages/nextclaw-digital-employee/.nextclaw-digital-employee/agents/<employeeCode>/uploadFile/YYYY-MM-DD/
```

示例：

```text
.nextclaw-digital-employee/agents/a/uploadFile/2026-04-14/up_01JABC_报价单.pdf
```

### 5.2 目录规则

1. `uploadFile` 为员工上传文件根目录。
2. 按上传当天日期自动创建 `YYYY-MM-DD` 子目录。
3. 文件名需要做净化：
   - 去除路径分隔符
   - 压缩非法字符
   - 保留扩展名
4. 文件落盘名采用“唯一前缀 + 下划线 + 原始文件名”：
   - `报价单.pdf` -> `up_01JABC_报价单.pdf`
   - `报价单.pdf` -> `up_01JABD_报价单.pdf`
5. 前端展示时始终使用 `originalName`，不展示带唯一前缀的 `storedName`。

## 6. 数据模型设计

### 6.1 前端视图模型

在 `shared/ui-models.ts` 新增：

```ts
export type ChatAttachmentPreviewType = "text" | "pdf" | "office" | "image" | "binary";

export type ChatAttachmentView = {
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  size: number;
  previewType: ChatAttachmentPreviewType;
  uploadDate: string;
  sourceText?: string;
  sourceSessionKey: string;
  sourceMessageId: string;
};
```

扩展 `ChatMessageView`：

```ts
attachments?: ChatAttachmentView[];
```

### 6.2 消息 metadata 结构

在 `chat_messages.metadata_json` 中新增 `attachments` 字段：

```json
{
  "runId": "run_20260414_001",
  "runStatus": "running",
  "attachments": [
    {
      "originalName": "报价单.pdf",
      "storedName": "up_01JABC_报价单.pdf",
      "relativePath": "uploadFile/2026-04-14/up_01JABC_报价单.pdf",
      "mimeType": "application/pdf",
      "size": 12345,
      "previewType": "pdf",
      "uploadDate": "2026-04-14",
      "sourceText": "请帮我分析这个报价单",
      "sourceSessionKey": "employee:123:chat:session-001",
      "sourceMessageId": "msg_user_001"
    }
  ]
}
```

### 6.3 为什么不新增文件主表

本次明确采用方案 B，因此不新增独立 `uploaded_files` 表。原因：

1. 当前需求主要围绕“会话发送 + 历史展示 + 工作空间查看”。
2. 文件事实已经存在于工作空间目录。
3. 附件来源可以由消息快照反查，不必在首期引入额外主数据同步逻辑。

### 6.4 方案 B 的代价

1. 工作空间“上传文件列表”需要：
   - 扫描 `uploadFile` 目录
   - 反查消息 metadata 获取来源信息
2. 若后续数据量显著上升，可二期补 `chat_message_attachments` 索引表，而不破坏本期接口。

## 7. 后端接口设计

### 7.1 上传接口

**新增**

`POST /api/employees/:id/upload-files`

`Content-Type: multipart/form-data`

#### 请求

- `files[]`: 多文件
- 可选 `sessionKey`: 当前会话 key（首期可不强依赖）

#### 返回

```ts
type UploadFilesPayload = {
  ok: true;
  data: {
    items: Array<{
      token: string;
      originalName: string;
      storedName: string;
      relativePath: string;
      mimeType: string;
      size: number;
      previewType: "text" | "pdf" | "office" | "image" | "binary";
      sourceSessionKey: string;
      sourceMessageId: string;
    }>;
  };
};
```

#### 设计说明

1. 上传接口只负责落盘、校验与返回附件引用快照。
2. 前端拿到 `items` 后仅保存在“待发送附件列表”中。
3. 用户点击删除时，只是从前端待发送列表移除；若需要避免孤儿文件，可在服务端加入过期清理策略，首期不阻塞。

### 7.2 聊天发送接口

**改造**

`POST /api/employees/:id/chat`

#### 新请求体

```ts
type ChatBody = {
  message?: string;
  sessionKey?: string;
  attachments?: Array<{
    token: string;
    originalName: string;
    storedName: string;
    relativePath: string;
    mimeType: string;
    size: number;
    previewType: "text" | "pdf" | "office" | "image" | "binary";
    sourceSessionKey: string;
    sourceMessageId: string;
  }>;
};
```

#### 服务端流程

1. 校验 `message` 非空。
2. 校验附件路径均位于当前员工工作空间 `uploadFile/` 根目录之下。
3. 生成增强上下文：
   - 原始用户文本
   - 附件名
   - 相对路径
   - 提示智能体到工作空间读取文件
4. 写入 user message，`metadata.attachments = [...]`，并把当前 `sessionKey`、`messageId` 一并写入每个附件记录。
5. 流式调用 `EmployeeRunService.streamChatTurn()`。
6. 正常返回 SSE 事件流。

### 7.3 工作空间列表接口

**改造**

`GET /api/employees/:id/workspace`

#### 返回结构

```ts
type WorkspacePayload = {
  ok: true;
  data: {
    coreFiles: WorkspaceCoreFile[];
    uploadedFilesTree: UploadWorkspaceTreeNode[];
  };
};
```

#### 上传文件树节点

```ts
type UploadWorkspaceTreeNode =
  | { kind: "year"; label: string; children: UploadWorkspaceTreeNode[] }
  | { kind: "month"; label: string; children: UploadWorkspaceTreeNode[] }
  | { kind: "day"; label: string; children: UploadWorkspaceTreeNode[] }
  | {
      kind: "file";
      label: string;
      relativePath: string;
      mimeType: string;
      size: number;
      previewType: "text" | "pdf" | "office" | "image" | "binary";
      sourceSessionKey: string;
      sourceMessageId: string;
      sourceText?: string;
    };
```

### 7.4 上传文件读取接口

**新增**

`GET /api/employees/:id/workspace/uploaded?path=uploadFile/2026-04-14/up_01JABC_报价单.pdf`

#### 返回结构

```ts
type UploadedWorkspaceFilePayload = {
  ok: true;
  data: {
    filename: string;
    relativePath: string;
    mimeType: string;
    size: number;
    previewType: "text" | "pdf" | "office" | "image" | "binary";
    content?: string;
    source?: {
      sessionKey?: string;
      messageId?: string;
      text?: string;
    };
  };
};
```

#### 说明

1. 文本类文件返回 `content`。
2. 二进制类首期可通过单独下载地址或流式响应提供预览。
3. 上传文件统一只读。

## 8. 服务层设计

### 8.1 新增服务

建议新增：

`server/services/employee-upload-file-service.ts`

### 8.2 核心职责

1. 根据员工 code 解析上传根目录。
2. 保存上传文件到日期目录。
3. 统一文件名净化与“唯一前缀 + 原始文件名”落盘规则。
4. 返回前端可直接使用的附件引用对象。

### 8.3 建议 API

```ts
type SavedUploadAttachment = {
  token: string;
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  size: number;
  previewType: "text" | "pdf" | "office" | "image" | "binary";
  sourceSessionKey?: string;
  sourceMessageId?: string;
};

class EmployeeUploadFileService {
  async saveUploadedFiles(params: {
    employeeId: string;
    files: UploadedFile[];
  }): Promise<SavedUploadAttachment[]>;

  async listUploadedFiles(params: {
    employeeId: string;
  }): Promise<UploadWorkspaceTreeNode[]>;

  async readUploadedFile(params: {
    employeeId: string;
    relativePath: string;
  }): Promise<UploadedWorkspaceFilePayload["data"]>;
}
```

### 8.4 路径辅助函数

在 `server/engine/employee-workspace.ts` 或单独 util 中新增：

```ts
resolveEmployeeUploadRoot(homeDir: string, employeeCode: string): string;
resolveEmployeeUploadDateDir(homeDir: string, employeeCode: string, date: Date): string;
```

## 9. 智能体读取策略

### 9.1 首期支持矩阵

| 类型 | 上传 | 预览 | 接口层抽取 | 备注 |
|---|---|---|---|---|
| txt | 是 | 是 | 否 | 智能体自行读取 |
| md | 是 | 是 | 否 | 智能体自行读取 |
| pdf | 是 | 有限 | 否 | 智能体自行读取 |
| docx | 是 | 有限 | 否 | 智能体自行读取 |
| xlsx | 是 | 有限 | 否 | 智能体自行读取 |
| pptx | 是 | 有限 | 否 | 智能体自行读取 |
| image | 是 | 是 | 否 | 不做 OCR |
| 其他二进制 | 可限制 | 否/下载 | 否 | 建议首期限制上传 |

### 9.2 发送给智能体的上下文设计

发送时组装：

```text
用户消息：
{message}

用户上传了 {n} 个文件：
1. 文件名：报价单.pdf
   路径：uploadFile/2026-04-14/up_01JABC_报价单.pdf
   请在工作空间中读取该文件并结合用户问题分析
```

要求：

1. 不在接口层读取、抽取、拼接文件内容。
2. 保留文件相对路径，便于智能体在工作空间中感知文件位置。
3. 明确提示智能体自行读取工作空间文件，而不是依赖接口返回文本。
4. 让智能体看到的是存储路径，前端看到的是原始文件名。

## 10. 前端页面设计

### 10.1 聊天页

#### 输入区新增结构

```text
[消息输入框]
[上传按钮] [待发送文件列表]
```

#### 行为

1. 可连续选择多个文件。
2. 上传成功后显示待发送列表，文件名展示 `originalName`。
3. 待发送文件支持逐个删除。
4. 点击“发送”时，文本与附件一起提交。
5. 发送成功后清空待发送列表。

#### 新增状态

```ts
type PendingUploadFile = {
  token: string;
  originalName: string;
  relativePath: string;
  mimeType: string;
  size: number;
  previewType: "text" | "pdf" | "office" | "image" | "binary";
};
```

### 10.2 聊天消息区

用户消息气泡下展示附件列表：

1. 文件图标
2. 文件名
3. 大小
4. 点击跳转工作空间预览

### 10.3 历史消息页

历史消息本质复用会话消息接口，因此：

1. `GET /sessions/[key]/messages` 返回 `attachments`
2. 与聊天页统一渲染组件
3. 点击附件同样跳转工作空间

### 10.4 工作空间页

#### 左侧结构

1. `核心文件`（可折叠）
2. `上传文件`（可折叠）

说明：

- 物理存储使用 `uploadFile/YYYY-MM-DD/`
- 前端展示时可把 `YYYY-MM-DD` 解析为年 / 月 / 日分组，保持“按年月日展示”的体验，但不要求磁盘目录为三层

#### 默认选中规则

1. 从工作空间 tab 正常进入：
   - 默认展开核心文件
   - 默认选中第一个存在的核心文件
2. 从聊天/历史附件点击进入：
   - 通过 query 传 `entry=chat-attachment&type=upload&path=...`
   - 默认展开上传文件
   - 默认选中对应文件

#### 样式一致性

无论从哪进入，右侧统一渲染：

1. 文件标题栏
2. 来源信息栏
3. 预览区
4. 下载按钮
5. 编辑按钮禁用态（上传文件）

## 11. 消息与工作空间的关联策略

### 11.1 会话 -> 文件

用户消息 `metadata.attachments[]` 直接记录该消息使用了哪些文件。

### 11.2 文件 -> 会话

工作空间加载上传文件树时：

1. 扫描 `uploadFile/` 目录获取物理文件。
2. 从 `chat_messages` 中筛选 `metadata.attachments`。
3. 只能按完整 `relativePath + sourceMessageId + sourceSessionKey` 精确回查，不能按原始文件名推断。
4. 建立映射：
   - `sourceSessionKey`
   - `sourceMessageId`
   - `sourceText`

### 11.3 为什么要保留 `sourceText`

用户明确要求工作空间显示“来源于哪个会话信息，即和文件一起发送的文字信息”，因此需要把发送时用户文本快照、`sourceSessionKey`、`sourceMessageId` 一起保存在附件 metadata 中，而不是运行时再从文件名或消息内容猜测。

## 12. 路由与跳转设计

### 12.1 从聊天/历史到工作空间

建议路由格式：

```text
/employees/:id/workspace?type=upload&path=uploadFile/2026-04-14/up_01JABC_报价单.pdf&sessionKey=employee:123:chat:session-001&messageId=msg_user_001
```

### 12.2 处理逻辑

`workspace.vue` 在初始化时：

1. 读取 `type`
2. 若为 `upload` 且 `path` 存在：
   - 默认选中上传文件
   - 默认展开上传文件分组
3. 否则：
   - 默认选中核心文件第一个可用文件

## 13. 安全与校验

### 13.1 文件上传校验

1. 限制可上传扩展名白名单。
2. 限制单文件大小与总大小。
3. 文件名必须净化，禁止路径穿越。
4. MIME 与扩展名不匹配时按更保守策略处理。

### 13.2 文件读取校验

1. `relativePath` 必须位于员工 `uploadFile/` 根目录下。
2. 禁止通过 `../` 访问任意路径。
3. 工作空间读取接口严格区分核心文件与上传文件。

### 13.3 历史一致性

发送后不允许删除会话附件，以保证：

1. 历史消息可稳定回放。
2. 工作空间来源映射不失效。

## 14. 兼容性与演进

### 14.1 对现有聊天链路的影响

1. 不影响无附件消息发送。
2. 不影响会话分页逻辑。
3. 不影响 assistant/tool message 的持久化。

### 14.2 后续可演进方向

1. 新增 `chat_message_attachments` 索引表，提高工作空间查询性能。
2. 引入 OCR。
3. 引入更强的文档在线预览能力。
4. 支持发送后附件管理与归档。

## 15. 实施拆分

### 阶段 1：数据与服务

1. 新增 `EmployeeUploadFileService`
2. 路径工具函数
3. 上传接口
4. `ChatMessageView` / API 类型扩展

### 阶段 2：聊天链路

1. `chat.post.ts` 请求体扩展
2. `EmployeeRunService.streamChatTurn()` 写入附件 metadata
3. 智能体文件路径上下文拼装
4. 聊天页上传控件与待发送列表

### 阶段 3：历史与展示

1. 消息接口返回附件视图
2. 聊天页、历史页统一渲染附件列表
3. 附件点击跳转工作空间

### 阶段 4：工作空间

1. 工作空间接口返回 `coreFiles + uploadedFilesTree`
2. 上传文件树 UI
3. 默认选中逻辑
4. 上传文件只读预览

## 16. 验收标准

1. 聊天输入区支持多文件上传、待发送展示、发送前删除。
2. 发送后，用户消息在实时页可看到附件列表。
3. 刷新页面后，历史消息仍能正确显示附件列表。
4. 文件实际落盘在 `uploadFile/YYYY-MM-DD/`。
5. 同名文件落盘后使用唯一前缀区分，但聊天页与工作空间列表展示的仍是上传时原始文件名。
6. 工作空间可按年月日树状看到全部上传文件。
7. 上传文件详情页可看到来源会话、来源消息与发送文本。
8. 历史记录页回看附件时，不会因文件重名而显示错误来源。
9. 从工作空间 tab 进入默认选中核心文件首项。
10. 从聊天附件进入默认选中对应上传文件。
11. 上传文件在工作空间中不可编辑。

## 17. 风险与注意事项

1. **目录扫描成本**：上传文件和消息量增大后，工作空间聚合可能变慢。
2. **文件读取能力依赖智能体运行时**：需要确认智能体在当前工作空间下具备稳定读取上传文件的能力。
3. **孤儿文件**：发送前删除仅从前端移除时，可能留下未引用文件；可后续补清理任务。
4. **预览差异**：Office/PDF 首期可能只能做有限预览或下载查看。
5. **关联准确性**：若工作空间详情查询未按 `relativePath + sourceMessageId + sourceSessionKey` 精确回查，就可能在历史记录和工作空间详情里出现错绑。

## 18. 结论

本方案基于现有聊天持久化与工作空间能力，采用**“物理文件落工作空间 + 用户消息 metadata 保存附件快照”**的架构，实现成本低、与当前系统贴合度高，能完整覆盖本次需求中的上传、发送、历史回显、工作空间浏览与来源追溯。

后续若附件规模或检索复杂度提升，可在不破坏对外接口的前提下，平滑升级为带索引表的增强方案。
