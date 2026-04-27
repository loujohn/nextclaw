import { HttpsProxyAgent } from "https-proxy-agent";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveHttpRequestAgent } from "../server/utils/proxy-agent";

describe("resolveHttpRequestAgent", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("HTTPS_PROXY", "");
    vi.stubEnv("https_proxy", "");
    vi.stubEnv("HTTP_PROXY", "");
    vi.stubEnv("http_proxy", "");
    vi.stubEnv("NO_PROXY", "");
    vi.stubEnv("no_proxy", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a proxy agent for external HTTPS targets when proxy is configured", () => {
    vi.stubEnv("HTTPS_PROXY", "http://172.31.1.95:1080");
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1,172.31.0.0/16");

    const resolved = resolveHttpRequestAgent(
      "https://api.dingtalk.com/v1.0/gateway/connections/open"
    );

    expect(resolved.route).toBe("proxy");
    expect(resolved.agent).toBeInstanceOf(HttpsProxyAgent);
    expect(resolved.proxyUrl).toBe("http://172.31.1.95:1080");
  });

  it("returns a direct agent for CIDR-matched internal HTTPS targets", () => {
    vi.stubEnv("HTTPS_PROXY", "http://172.31.1.95:1080");
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1,172.31.0.0/16");

    const resolved = resolveHttpRequestAgent("https://172.31.1.99/users");

    expect(resolved.route).toBe("direct");
    expect(resolved.proxyUrl).toBeUndefined();
    expect(resolved.agent).not.toBeInstanceOf(HttpsProxyAgent);
  });

  it("returns direct without creating an agent when no proxy is configured", () => {
    const resolved = resolveHttpRequestAgent("https://api.dingtalk.com");

    expect(resolved.route).toBe("direct");
    expect(resolved.agent).toBeUndefined();
  });
});
