import { describe, expect, it } from "vitest";
import { parseNoProxyRule, parseNoProxy, shouldBypassProxy } from "./no-proxy.js";

describe("no-proxy CIDR parsing", () => {
  it("normalizes IPv4 CIDR internals to unsigned 32-bit numbers", () => {
    const rule = parseNoProxyRule("172.31.0.0/16");

    expect(rule?.cidr).toMatchObject({
      baseAddress: 2887712768,
      mask: 4294901760,
      prefixLength: 16,
    });
  });

  it("matches high-bit IPv4 CIDR ranges predictably", () => {
    const rules = parseNoProxy("192.168.1.0/24,10.0.0.0/8");

    expect(shouldBypassProxy("192.168.1.25", rules)).toBe(true);
    expect(shouldBypassProxy("192.168.2.25", rules)).toBe(false);
    expect(shouldBypassProxy("10.200.1.1", rules)).toBe(true);
  });
});
