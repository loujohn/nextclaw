export type ErrorCategory = "config" | "integration" | "runtime" | "model" | "data";

export class PlatformError extends Error {
  readonly category: ErrorCategory;
  readonly hint?: string;

  constructor(
    category: ErrorCategory,
    message: string,
    hint?: string,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "PlatformError";
    this.category = category;
    this.hint = hint;
  }

  toJSON() {
    return {
      category: this.category,
      message: this.message,
      hint: this.hint,
    };
  }
}

export class ConfigError extends PlatformError {
  constructor(message: string, hint?: string, cause?: unknown) {
    super("config", message, hint, cause);
    this.name = "ConfigError";
  }
}

export class IntegrationError extends PlatformError {
  constructor(message: string, hint?: string, cause?: unknown) {
    super("integration", message, hint, cause);
    this.name = "IntegrationError";
  }
}

export class RuntimeError extends PlatformError {
  constructor(message: string, hint?: string, cause?: unknown) {
    super("runtime", message, hint, cause);
    this.name = "RuntimeError";
  }
}

export class ModelError extends PlatformError {
  constructor(message: string, hint?: string, cause?: unknown) {
    super("model", message, hint, cause);
    this.name = "ModelError";
  }
}

export class DataError extends PlatformError {
  constructor(message: string, hint?: string, cause?: unknown) {
    super("data", message, hint, cause);
    this.name = "DataError";
  }
}

export function classifyError(err: unknown): PlatformError {
  if (err instanceof PlatformError) return err;

  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("api key") || lower.includes("apikey") || lower.includes("unauthorized") || lower.includes("401")) {
    return new ConfigError(msg, "Check your API key configuration in Secrets.", err);
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("quota")) {
    return new IntegrationError(msg, "API rate limit reached. Please wait or check your plan quota.", err);
  }
  if (lower.includes("timeout") || lower.includes("econnrefused") || lower.includes("enotfound")) {
    return new IntegrationError(msg, "Network issue detected. Check your internet connection or the provider endpoint.", err);
  }
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist"))) {
    return new ModelError(msg, "The specified model is not available. Check model name and provider support.", err);
  }
  if (lower.includes("context length") || lower.includes("token limit") || lower.includes("too long")) {
    return new ModelError(msg, "Input exceeds the model context window. Try reducing input length.", err);
  }
  if (lower.includes("unique constraint") || lower.includes("sqlite_constraint") || lower.includes("duplicate")) {
    return new DataError(msg, "A record with this identifier already exists.", err);
  }

  return new RuntimeError(msg, undefined, err);
}
