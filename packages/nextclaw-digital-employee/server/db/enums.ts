export const EmployeeStatus = {
  Active: "active",
  Inactive: "inactive",
  Archived: "archived",
} as const;
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];

export const RunStatus = {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const TriggerType = {
  Manual: "manual",
  Scheduled: "scheduled",
} as const;
export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

export const ScheduleKind = {
  Cron: "cron",
  Every: "every",
  Heartbeat: "heartbeat",
} as const;
export type ScheduleKind = (typeof ScheduleKind)[keyof typeof ScheduleKind];

export const EventType = {
  ToolCall: "tool_call",
  ToolResult: "tool_result",
  Reasoning: "reasoning",
  Message: "message",
  Error: "error",
  Heartbeat: "heartbeat",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];
