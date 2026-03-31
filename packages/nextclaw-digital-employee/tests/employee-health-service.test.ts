import { describe, it, expect } from "vitest";
import { buildHealthDetail, HealthStatus } from "../shared/ui-models";

describe("buildHealthDetail", () => {
  it("returns healthy when all checks pass", () => {
    const result = buildHealthDetail({ hasApiKey: true, hasRecentFailure: false, isActive: true });
    expect(result.status).toBe(HealthStatus.Healthy);
    expect(result.reasons).toEqual([]);
  });

  it("returns error when no API key", () => {
    const result = buildHealthDetail({ hasApiKey: false, hasRecentFailure: false, isActive: true });
    expect(result.status).toBe(HealthStatus.Error);
    expect(result.reasons).toContain("未配置模型 API Key");
  });

  it("returns error when inactive", () => {
    const result = buildHealthDetail({ hasApiKey: true, hasRecentFailure: false, isActive: false });
    expect(result.status).toBe(HealthStatus.Error);
    expect(result.reasons).toContain("员工已停用");
  });

  it("returns warning when recent failure exists", () => {
    const result = buildHealthDetail({ hasApiKey: true, hasRecentFailure: true, isActive: true });
    expect(result.status).toBe(HealthStatus.Warning);
    expect(result.reasons).toContain("近期存在运行失败");
  });

  it("returns error with multiple reasons", () => {
    const result = buildHealthDetail({ hasApiKey: false, hasRecentFailure: true, isActive: false });
    expect(result.status).toBe(HealthStatus.Error);
    expect(result.reasons.length).toBe(3);
  });
});
