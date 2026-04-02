import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../app/lib/utils";

describe("renderMarkdown", () => {
  it("renders markdown tables and horizontal rules using standard HTML tags", () => {
    const html = renderMarkdown([
      "| 姓名 | 年龄 |",
      "|------|------|",
      "| 张三 | 28 |",
      "",
      "---"
    ].join("\n"));

    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<hr>");
  });

  it("escapes raw html while preserving markdown formatting", () => {
    const html = renderMarkdown("# 标题\n\n<script>alert(1)</script>\n\n**加粗**");

    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<strong>加粗</strong>");
  });
});
