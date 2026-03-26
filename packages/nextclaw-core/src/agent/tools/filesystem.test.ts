import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { WriteFileTool, ReadFileTool, EditFileTool, ListDirTool } from "./filesystem.js";

const tempDirs: string[] = [];
function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("WriteFileTool - relative path resolution", () => {
  it("resolves relative paths against allowedDir", async () => {
    const workspace = createTempDir("write-tool-ws-");
    const tool = new WriteFileTool(workspace);
    await tool.execute({ path: "test.txt", content: "hello" });
    const written = readFileSync(join(workspace, "test.txt"), "utf-8");
    expect(written).toBe("hello");
  });

  it("creates parent directories when missing", async () => {
    const workspace = createTempDir("write-tool-mkdir-");
    const tool = new WriteFileTool(workspace);
    await tool.execute({ path: "memory/2026-03-26.md", content: "# Today" });
    expect(existsSync(join(workspace, "memory", "2026-03-26.md"))).toBe(true);
    const content = readFileSync(join(workspace, "memory", "2026-03-26.md"), "utf-8");
    expect(content).toBe("# Today");
  });

  it("blocks writes outside allowedDir", async () => {
    const workspace = createTempDir("write-tool-block-");
    const tool = new WriteFileTool(workspace);
    await expect(tool.execute({ path: "/tmp/outside.txt", content: "bad" })).rejects.toThrow("Access denied");
  });

  it("handles absolute paths within allowedDir", async () => {
    const workspace = createTempDir("write-tool-abs-");
    const tool = new WriteFileTool(workspace);
    const absPath = join(workspace, "abs-test.txt");
    await tool.execute({ path: absPath, content: "absolute" });
    expect(readFileSync(absPath, "utf-8")).toBe("absolute");
  });
});

describe("ReadFileTool - relative path resolution", () => {
  it("resolves relative paths against allowedDir", async () => {
    const workspace = createTempDir("read-tool-ws-");
    const writeTool = new WriteFileTool(workspace);
    await writeTool.execute({ path: "data.txt", content: "read me" });
    const readTool = new ReadFileTool(workspace);
    const result = await readTool.execute({ path: "data.txt" });
    expect(result).toBe("read me");
  });
});

describe("EditFileTool - relative path resolution", () => {
  it("resolves relative paths against allowedDir", async () => {
    const workspace = createTempDir("edit-tool-ws-");
    const writeTool = new WriteFileTool(workspace);
    await writeTool.execute({ path: "edit.txt", content: "old text" });
    const editTool = new EditFileTool(workspace);
    const result = await editTool.execute({ path: "edit.txt", oldText: "old", newText: "new" });
    expect(result).toContain("Edited");
    const content = readFileSync(join(workspace, "edit.txt"), "utf-8");
    expect(content).toBe("new text");
  });
});

describe("ListDirTool - relative path resolution", () => {
  it("resolves relative paths against allowedDir", async () => {
    const workspace = createTempDir("list-tool-ws-");
    mkdirSync(join(workspace, "subdir"));
    const writeTool = new WriteFileTool(workspace);
    await writeTool.execute({ path: "subdir/file.txt", content: "x" });
    const listTool = new ListDirTool(workspace);
    const result = await listTool.execute({ path: "subdir" });
    expect(result).toContain("file.txt");
  });
});
