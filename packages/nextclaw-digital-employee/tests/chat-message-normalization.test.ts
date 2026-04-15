import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../server/db/knex";
import {
  normalizeChatMessageContent,
  normalizeChatMessageTimestamp,
} from "../server/chat/chat-message-normalization";

describe("chat-message-normalization", () => {
  it("normalizes ISO timestamps into DM-compatible datetime strings", () => {
    const iso = "2026-04-14T08:09:10.123Z";

    expect(normalizeChatMessageTimestamp(iso)).toBe(formatTimestamp(new Date(iso)));
    expect(normalizeChatMessageTimestamp("2026-04-14 16:09:10")).toBe("2026-04-14 16:09:10");
  });

  it("renders multimodal message parts as markdown text plus images", () => {
    const content = normalizeChatMessageContent([
      { type: "text", text: "请看这张图" },
      { type: "image_url", image_url: { url: "https://example.com/report.png" }, alt_text: "报表截图" },
      { type: "input_image", image_url: "https://example.com/chart.png" }
    ]);

    expect(content).toBe([
      "请看这张图",
      "![报表截图](https://example.com/report.png)",
      "![image](https://example.com/chart.png)"
    ].join("\n\n"));
  });
});