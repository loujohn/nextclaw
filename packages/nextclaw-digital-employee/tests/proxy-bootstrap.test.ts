import http from "node:http";
import https from "node:https";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MockEnvHttpProxyAgent = vi.hoisted(() =>
  vi.fn(function EnvHttpProxyAgent() {})
);
const mockSetGlobalDispatcher = vi.hoisted(() => vi.fn());

vi.mock("undici", () => ({
  EnvHttpProxyAgent: MockEnvHttpProxyAgent,
  setGlobalDispatcher: mockSetGlobalDispatcher
}));

describe("proxy bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("HTTPS_PROXY", "http://172.31.1.95:1080");
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1,172.31.0.0/16");
    MockEnvHttpProxyAgent.mockClear();
    mockSetGlobalDispatcher.mockClear();
  });

  it("configures undici fetch without replacing Node global HTTP agents", async () => {
    const originalHttpAgent = http.globalAgent;
    const originalHttpsAgent = https.globalAgent;
    vi.stubGlobal("defineNitroPlugin", (plugin: () => void) => plugin);

    const mod = await import("../server/plugins/00.proxy-bootstrap");
    mod.default();

    expect(MockEnvHttpProxyAgent).toHaveBeenCalledTimes(1);
    expect(mockSetGlobalDispatcher).toHaveBeenCalledTimes(1);
    expect(http.globalAgent).toBe(originalHttpAgent);
    expect(https.globalAgent).toBe(originalHttpsAgent);
  });
});
