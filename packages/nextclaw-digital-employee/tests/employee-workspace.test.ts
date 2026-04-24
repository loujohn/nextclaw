import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureEmployeeWorkspace } from "../server/engine/employee-workspace";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createWorkspaceFixture() {
  const root = mkdtempSync(join(tmpdir(), "digital-employee-workspace-seed-"));
  tempDirs.push(root);
  const homeDir = join(root, "home");
  const globalWorkspaceDir = join(root, "global-workspace");
  mkdirSync(globalWorkspaceDir, { recursive: true });
  return { homeDir, globalWorkspaceDir };
}

describe("ensureEmployeeWorkspace", () => {
  it("seeds SOUL.md and IDENTITY.md only when they are missing", () => {
    const { homeDir, globalWorkspaceDir } = createWorkspaceFixture();
    const employee = {
      code: "source-bot",
      name: "Source Bot",
      description: "DB description",
      systemPrompt: "DB prompt"
    };
    const workspaceDir = ensureEmployeeWorkspace(homeDir, employee, globalWorkspaceDir);
    const soulPath = join(workspaceDir, "SOUL.md");
    const identityPath = join(workspaceDir, "IDENTITY.md");

    writeFileSync(soulPath, "# SOUL.md\n\nfile-owned soul\n", "utf-8");
    writeFileSync(identityPath, "# IDENTITY.md\n\nfile-owned identity\n", "utf-8");

    ensureEmployeeWorkspace(homeDir, {
      ...employee,
      name: "Updated DB Name",
      description: "Updated DB description",
      systemPrompt: "Updated DB prompt"
    }, globalWorkspaceDir);

    expect(readFileSync(soulPath, "utf-8")).toBe("# SOUL.md\n\nfile-owned soul\n");
    expect(readFileSync(identityPath, "utf-8")).toBe("# IDENTITY.md\n\nfile-owned identity\n");
  });
});
