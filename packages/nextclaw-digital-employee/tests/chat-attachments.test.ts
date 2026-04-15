import { describe, expect, it } from "vitest";
import { buildAttachmentPromptText, normalizeChatAttachment } from "../server/chat/chat-attachments";

describe("chat attachments helpers", () => {
  it("normalizes uploaded attachment metadata", () => {
    const attachment = normalizeChatAttachment({
      originalName: "报价单.pdf",
      storedName: "up_abc_报价单.pdf",
      relativePath: "uploadFile/2026-04-14/up_abc_报价单.pdf",
      mimeType: "application/pdf",
      size: 2048,
      previewType: "pdf",
      uploadDate: "2026-04-14",
      sourceSessionKey: "session-1",
      sourceMessageId: "message-1"
    });

    expect(attachment).toEqual(expect.objectContaining({
      originalName: "报价单.pdf",
      storedName: "up_abc_报价单.pdf",
      relativePath: "uploadFile/2026-04-14/up_abc_报价单.pdf",
      previewType: "pdf",
      sourceSessionKey: "session-1",
      sourceMessageId: "message-1"
    }));
  });

  it("builds workspace-aware prompt text for attachments", () => {
    const prompt = buildAttachmentPromptText("请帮我分析这份报价", [
      {
        originalName: "报价单.pdf",
        storedName: "up_abc_报价单.pdf",
        relativePath: "uploadFile/2026-04-14/up_abc_报价单.pdf",
        mimeType: "application/pdf",
        size: 2048,
        previewType: "pdf",
        uploadDate: "2026-04-14"
      }
    ]);

    expect(prompt).toContain("请帮我分析这份报价");
    expect(prompt).toContain("用户上传了 1 个文件");
    expect(prompt).toContain("路径：uploadFile/2026-04-14/up_abc_报价单.pdf");
  });
});