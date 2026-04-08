import { CheckCircle2, XCircle, AlertTriangle } from "lucide-vue-next";

export type RoleItem = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  memberCount: number;
  isSystem: boolean;
};

export type PermissionGroup = {
  group: string;
  items: Array<{ key: string; label: string; enabled: boolean }>;
};

export type AuditLogItem = {
  id: string;
  action: string;
  operator: string;
  target: string;
  ip: string;
  time: string;
  result: "success" | "failure" | "warning";
};

export type DataPolicyItem = {
  id: string;
  category: string;
  description: string;
  level: "high" | "medium" | "low";
  status: "active" | "inactive";
};

export const INITIAL_ROLES: RoleItem[] = [
  {
    id: "r1",
    name: "超级管理员",
    description: "拥有所有系统权限，可管理所有模块和用户",
    permissions: ["user:*", "employee:*", "skill:*", "integration:*", "security:*", "audit:*"],
    memberCount: 1,
    isSystem: true
  },
  {
    id: "r2",
    name: "部门管理员",
    description: "管理本部门员工、技能和运行记录",
    permissions: ["employee:read", "employee:write", "skill:read", "skill:write", "run:read"],
    memberCount: 5,
    isSystem: false
  },
  {
    id: "r3",
    name: "普通成员",
    description: "仅可查看员工列表和运行记录，不可修改",
    permissions: ["employee:read", "run:read", "skill:read"],
    memberCount: 23,
    isSystem: false
  },
  {
    id: "r4",
    name: "审计员",
    description: "可查看所有操作日志和数据安全报告",
    permissions: ["audit:read", "employee:read", "security:read"],
    memberCount: 2,
    isSystem: false
  }
];

export const INITIAL_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: "员工管理",
    items: [
      { key: "employee:read", label: "查看员工", enabled: true },
      { key: "employee:write", label: "编辑员工", enabled: true },
      { key: "employee:delete", label: "删除员工", enabled: false }
    ]
  },
  {
    group: "技能管理",
    items: [
      { key: "skill:read", label: "查看技能", enabled: true },
      { key: "skill:write", label: "安装/编辑技能", enabled: true },
      { key: "skill:delete", label: "删除技能", enabled: false }
    ]
  },
  {
    group: "集成配置",
    items: [
      { key: "integration:read", label: "查看集成", enabled: true },
      { key: "integration:write", label: "编辑集成配置", enabled: false }
    ]
  },
  {
    group: "安全与审计",
    items: [
      { key: "security:read", label: "查看安全策略", enabled: false },
      { key: "security:write", label: "修改安全策略", enabled: false },
      { key: "audit:read", label: "查看审计日志", enabled: false }
    ]
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  { id: "l1", action: "登录系统", operator: "admin@example.com", target: "系统", ip: "192.168.1.10", time: "2026-03-26 10:32:15", result: "success" },
  { id: "l2", action: "修改员工配置", operator: "manager@example.com", target: "数字员工 #E007", ip: "192.168.1.22", time: "2026-03-26 10:18:44", result: "success" },
  { id: "l3", action: "删除技能", operator: "user@example.com", target: "Skill: web-search", ip: "10.0.0.5", time: "2026-03-26 09:55:01", result: "failure" },
  { id: "l4", action: "导出数据报告", operator: "auditor@example.com", target: "运行记录", ip: "192.168.2.8", time: "2026-03-26 09:40:30", result: "success" },
  { id: "l5", action: "修改角色权限", operator: "admin@example.com", target: "角色: 普通成员", ip: "192.168.1.10", time: "2026-03-25 18:02:11", result: "warning" },
  { id: "l6", action: "登录失败", operator: "unknown@evil.com", target: "系统", ip: "203.0.113.44", time: "2026-03-25 17:45:33", result: "failure" }
];

export const INITIAL_DATA_POLICIES: DataPolicyItem[] = [
  { id: "p1", category: "访问控制", description: "强制多因素认证（MFA）登录", level: "high", status: "active" },
  { id: "p2", category: "数据加密", description: "系统提示词及配置数据静态加密存储", level: "high", status: "active" },
  { id: "p3", category: "数据传输", description: "API 通信强制使用 TLS 1.2+", level: "high", status: "active" },
  { id: "p4", category: "日志留存", description: "操作日志至少保留 90 天", level: "medium", status: "active" },
  { id: "p5", category: "数据脱敏", description: "日志中敏感字段（密钥、凭证）自动脱敏", level: "medium", status: "active" },
  { id: "p6", category: "访问审计", description: "关键操作（删除/修改集成）二次确认", level: "medium", status: "inactive" },
  { id: "p7", category: "数据导出", description: "数据导出需管理员审批", level: "low", status: "inactive" }
];

export const RESULT_STYLES: Record<string, { badge: string; icon: typeof CheckCircle2 }> = {
  success: { badge: "bg-primary/10 text-primary", icon: CheckCircle2 },
  failure: { badge: "bg-destructive/10 text-destructive", icon: XCircle },
  warning: { badge: "bg-warning/10 text-warning-foreground", icon: AlertTriangle }
};

export const LEVEL_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warning/10 text-warning-foreground",
  low: "bg-muted text-muted-foreground"
};

export const LEVEL_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低"
};
