export const PLATFORM_TABLES = {
  departments: "departments",
  employees: "employees",
  humanEmployees: "human_employees",
  employeeSkills: "employee_skills",
  employeeSchedules: "employee_schedules",
  employeeScheduleJobs: "employee_schedule_jobs",
  skillInstallations: "skill_installations",
  integrationConnections: "integration_connections",
  runRecords: "run_records",
  runEvents: "run_events",
  chatSessions: "chat_sessions",
  chatMessages: "chat_messages",
  orgSyncConfig: "org_sync_config",
  secrets: "secrets",
  users: "users",
} as const;

export type DepartmentRecord = {
  id: string;
  name: string;
  description: string;
  /** 外部系统（如钉钉）的部门 ID，用于数据同步时的匹配 key */
  external_id: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * 人类员工记录（来自组织架构同步，如钉钉）。
 * 与"数字员工"（employees 表）并列挂载在部门下，通过不同表区分类型。
 */
export type HumanEmployeeRecord = {
  id: string;
  /** 外部系统用户 ID（如钉钉 userid） */
  external_id: string;
  name: string;
  avatar: string;
  /** 职位/职称 */
  title: string;
  /** 工号 */
  job_number: string;
  /** 是否在职 */
  active: number;
  /** 是否管理员 */
  is_admin: number;
  /** 是否 boss */
  is_boss: number;
  /** 主部门（FK → departments.id） */
  department_id: string | null;
  /** 外部系统中该用户所属的所有部门 ID（JSON 数组字符串，供参考） */
  external_dept_ids: string;
  /** 外部系统 unionid */
  unionid: string;
  created_at: string;
  updated_at: string;
};

export type EmployeeRecord = {
  id: string;
  name: string;
  code: string;
  description: string;
  system_prompt: string;
  model: string;
  status: string;
  department_id: string | null;
  webhook_enabled: number;
  webhook_secret: string | null;
  created_at: string;
  updated_at: string;
};

export type SkillInstallationRecord = {
  id: string;
  skill_name: string;
  source_type: string;
  source_uri: string;
  version: string | null;
  install_path: string;
  enabled: number | boolean;
  metadata_json: string;
  created_at: string;
  updated_at: string;
};

export type RunRecord = {
  id: string;
  employee_id: string | null;
  session_key: string | null;
  trigger_type: string;
  trigger_source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary: string;
  result_json: string;
};

export type RunEventRecord = {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload_json: string;
  created_at: string;
};

export type ChatSessionRecord = {
  id: string;
  employee_id: string;
  session_key: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRecord = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  metadata_json: string;
  created_at: string;
};

/**
 * 组织同步配置（单行，主键固定为 "default"）。
 * 存储钉钉 AppKey/AppSecret、定时任务触发时间及是否开启。
 */
export type SecretRecord = {
  id: string;
  key: string;
  value: string;
  scope: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type UserRecord = {
  id: string;
  keycloak_sub: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string;
  role: string;
  is_active: number;
  user_source: string;
  sync_provider: string | null;
  external_user_id: string | null;
  external_user_name: string;
  external_name: string;
  external_post_name: string;
  external_role_name: string;
  external_dingtalk_id: string;
  external_phone: string;
  external_user_type: string;
  department_id: string | null;
  human_employee_id: string | null;
  preferences: string;
  /** "keycloak" | "local" */
  auth_provider: string;
  password_hash: string | null;
  last_login_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgSyncConfigRecord = {
  id: string; // 固定 "default"
  app_key: string;
  app_secret: string;
  /** cron 表达式，如 "0 1 * * *" */
  cron_expr: string;
  /** 是否开启定时同步 */
  enabled: number;
  /** 上次运行时间 */
  last_run_at: string | null;
  /** 上次运行结果 "success" | "failure" | null */
  last_run_status: string | null;
  /** 上次运行摘要（成功/失败信息）*/
  last_run_summary: string;
  updated_at: string;
};
