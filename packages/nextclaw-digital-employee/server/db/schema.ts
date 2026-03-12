export const PLATFORM_TABLES = {
  employees: "employees",
  employeeSkills: "employee_skills",
  employeeSchedules: "employee_schedules",
  skillInstallations: "skill_installations",
  integrationConnections: "integration_connections",
  runRecords: "run_records",
  runEvents: "run_events"
} as const;

export type EmployeeRecord = {
  id: string;
  name: string;
  code: string;
  description: string;
  system_prompt: string;
  status: string;
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
