import { describe, expect, it, vi } from "vitest";
import { ChatMessageRepository } from "../server/repositories/chat-message-repository";

function createQueryBuilder(rows: unknown[]) {
  return {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(rows)
  };
}

describe("ChatMessageRepository", () => {
  it("enriches attachment references with source createdAt", async () => {
    const rows = [{
      message_id: "message-1",
      session_key: "session-1",
      source_text: "请看附件",
      source_created_at: "2026-04-15T08:30:00.000Z",
      metadata_json: JSON.stringify({
        attachments: [{
          originalName: "报价单.pdf",
          storedName: "up_abc_报价单.pdf",
          relativePath: "uploadFile/2026-04-15/up_abc_报价单.pdf",
          mimeType: "application/pdf",
          size: 1024,
          previewType: "pdf",
          uploadDate: "2026-04-15"
        }]
      })
    }];
    const builder = createQueryBuilder(rows);
    const db = vi.fn().mockReturnValue(builder);
    const repository = new ChatMessageRepository(db as any);

    const references = await repository.listAttachmentReferencesByEmployeeId("employee-1");

    expect(references).toHaveLength(1);
    expect(references[0]?.attachment).toEqual(expect.objectContaining({
      sourceText: "请看附件",
      sourceSessionKey: "session-1",
      sourceMessageId: "message-1",
      sourceCreatedAt: "2026-04-15T08:30:00.000Z"
    }));
  });
});