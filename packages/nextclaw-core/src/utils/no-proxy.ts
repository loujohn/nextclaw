/**
 * NO_PROXY rule parsing and matching.
 *
 * Supported forms:
 * - empty input: no bypass rules
 * - `*`: bypass all hosts
 * - `foo.com`, `.foo.com`, `*.foo.com`: match the host and all subdomains
 * - `foo.com:8080`: strip the port before matching
 * - `172.31.0.0/16`: IPv4 CIDR, commonly used for internal networks
 */

export type NoProxyCidr = {
  baseAddress: number;
  prefixLength: number;
  mask: number;
};

export type NoProxyRule = {
  host: string;
  matchAll: boolean;
  suffixOnly: boolean;
  cidr?: NoProxyCidr;
};

function parseIpv4ToInt(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const segment = Number(part);
    if (!Number.isInteger(segment) || segment < 0 || segment > 255) {
      return null;
    }
    result = (result << 8) + segment;
  }
  return result >>> 0;
}

function toUnsigned32(value: number): number {
  return value >>> 0;
}

function parseIpv4Cidr(value: string): NoProxyCidr | null {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(value);
  if (!match) return null;

  const address = parseIpv4ToInt(match[1]);
  const prefixLength = Number(match[2]);
  if (address === null || prefixLength < 0 || prefixLength > 32) {
    return null;
  }

  const mask =
    prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return {
    baseAddress: toUnsigned32(address & mask),
    prefixLength,
    mask,
  };
}

function stripPort(value: string): string {
  const lastColon = value.lastIndexOf(":");
  const lastBracket = value.lastIndexOf("]");
  if (lastColon > -1 && lastColon > lastBracket) {
    return value.slice(0, lastColon);
  }
  return value;
}

function normalizeHostnameInput(hostname: string): string {
  return stripPort(hostname.trim().toLowerCase());
}

export function parseNoProxyRule(rawRule: string): NoProxyRule | null {
  const trimmed = rawRule.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "*") return { host: "*", matchAll: true, suffixOnly: false };

  let value = trimmed;
  if (value.startsWith("*.")) value = value.slice(2);
  else if (value.startsWith(".")) value = value.slice(1);

  value = stripPort(value);
  if (!value) return null;

  const cidr = parseIpv4Cidr(value);
  if (cidr) {
    return { host: value, matchAll: false, suffixOnly: false, cidr };
  }

  const suffixOnly = trimmed.startsWith("*.") || trimmed.startsWith(".");
  return { host: value, matchAll: false, suffixOnly };
}

export function parseNoProxy(raw: string | undefined): NoProxyRule[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map(parseNoProxyRule)
    .filter((rule): rule is NoProxyRule => rule !== null);
}

export function matchesNoProxyRule(hostname: string, rule: NoProxyRule): boolean {
  if (rule.matchAll) return true;

  const host = normalizeHostnameInput(hostname);
  if (rule.cidr) {
    const address = parseIpv4ToInt(host);
    return (
      address !== null &&
      toUnsigned32(address & rule.cidr.mask) === rule.cidr.baseAddress
    );
  }

  if (host === rule.host) return true;
  return host.endsWith(`.${rule.host}`);
}

export function shouldBypassProxy(hostname: string, rules: NoProxyRule[]): boolean {
  if (!hostname || !rules.length) return false;
  return rules.some((rule) => matchesNoProxyRule(hostname, rule));
}

export function formatNoProxyRulesForLog(rules: NoProxyRule[]): string {
  if (!rules.length) return "(none)";
  return rules
    .map((rule) => (rule.matchAll ? "*" : rule.suffixOnly ? `.${rule.host}` : rule.host))
    .join(",");
}
