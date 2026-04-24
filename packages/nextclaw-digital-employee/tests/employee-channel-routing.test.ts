import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboundMessage } from "@nextclaw/core";
import { ConfigSchema } from "@nextclaw/core";

describe("DigitalEmployeeChannelRuntime.handleEmployeeInbound", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "nextclaw-emp-channel-test-"));
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("routes employee channel message to target employee engine by code", async () => {
    const mockEngine = { handleInbound: vi.fn(async () => null) };

    // Minimal valid config for AgentRouteResolver constructor
    const runtimeConfig = ConfigSchema.parse({
      agents: {
        defaults: { workspace: tempHome, engine: "mock", model: "openai/gpt-5" },
        list: []
      }
    });

    const mockGateway = {
      homeDir: tempHome,
      workspaceDir: tempHome,
      runtimeConfig,
      getOrCreateEngineWithSecrets: vi.fn(async () => mockEngine),
    };

    const financeEmployee = {
      id: "emp-finance",
      code: "finance-bot",
      name: "财务助手",
      model: "",
      systemPrompt: "",
      description: "",
      status: "active",
      departmentId: null,
      webhookEnabled: false,
      webhookSecret: null,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const mockEmployeeRepo = {
      getByCode: vi.fn(async (code: string) =>
        code === "finance-bot" ? financeEmployee : null
      )
    };

    const mockSkillRepo = {
      listByEmployeeId: vi.fn(async () => [
        { skillName: "employee-query", enabled: true }
      ])
    };

    const { DigitalEmployeeChannelRuntime } = await import(
      "../server/runtime/channel-runtime.js"
    );

    const runtime = new DigitalEmployeeChannelRuntime({
      gateway: mockGateway as never,
      employeeRepo: mockEmployeeRepo as never,
      employeeSkillRepo: mockSkillRepo as never,
      loadState: async () => ({
        config: runtimeConfig as never,
        extensionRegistry: { tools: [], channels: [], diagnostics: [], engines: [] },
        pluginRegistry: { channels: [] }
      })
    });

    const message: InboundMessage = {
      channel: "employee",
      chatId: "finance-bot",
      senderId: "agent:hr-bot",
      content: "请处理这个报销申请",
      timestamp: new Date(),
      attachments: [],
      metadata: { target_agent_id: "finance-bot" }
    };

    await (runtime as unknown as {
      handleEmployeeInbound: (msg: InboundMessage) => Promise<void>;
    }).handleEmployeeInbound(message);

    expect(mockEmployeeRepo.getByCode).toHaveBeenCalledWith("finance-bot");
    expect(mockGateway.getOrCreateEngineWithSecrets).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "finance-bot" })
    );
    expect(mockEngine.handleInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "agent:finance-bot:employee:direct:finance-bot",
        publishResponse: false
      })
    );
    const dispatchedMessage = (mockEngine.handleInbound.mock.calls[0][0] as { message: InboundMessage }).message;
    expect(dispatchedMessage.metadata.requested_skills).toContain("employee-query");
  });

  it("logs warning and returns when target employee code does not exist", async () => {
    const runtimeConfig = ConfigSchema.parse({
      agents: {
        defaults: { workspace: tempHome, engine: "mock", model: "openai/gpt-5" },
        list: []
      }
    });

    const mockGateway = {
      homeDir: tempHome,
      workspaceDir: tempHome,
      runtimeConfig,
      getOrCreateEngineWithSecrets: vi.fn(),
    };

    const mockEmployeeRepo = { getByCode: vi.fn(async () => null) };
    const mockSkillRepo = { listByEmployeeId: vi.fn(async () => []) };

    const { DigitalEmployeeChannelRuntime } = await import(
      "../server/runtime/channel-runtime.js"
    );

    const runtime = new DigitalEmployeeChannelRuntime({
      gateway: mockGateway as never,
      employeeRepo: mockEmployeeRepo as never,
      employeeSkillRepo: mockSkillRepo as never,
      loadState: async () => ({
        config: runtimeConfig as never,
        extensionRegistry: { tools: [], channels: [], diagnostics: [], engines: [] },
        pluginRegistry: { channels: [] }
      })
    });

    const message: InboundMessage = {
      channel: "employee",
      chatId: "nonexistent-bot",
      senderId: "agent:hr-bot",
      content: "hello",
      timestamp: new Date(),
      attachments: [],
      metadata: {}
    };

    await expect(
      (runtime as unknown as { handleEmployeeInbound: (msg: InboundMessage) => Promise<void> })
        .handleEmployeeInbound(message)
    ).resolves.toBeUndefined();

    expect(mockGateway.getOrCreateEngineWithSecrets).not.toHaveBeenCalled();
  });
});
