import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PLATFORM_USAGE_MANAGED_MARKER,
  writePlatformUsageGuide
} from "../server/engine/platform-usage-seeder";

// The seeder is plain Node (no Nitro globals), so we exercise it with a throw-
// away tmp workspace. This covers the 4 decision branches documented in
// `platform-usage-seeder.ts`:
//   - first run / file missing → write with marker
//   - existing file has marker + same content → unchanged
//   - existing file has marker + different content → overwrite
//   - existing file without marker (user-edited) → skip
// plus the empty-asset guard that returns `null`.

describe("writePlatformUsageGuide", () => {
  let workspaceDir: string;
  let target: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "nextclaw-usage-seeder-"));
    target = join(workspaceDir, "PLATFORM_USAGE.md");
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("writes the managed file when no target exists", () => {
    const result = writePlatformUsageGuide(workspaceDir, "# Guide\nHello\n");
    expect(result).toEqual({ status: "written", target });
    const written = readFileSync(target, "utf-8");
    expect(written.startsWith(PLATFORM_USAGE_MANAGED_MARKER)).toBe(true);
    expect(written).toContain("# Guide");
  });

  it("returns `unchanged` when the existing managed file matches the new content", () => {
    writePlatformUsageGuide(workspaceDir, "# Guide\nv1\n");
    const again = writePlatformUsageGuide(workspaceDir, "# Guide\nv1\n");
    expect(again).toEqual({ status: "unchanged", target });
  });

  it("overwrites an existing managed file when content drifts", () => {
    writePlatformUsageGuide(workspaceDir, "# Guide\nv1\n");
    const result = writePlatformUsageGuide(workspaceDir, "# Guide\nv2 newer\n");
    expect(result).toEqual({ status: "written", target });
    const written = readFileSync(target, "utf-8");
    expect(written).toContain("v2 newer");
    expect(written.startsWith(PLATFORM_USAGE_MANAGED_MARKER)).toBe(true);
  });

  it("leaves a user-edited file (no marker) untouched", () => {
    const userContent = "# My own notes\nplease don't clobber me\n";
    writeFileSync(target, userContent, "utf-8");
    const result = writePlatformUsageGuide(workspaceDir, "# Different asset\n");
    expect(result).toEqual({ status: "user-edited-skipped", target });
    expect(readFileSync(target, "utf-8")).toBe(userContent);
  });

  it("respects an asset that already carries the managed marker (idempotent marker)", () => {
    const alreadyMarked = `${PLATFORM_USAGE_MANAGED_MARKER}\n# Guide\nv1\n`;
    const result = writePlatformUsageGuide(workspaceDir, alreadyMarked);
    expect(result).toEqual({ status: "written", target });
    const written = readFileSync(target, "utf-8");
    // Must not double-prefix the marker.
    const markerHits = written.match(new RegExp(PLATFORM_USAGE_MANAGED_MARKER, "g"));
    expect(markerHits).toHaveLength(1);
  });

  it("returns null and skips when asset content is empty", () => {
    const result = writePlatformUsageGuide(workspaceDir, "");
    expect(result).toBeNull();
    expect(() => readFileSync(target, "utf-8")).toThrow();
  });

  it("returns null and skips when asset content is only whitespace", () => {
    const result = writePlatformUsageGuide(workspaceDir, "   \n  \t\n");
    expect(result).toBeNull();
    expect(() => readFileSync(target, "utf-8")).toThrow();
  });

  it("returns null and skips when asset content is null", () => {
    const result = writePlatformUsageGuide(workspaceDir, null);
    expect(result).toBeNull();
  });
});
