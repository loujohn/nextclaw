import { describe, it, expect } from "vitest";
import {
  formatNoProxyRulesForLog,
  matchesNoProxyRule,
  parseNoProxy,
  parseNoProxyRule,
  shouldBypassProxy
} from "../server/utils/no-proxy";

describe("parseNoProxyRule", () => {
  it("返回 null 当输入为空字符串或纯空格", () => {
    expect(parseNoProxyRule("")).toBeNull();
    expect(parseNoProxyRule("   ")).toBeNull();
  });

  it("识别 `*` 为全通配规则", () => {
    expect(parseNoProxyRule("*")).toEqual({
      host: "*",
      matchAll: true,
      suffixOnly: false
    });
  });

  it("保留裸 host 的精确语义", () => {
    expect(parseNoProxyRule("foo.com")).toEqual({
      host: "foo.com",
      matchAll: false,
      suffixOnly: false
    });
  });

  it("识别 `.foo.com` 前缀为子域通配（suffixOnly=true）", () => {
    expect(parseNoProxyRule(".foo.com")).toEqual({
      host: "foo.com",
      matchAll: false,
      suffixOnly: true
    });
  });

  it("识别 `*.foo.com` 前缀为子域通配（suffixOnly=true）", () => {
    expect(parseNoProxyRule("*.foo.com")).toEqual({
      host: "foo.com",
      matchAll: false,
      suffixOnly: true
    });
  });

  it("剥离端口后按 host 比较", () => {
    expect(parseNoProxyRule("foo.com:8080")).toMatchObject({
      host: "foo.com",
      matchAll: false
    });
    expect(parseNoProxyRule(".foo.com:9443")).toMatchObject({
      host: "foo.com",
      suffixOnly: true
    });
  });

  it("保留 IPv6 字面量中的冒号（只剥离最后一个端口冒号）", () => {
    expect(parseNoProxyRule("[::1]:8080")).toMatchObject({
      host: "[::1]"
    });
    expect(parseNoProxyRule("[::1]")).toMatchObject({
      host: "[::1]"
    });
  });

  it("大小写不敏感，统一归一化为小写", () => {
    expect(parseNoProxyRule("FOO.COM")).toMatchObject({ host: "foo.com" });
    expect(parseNoProxyRule("*.Example.COM")).toMatchObject({
      host: "example.com",
      suffixOnly: true
    });
  });

  it("自动修剪前后空格", () => {
    expect(parseNoProxyRule("  foo.com  ")).toMatchObject({ host: "foo.com" });
  });

  it("返回 null 当规则只有端口（裸 `:8080`）", () => {
    expect(parseNoProxyRule(":8080")).toBeNull();
  });
});

describe("parseNoProxy", () => {
  it("未配置或空字符串返回空规则集", () => {
    expect(parseNoProxy(undefined)).toEqual([]);
    expect(parseNoProxy("")).toEqual([]);
  });

  it("逗号分隔多规则，丢弃无效项", () => {
    const rules = parseNoProxy("foo.com, .bar.com, , *.baz.com, :80, *");
    expect(rules).toHaveLength(4);
    expect(rules[0]).toMatchObject({ host: "foo.com" });
    expect(rules[1]).toMatchObject({ host: "bar.com", suffixOnly: true });
    expect(rules[2]).toMatchObject({ host: "baz.com", suffixOnly: true });
    expect(rules[3]).toMatchObject({ host: "*", matchAll: true });
  });
});

describe("matchesNoProxyRule", () => {
  const fooRule = parseNoProxyRule("foo.com")!;
  const dotFooRule = parseNoProxyRule(".foo.com")!;
  const wildFooRule = parseNoProxyRule("*.foo.com")!;
  const starRule = parseNoProxyRule("*")!;

  it("`*` 规则匹配任意 host", () => {
    expect(matchesNoProxyRule("anything.internal", starRule)).toBe(true);
    expect(matchesNoProxyRule("", starRule)).toBe(true);
  });

  it("裸 host 规则匹配自身及其所有子域", () => {
    expect(matchesNoProxyRule("foo.com", fooRule)).toBe(true);
    expect(matchesNoProxyRule("api.foo.com", fooRule)).toBe(true);
    expect(matchesNoProxyRule("a.b.foo.com", fooRule)).toBe(true);
  });

  it("`.foo.com` / `*.foo.com` 统一宽松语义：匹配自身 + 子域", () => {
    for (const rule of [dotFooRule, wildFooRule]) {
      expect(matchesNoProxyRule("foo.com", rule)).toBe(true);
      expect(matchesNoProxyRule("api.foo.com", rule)).toBe(true);
    }
  });

  it("规则不匹配时返回 false", () => {
    expect(matchesNoProxyRule("bar.com", fooRule)).toBe(false);
    expect(matchesNoProxyRule("foocom", fooRule)).toBe(false);
    expect(matchesNoProxyRule("notfoo.com", fooRule)).toBe(false);
  });

  it("比较大小写不敏感", () => {
    expect(matchesNoProxyRule("FOO.COM", fooRule)).toBe(true);
    expect(matchesNoProxyRule("Api.Foo.Com", wildFooRule)).toBe(true);
  });
});

describe("shouldBypassProxy", () => {
  it("空规则集一律走代理", () => {
    expect(shouldBypassProxy("foo.com", [])).toBe(false);
    expect(shouldBypassProxy("", [])).toBe(false);
  });

  it("hostname 为空一律走代理（防御性）", () => {
    const rules = parseNoProxy("*");
    expect(shouldBypassProxy("", rules)).toBe(false);
  });

  it("任一规则命中即 bypass", () => {
    const rules = parseNoProxy("localhost, .internal.example, 127.0.0.1");
    expect(shouldBypassProxy("localhost", rules)).toBe(true);
    expect(shouldBypassProxy("127.0.0.1", rules)).toBe(true);
    expect(shouldBypassProxy("api.internal.example", rules)).toBe(true);
    expect(shouldBypassProxy("internal.example", rules)).toBe(true);
    expect(shouldBypassProxy("github.com", rules)).toBe(false);
  });

  it("真实业务场景：混合外网与内网规则", () => {
    const rules = parseNoProxy(".cqdcg.com,.dcginner,localhost,::1");
    expect(shouldBypassProxy("keyc.cqdcg.com", rules)).toBe(true);
    expect(shouldBypassProxy("shangji.cqdcg.com", rules)).toBe(true);
    expect(shouldBypassProxy("dm.common.dev.dcginner", rules)).toBe(true);
    expect(shouldBypassProxy("oapi.dingtalk.com", rules)).toBe(false);
    expect(shouldBypassProxy("dashscope.aliyuncs.com", rules)).toBe(false);
  });

  it("`*` 单独配置时所有 host 均 bypass", () => {
    const rules = parseNoProxy("*");
    expect(shouldBypassProxy("foo.com", rules)).toBe(true);
    expect(shouldBypassProxy("a.b.c", rules)).toBe(true);
  });
});

describe("formatNoProxyRulesForLog", () => {
  it("空集输出 `(none)`", () => {
    expect(formatNoProxyRulesForLog([])).toBe("(none)");
  });

  it("保留原始前缀语义以便运维对照", () => {
    const rules = parseNoProxy("*, foo.com, .bar.com, *.baz.com");
    expect(formatNoProxyRulesForLog(rules)).toBe("*,foo.com,.bar.com,.baz.com");
  });
});
