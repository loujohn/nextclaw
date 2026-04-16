import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EmployeeUploadFileService } from "../server/services/employee-upload-file-service";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createService(params?: { referencedRelativePaths?: string[] }) {
  const homeDir = mkdtempSync(join(tmpdir(), "digital-employee-upload-test-"));
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
      return (params?.referencedRelativePaths ?? []).map((relativePath) => ({
        relativePath,
        attachment: {
          originalName: "报价单.md",
          storedName: relativePath.split("/").pop() ?? "",
          relativePath,
          mimeType: "text/markdown",
          size: 10,
          previewType: "text" as const,
          uploadDate: "2026-04-14",
          sourceSessionKey: "session-1",
          sourceMessageId: "message-1"
        }
      }));
    }
  };
  return {
    homeDir,
    service: new EmployeeUploadFileService(employeeRepo as any, chatMessageRepo as any, homeDir)
  };
}

describe("EmployeeUploadFileService", () => {
  it("deletes unsent uploaded files from employee workspace", async () => {
    const { service, homeDir } = createService();
    const [saved] = await service.saveUploadedFiles({
      employeeId: "employee-1",
      files: [{
        filename: "报价单.md",
        data: Buffer.from("# 报价单", "utf-8"),
        mimeType: "text/markdown"
      }]
    });

    const absolutePath = join(homeDir, "agents", "demo-agent", saved.relativePath);
    expect(existsSync(absolutePath)).toBe(true);

    const result = await service.deleteUploadedFile({
      employeeId: "employee-1",
      relativePath: saved.relativePath
    });

    expect(result.deleted).toBe(true);
    expect(existsSync(absolutePath)).toBe(false);
  });

  it("rejects deleting uploaded files that are already referenced by chat messages", async () => {
    const { service } = createService({
      referencedRelativePaths: ["uploadFile/2026-04-14/up_ref_报价单.md"]
    });

    await expect(service.deleteUploadedFile({
      employeeId: "employee-1",
      relativePath: "uploadFile/2026-04-14/up_ref_报价单.md"
    })).rejects.toThrow("该附件已关联会话消息，不能删除");
  });
});