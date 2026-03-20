import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  dingtalkPluginConfigSchema,
  normalizeDingTalkConfig,
  resolveDingTalkAccount,
  type RawDingTalkConfig
} from "./config";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(resolve(packageDir, "openclaw.plugin.json"), "utf8")
) as { configSchema?: Record<string, unknown> };

describe("normalizeDingTalkConfig", () => {
  it("normalizes legacy single-account config into a default account", () => {
    const config = normalizeDingTalkConfig({
      enabled: true,
      clientId: "legacy-client",
      clientSecret: "legacy-secret",
      robotCode: "legacy-robot",
      allowFrom: [" user-a ", "user-a", ""]
    } satisfies RawDingTalkConfig);

    expect(config.enabled).toBe(true);
    expect(config.defaultAccountId).toBe("default");
    expect(Object.keys(config.accounts)).toEqual(["default"]);
    expect(config.accounts.default).toMatchObject({
      clientId: "legacy-client",
      clientSecret: "legacy-secret",
      robotCode: "legacy-robot",
      allowFrom: ["user-a"]
    });
  });

  it("keeps explicit accounts and resolves the selected account", () => {
    const config = normalizeDingTalkConfig({
      enabled: true,
      defaultAccountId: "bot-b",
      accounts: {
        "bot-a": {
          clientId: "client-a",
          clientSecret: "secret-a"
        },
        "bot-b": {
          clientId: "client-b",
          clientSecret: "secret-b",
          groupPolicy: "allowlist",
          groupAllowFrom: ["cid-team-1"]
        }
      }
    } satisfies RawDingTalkConfig);

    expect(resolveDingTalkAccount(config, "bot-b")?.clientId).toBe("client-b");
    expect(resolveDingTalkAccount(config, "missing")?.clientId).toBe("client-b");
    expect(config.accounts["bot-b"]?.groupAllowFrom).toEqual(["cid-team-1"]);
  });
});

describe("dingtalk plugin package shape", () => {
  it("can be imported by plain node without relying on a ts entrypoint", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const mod = await import(${JSON.stringify(pathToFileURL(resolve(packageDir, "index.js")).href)}); console.log(mod.default?.id ?? "missing");`
      ],
      {
        cwd: packageDir,
        encoding: "utf8"
      }
    );

    expect(output.trim()).toBe("builtin-channel-dingtalk");
  });

  it("keeps manifest config schema aligned with runtime schema, including legacy single-account fields", () => {
    expect(dingtalkPluginConfigSchema).toMatchObject({
      properties: expect.objectContaining({
        clientId: expect.any(Object),
        clientSecret: expect.any(Object),
        robotCode: expect.any(Object),
        allowFrom: expect.any(Object),
        dmPolicy: expect.any(Object),
        groupPolicy: expect.any(Object),
        defaultAccountId: expect.any(Object),
        accounts: expect.any(Object)
      })
    });
    expect(manifest.configSchema).toEqual(dingtalkPluginConfigSchema);
  });
});
