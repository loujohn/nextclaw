# v0.13.69 — chat 乐观消息回滚引用比较修复

## 迭代完成说明

### 问题

`chat.vue` 中发送消息时先乐观插入一条 `{ role: "user", content: input }` 对象，请求失败时通过以下过滤器回滚：

```ts
// 修复前（有缺陷）
messages.value = messages.value.filter(
  m => !(m.role === "user" && m.content === input)
);
```

值匹配会遍历整个 `messages` 数组，只要 `role` 与 `content` 同时匹配就删除，导致历史中所有内容相同的用户消息一并被误删。

### 根因

状态回滚采用"值相等"而非"引用相等"，无法区分"本次乐观插入的对象"和"历史上恰好内容相同的对象"。

### 修复

插入时保存对象引用，失败时用引用比较回滚：

```ts
// 修复后（正确）
const optimisticMsg: ChatMessageView = { role: "user", content: input };
messages.value = [...messages.value, optimisticMsg];

// catch 块中：
messages.value = messages.value.filter(m => m !== optimisticMsg);
```

`m !== optimisticMsg` 是严格引用比较，精确命中本次插入的那一个对象，不影响历史消息。

### 变更文件

- [`packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue`](../../../../packages/nextclaw-digital-employee/app/pages/employees/%5Bid%5D/chat.vue) — 核心修复
- [`packages/nextclaw-digital-employee/tests/chat-optimistic-rollback.test.ts`](../../../../packages/nextclaw-digital-employee/tests/chat-optimistic-rollback.test.ts) — 新增测试

---

## 测试 / 验证 / 验收方式

### 单元测试（自动）

```bash
cd packages/nextclaw-digital-employee
pnpm vitest run tests/chat-optimistic-rollback.test.ts
```

**7 个测试用例全部通过：**

| 组 | 用例 | 意图 |
|---|---|---|
| 修复后行为 | 回滚只删本次乐观消息 | 核心正确性 |
| 修复后行为 | 历史多条相同内容全部保留 | 核心正确性 |
| 修复后行为 | 全新消息失败后列表恢复原状 | 基准场景 |
| 修复后行为 | 列表为空时回滚后仍为空 | 边界情况 |
| Bug 复现 | 值比较误删历史同内容消息 | 回归防护 |
| Bug 复现 | 值比较删除多条重复历史消息 | 回归防护 |
| 顺序完整性 | 回滚后消息顺序不变 | 稳定性验证 |

### 手动冒烟（UI 可见行为）

1. 进入任一员工的聊天页面
2. 发送一条消息，例如 `测试消息`，等待回复后确认消息出现在历史中
3. 断开后端服务或伪造网络错误，再次发送相同内容 `测试消息`
4. **修复前**：历史中原有的 `测试消息` 也被删除  
   **修复后**：历史中原有的 `测试消息` 保留，只有本次乐观插入的气泡被撤销

---

## 发布 / 部署方式

本次改动为纯 UI 逻辑修复（`app/` 下的 Vue 组件），无 API / 数据库变更。

- **migration**：不适用（无数据库变更）
- **npm 发布**：不适用（`@nextclaw/digital-employee` 为 `private: true`）
- **部署**：重新构建并发布前端即可 (`pnpm build` → 部署 `.output`)

---

## 用户 / 产品视角的验收步骤

1. 打开员工聊天页面，与员工进行若干轮对话
2. 发送与历史中某条完全一样的消息
3. 模拟发送失败（例如断开网络）
4. 观察聊天历史：历史记录应完整保留，仅本次发送的气泡消失，错误提示正常出现
5. 确认恢复网络后可正常继续对话
