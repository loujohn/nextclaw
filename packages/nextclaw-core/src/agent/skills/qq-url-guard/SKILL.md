---
name: qq-url-guard
name_zh: QQ 链接屏蔽防护
description: 用于 QQ 回复场景，当内容含类 URL 文本（如 xx.xx、USER.md、Markdown 链接或 http URL）可能触发 40034028 拦截时使用。
---

# QQ URL Guard

Use this skill for QQ outbound replies (private/group/guild) when content may contain URL-like tokens.

## Why

QQ may reject messages with:
- `code(40034028)`
- `请求参数不允许包含url`

Common risky patterns:
- `xx.xx` (domain-like text)
- `USER.md` / `README.md` (file-like token treated as URL)
- markdown links: `[text](https://...)`
- plain URLs: `https://...` / `www...`

## Output Rules

1. Prefer plain text over markdown for QQ replies.
2. Avoid raw URL-like strings in final QQ message.
3. Replace risky parts with safe placeholders when needed:
   - URL -> `[link]`
   - `.md` token -> `[file]`
4. Keep the sentence readable after replacement.

## Safe Rewrite Examples

- `Source: USER.md` -> `Source: [file]`
- `详情见 https://example.com` -> `详情见 [link]`
- `[文档](https://example.com)` -> `文档（链接已省略）`

## Operator Hint

If QQ send fails with `40034028`, retry with sanitized plain text immediately.
