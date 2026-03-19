import { describe, it, expect } from "vitest";
import type { ChatMessageView } from "../shared/ui-models";

/**
 * 模拟 chat.vue 中乐观插入 + 失败回滚的核心状态逻辑
 *
 * 修复前（有缺陷）：通过 content === input 做值匹配过滤，
 *   会把历史中所有相同内容的用户消息一并删除。
 *
 * 修复后（正确）：保存乐观插入对象的引用，失败回滚时用 m !== optimisticMsg
 *   做引用比较，仅删除本次插入的那一条。
 */

// ---- 修复前的回滚实现（复现 bug） ---------------------------------
function rollbackByContent(
  messages: ChatMessageView[],
  input: string
): ChatMessageView[] {
  return messages.filter(m => !(m.role === "user" && m.content === input));
}

// ---- 修复后的回滚实现（正确） ------------------------------------
function rollbackByRef(
  messages: ChatMessageView[],
  optimisticMsg: ChatMessageView
): ChatMessageView[] {
  return messages.filter(m => m !== optimisticMsg);
}

// ---- 测试工具函数 ------------------------------------------------
function makeHistory(inputs: string[]): ChatMessageView[] {
  return inputs.map(content => ({ role: "user" as const, content }));
}

describe("chat 乐观消息回滚 —— 引用比较修复", () => {
  describe("修复后行为（引用比较）", () => {
    it("回滚时只删除本次插入的乐观消息，不影响任何历史消息", () => {
      const history: ChatMessageView[] = makeHistory(["你好", "今天天气如何"]);
      const input = "今天天气如何"; // 与历史最后一条内容相同
      const optimisticMsg: ChatMessageView = { role: "user", content: input };
      const messages = [...history, optimisticMsg];

      const result = rollbackByRef(messages, optimisticMsg);

      // 历史两条应全部保留
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("你好");
      expect(result[1].content).toBe("今天天气如何");
      // 乐观插入的对象本身不在结果中
      expect(result.includes(optimisticMsg)).toBe(false);
    });

    it("历史中有多条相同内容时，全部保留，仅删除本次乐观消息", () => {
      const dup = "总结项目";
      const history: ChatMessageView[] = [
        { role: "user", content: dup },
        { role: "assistant", content: "好的" },
        { role: "user", content: dup },
        { role: "assistant", content: "已处理" }
      ];
      const optimisticMsg: ChatMessageView = { role: "user", content: dup };
      const messages = [...history, optimisticMsg];

      const result = rollbackByRef(messages, optimisticMsg);

      expect(result).toHaveLength(4);
      // 原来两条 user "总结项目" 均保留
      expect(result.filter(m => m.role === "user" && m.content === dup)).toHaveLength(2);
    });

    it("发送全新消息失败时，正确回滚，列表恢复原状", () => {
      const history: ChatMessageView[] = makeHistory(["之前的消息"]);
      const optimisticMsg: ChatMessageView = { role: "user", content: "全新消息" };
      const messages = [...history, optimisticMsg];

      const result = rollbackByRef(messages, optimisticMsg);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("之前的消息");
    });

    it("消息列表为空时，回滚后依然为空", () => {
      const optimisticMsg: ChatMessageView = { role: "user", content: "第一次发送" };
      const messages = [optimisticMsg];

      const result = rollbackByRef(messages, optimisticMsg);

      expect(result).toHaveLength(0);
    });
  });

  describe("修复前行为（值比较）—— 复现已知 bug", () => {
    it("【bug 复现】历史有相同内容时，值比较会误删历史消息", () => {
      const input = "今天天气如何";
      const history: ChatMessageView[] = makeHistory(["你好", input]); // 历史最后一条与本次相同
      const optimisticMsg: ChatMessageView = { role: "user", content: input };
      const messages = [...history, optimisticMsg];

      const result = rollbackByContent(messages, input);

      // 期望：应保留 2 条（历史）；实际：值匹配把历史里的那条也删了
      expect(result).toHaveLength(1); // bug：只剩 "你好"
      expect(result[0].content).toBe("你好");
      // 历史中的 "今天天气如何" 被错误删除
    });

    it("【bug 复现】历史有多条相同内容时，全部被值比较删除", () => {
      const dup = "总结项目";
      const history: ChatMessageView[] = [
        { role: "user", content: dup },
        { role: "assistant", content: "好的" },
        { role: "user", content: dup }
      ];
      const optimisticMsg: ChatMessageView = { role: "user", content: dup };
      const messages = [...history, optimisticMsg];

      const result = rollbackByContent(messages, dup);

      // 期望：保留 3 条（两条 user dup + 一条 assistant）；实际两条 user dup 被删
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("assistant");
    });
  });

  describe("回滚前后消息顺序完整性", () => {
    it("回滚后列表顺序与插入前完全一致", () => {
      const history: ChatMessageView[] = [
        { role: "user", content: "A" },
        { role: "assistant", content: "B" },
        { role: "user", content: "C" }
      ];
      const optimisticMsg: ChatMessageView = { role: "user", content: "D" };
      const messages = [...history, optimisticMsg];

      const result = rollbackByRef(messages, optimisticMsg);

      expect(result).toHaveLength(3);
      expect(result.map(m => m.content)).toEqual(["A", "B", "C"]);
    });
  });
});
