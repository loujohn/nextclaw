import { describe, it, expect } from "vitest";
import {
  PlatformError,
  ConfigError,
  IntegrationError,
  RuntimeError,
  ModelError,
  DataError,
  classifyError,
} from "../server/errors/platform-errors";

describe("PlatformError hierarchy", () => {
  it("ConfigError has correct category", () => {
    const err = new ConfigError("missing key", "add it");
    expect(err.category).toBe("config");
    expect(err.hint).toBe("add it");
    expect(err).toBeInstanceOf(PlatformError);
  });

  it("IntegrationError has correct category", () => {
    expect(new IntegrationError("timeout").category).toBe("integration");
  });

  it("ModelError has correct category", () => {
    expect(new ModelError("not found").category).toBe("model");
  });

  it("DataError has correct category", () => {
    expect(new DataError("duplicate").category).toBe("data");
  });

  it("RuntimeError has correct category", () => {
    expect(new RuntimeError("unknown").category).toBe("runtime");
  });

  it("toJSON returns structured output", () => {
    const err = new ConfigError("bad key", "check secrets");
    expect(err.toJSON()).toEqual({
      category: "config",
      message: "bad key",
      hint: "check secrets",
    });
  });
});

describe("classifyError", () => {
  it("returns PlatformError as-is", () => {
    const original = new ConfigError("test");
    expect(classifyError(original)).toBe(original);
  });

  it("classifies API key errors as config", () => {
    const result = classifyError(new Error("Invalid API key"));
    expect(result.category).toBe("config");
  });

  it("classifies 401 as config", () => {
    const result = classifyError(new Error("Request failed with status 401"));
    expect(result.category).toBe("config");
  });

  it("classifies rate limit as integration", () => {
    const result = classifyError(new Error("Rate limit exceeded"));
    expect(result.category).toBe("integration");
  });

  it("classifies 429 as integration", () => {
    const result = classifyError(new Error("Error 429: too many requests"));
    expect(result.category).toBe("integration");
  });

  it("classifies timeout as integration", () => {
    const result = classifyError(new Error("Request timeout after 30s"));
    expect(result.category).toBe("integration");
  });

  it("classifies ECONNREFUSED as integration", () => {
    const result = classifyError(new Error("connect ECONNREFUSED 127.0.0.1:3000"));
    expect(result.category).toBe("integration");
  });

  it("classifies model not found as model", () => {
    const result = classifyError(new Error("Model gpt-5 does not exist"));
    expect(result.category).toBe("model");
  });

  it("classifies context length as model", () => {
    const result = classifyError(new Error("Context length exceeded, token limit is 8192"));
    expect(result.category).toBe("model");
  });

  it("classifies unique constraint as data", () => {
    const result = classifyError(new Error("UNIQUE constraint failed: duplicate key"));
    expect(result.category).toBe("data");
  });

  it("classifies unknown errors as runtime", () => {
    const result = classifyError(new Error("something unexpected"));
    expect(result.category).toBe("runtime");
  });

  it("handles non-Error values", () => {
    const result = classifyError("plain string error");
    expect(result).toBeInstanceOf(PlatformError);
    expect(result.category).toBe("runtime");
  });
});
