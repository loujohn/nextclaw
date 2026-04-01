import { describe, it, expect } from "vitest";

describe("logger module", () => {
  it("loads createLogger without missing dependency errors", async () => {
    const mod = await import("../server/utils/logger");
    expect(typeof mod.createLogger).toBe("function");
  });
});
