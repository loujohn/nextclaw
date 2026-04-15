import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EmployeeWorkspaceFileService } from "../server/services/employee-workspace-file-service";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createService() {
  const homeDir = mkdtempSync(join(tmpdir(), "digital-employee-workspace-test-"));
  tempDirs.push(homeDir);
  const employeeRepo = {
    async getById() {
      return {
        id: "employee-1",
        code: "demo-agent",
        name: "Demo Agent",
        description: "",
        systemPrompt: "",
        model: "",
        status: "active",
        departmentId: null,
        createdAt: "",
        updatedAt: ""
      };
    }
  };
  const chatMessageRepo = {
    async listAttachmentReferencesByEmployeeId() {
      return [{
        relativePath: "uploadFile/2026-04-15/up_ref_测试文件xlsx.xlsx",
        attachment: {
          originalName: "测试文件xlsx.xlsx",
          storedName: "up_ref_测试文件xlsx.xlsx",
          relativePath: "uploadFile/2026-04-15/up_ref_测试文件xlsx.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size: 1024,
          previewType: "office" as const,
          uploadDate: "2026-04-15",
          sourceSessionKey: "session-1",
          sourceMessageId: "message-1",
          sourceText: "分析这个表格",
          sourceCreatedAt: "2026-04-15T08:30:00.000Z"
        }
      }];
    }
  };
  const workspaceDir = join(homeDir, "agents", "demo-agent");
  mkdirSync(join(workspaceDir, "memory"), { recursive: true });
  mkdirSync(join(workspaceDir, "unpacked_docx", "word", "media"), { recursive: true });
  mkdirSync(join(workspaceDir, "uploadFile", "2026-04-15"), { recursive: true });
  writeFileSync(join(workspaceDir, "memory", "MEMORY.md"), "# Memory", "utf-8");
  writeFileSync(join(workspaceDir, "AGENTS.md"), "# Agents", "utf-8");
  writeFileSync(join(workspaceDir, "unpacked_docx", "word", "media", "image1.png"), Buffer.from([1, 2, 3]));
  writeFileSync(join(workspaceDir, "uploadFile", "2026-04-15", "up_ref_测试文件xlsx.xlsx"), Buffer.from([1, 2, 3]));

  return {
    service: new EmployeeWorkspaceFileService(employeeRepo as any, chatMessageRepo as any, homeDir),
    workspaceDir
  };
}

describe("EmployeeWorkspaceFileService", () => {
  it("lists the real employee workspace tree with edit permissions and upload source labels", async () => {
    const { service } = createService();

    const tree = await service.listWorkspace({ employeeId: "employee-1" });
    const rootFile = tree.find((node) => node.kind === "file" && node.relativePath === "AGENTS.md");
    const memoryDir = tree.find((node) => node.kind === "directory" && node.relativePath === "memory");
    const uploadDir = tree.find((node) => node.kind === "directory" && node.relativePath === "uploadFile");
    const docxDir = tree.find((node) => node.kind === "directory" && node.relativePath === "unpacked_docx");

    expect(rootFile && rootFile.kind === "file" ? rootFile.editable : false).toBe(true);
    expect(memoryDir && memoryDir.kind === "directory"
      ? memoryDir.children.some((child) => child.kind === "file" && child.relativePath === "memory/MEMORY.md" && child.editable)
      : false).toBe(true);
    expect(uploadDir && uploadDir.kind === "directory"
      ? JSON.stringify(uploadDir).includes("测试文件xlsx.xlsx")
      : false).toBe(true);
    expect(uploadDir && uploadDir.kind === "directory"
      ? JSON.stringify(uploadDir).includes("来源：会话 session-1")
      : false).toBe(true);
    expect(docxDir && docxDir.kind === "directory"
      ? JSON.stringify(docxDir).includes("\"editableMode\":\"image\"")
      : false).toBe(false);
  });

  it("returns preview notice and source metadata for unsupported upload previews", async () => {
    const { service } = createService();

    const payload = await service.readFile({
      employeeId: "employee-1",
      relativePath: "uploadFile/2026-04-15/up_ref_测试文件xlsx.xlsx",
      rawUrl: "/raw",
      downloadUrl: "/download"
    });

    expect(payload.entry.name).toBe("测试文件xlsx.xlsx");
    expect(payload.entry.origin).toBe("upload");
    expect(payload.entry.canPreview).toBe(false);
    expect(payload.previewNotice).toContain("暂不支持预览");
    expect(payload.source?.sessionKey).toBe("session-1");
    expect(payload.source?.text).toBe("分析这个表格");
    expect(payload.source?.createdAt).toBe("2026-04-15T08:30:00.000Z");
  });

  it("allows saving non-upload text files while keeping upload files read-only", async () => {
    const { service, workspaceDir } = createService();

    await service.saveTextFile({
      employeeId: "employee-1",
      relativePath: "AGENTS.md",
      content: "updated"
    });

    expect(readFileSync(join(workspaceDir, "AGENTS.md"), "utf-8")).toBe("updated");
    await expect(service.saveTextFile({
      employeeId: "employee-1",
      relativePath: "uploadFile/2026-04-15/up_ref_测试文件xlsx.xlsx",
      content: "blocked"
    })).rejects.toThrow("当前文件不允许文本编辑");
  });

});