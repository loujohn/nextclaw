import { describe, expect, it } from "vitest";
import {
  buildChatResultCards,
  buildDashboardSummary,
  buildIntegrationCards,
  buildRunListEntries,
  buildSkillCatalogEntries,
  formatScheduleSummary
} from "../shared/ui-models";

describe("dashboard and skills ui models", () => {
  it("builds dashboard summary from employees and runs", () => {
    const summary = buildDashboardSummary({
      employees: [
        { id: "e1", status: "active", schedule: { scheduleKind: "cron", nextRunAt: "2026-03-12T10:00:00.000Z" } },
        { id: "e2", status: "active", schedule: null },
        { id: "e3", status: "paused", schedule: { scheduleKind: "every", nextRunAt: null } }
      ],
      runs: [
        { id: "r1", status: "completed", triggerType: "scheduled" },
        { id: "r2", status: "failed", triggerType: "manual" },
        { id: "r3", status: "failed", triggerType: "scheduled" }
      ],
      installedSkills: [{ skillName: "skills-create", enabled: true }, { skillName: "zentao-fetch", enabled: false }]
    });

    expect(summary.totalEmployees).toBe(3);
    expect(summary.activeEmployees).toBe(2);
    expect(summary.scheduledEmployees).toBe(2);
    expect(summary.failedRuns).toBe(2);
    expect(summary.enabledSkills).toBe(1);
  });

  it("builds skill catalog entries with usage and status", () => {
    const entries = buildSkillCatalogEntries({
      availableSkills: [
        { name: "skills-create", path: "/tmp/skills-create", source: "builtin" },
        { name: "zentao-fetch", path: "/tmp/zentao-fetch", source: "workspace" }
      ],
      installations: [
        {
          skillName: "zentao-fetch",
          sourceType: "git",
          sourceUri: "https://example.com/zentao-fetch.git",
          enabled: true
        }
      ],
      skillBindings: [
        { employeeId: "e1", employeeName: "项目管理助手", skillName: "zentao-fetch" },
        { employeeId: "e2", employeeName: "技能设计师", skillName: "skills-create" },
        { employeeId: "e1", employeeName: "项目管理助手", skillName: "skills-create" }
      ]
    });

    expect(entries[0]).toMatchObject({
      name: "skills-create",
      usageCount: 2,
      statusLabel: "内置可用"
    });
    expect(entries[1]).toMatchObject({
      name: "zentao-fetch",
      usageCount: 1,
      statusLabel: "已启用"
    });
    expect(entries[1]?.usedBy).toEqual(["项目管理助手"]);
  });

  it("formats schedule summary for user-facing cards", () => {
    expect(formatScheduleSummary(null)).toBe("未配置自动运行");
    expect(
      formatScheduleSummary({
        scheduleKind: "cron",
        nextRunAt: "2026-03-12T10:00:00.000Z"
      })
    ).toContain("下次运行");
    expect(
      formatScheduleSummary({
        scheduleKind: "heartbeat",
        nextRunAt: null
      })
    ).toBe("心跳巡检");
  });

});

describe("chat and run ui models", () => {
  it("builds structured chat result cards from markdown-like reply", () => {
    const cards = buildChatResultCards(`
## 管理摘要
今天共有 2 个高风险项目，需要研发负责人跟进。

## 项目维度
- 项目 A：延期 2 天
- 项目 B：阻塞待确认

## 负责人/成员维度
- 张三：2 个延期任务
- 李四：1 个阻塞任务

## 建议动作
1. 先同步项目 A 风险
2. 补齐项目 B 阻塞原因
`);

    expect(cards.map((card) => card.kind)).toEqual(["summary", "projects", "owners", "actions"]);
    expect(cards[0]?.title).toBe("管理摘要");
    expect(cards[1]?.items).toContain("项目 A：延期 2 天");
    expect(cards[2]?.items).toContain("张三：2 个延期任务");
    expect(cards[3]?.items).toContain("先同步项目 A 风险");
  });

  it("builds run list entries with employee and trigger labels", () => {
    const entries = buildRunListEntries({
      employees: [
        { id: "e1", name: "项目管理助手" },
        { id: "e2", name: "技能设计师" }
      ],
      runs: [
        {
          id: "r1",
          employeeId: "e1",
          triggerType: "manual",
          triggerSource: "chat",
          status: "completed",
          startedAt: "2026-03-12T10:00:00.000Z",
          summary: "已输出管理日报",
          result: {
            resultCards: [{ kind: "summary", title: "管理摘要", content: "日报已生成", items: [] }],
            reportStatus: "delivered"
          }
        },
        {
          id: "r2",
          employeeId: "e2",
          triggerType: "scheduled",
          triggerSource: "automation",
          status: "failed",
          startedAt: "2026-03-12T09:00:00.000Z",
          summary: "缺少模型配置",
          result: {}
        }
      ]
    });

    expect(entries[0]).toMatchObject({
      employeeName: "项目管理助手",
      triggerLabel: "聊天触发",
      statusLabel: "已完成",
      highlight: "日报已生成"
    });
    expect(entries[1]).toMatchObject({
      employeeName: "技能设计师",
      triggerLabel: "自动运行",
      statusLabel: "执行失败",
      tone: "danger"
    });
  });

});

describe("integration ui models", () => {
  it("builds integration cards for model and business connections", () => {
    const cards = buildIntegrationCards({
      model: {
        provider: "openai",
        model: "openai/gpt-4o-mini",
        apiBase: "https://relay.example.com/v1",
        configured: true
      },
      integrations: [
        { type: "zentao", name: "禅道生产环境", enabled: true, lastCheckedAt: "2026-03-12T08:00:00.000Z" },
        { type: "dingtalk", name: "项目日报群", enabled: false, lastCheckedAt: null }
      ]
    });

    expect(cards[0]).toMatchObject({
      id: "model",
      title: "模型提供商",
      statusLabel: "已配置",
      actionLabel: "管理模型"
    });
    expect(cards[1]).toMatchObject({
      id: "zentao",
      title: "禅道",
      statusLabel: "已连接"
    });
    expect(cards[2]).toMatchObject({
      id: "dingtalk",
      statusLabel: "待配置",
      actionLabel: "去配置"
    });
  });
});
