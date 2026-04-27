import type { UserRole } from "./auth-types";

export const CHAT_SESSION_VIEW_ALL_PERMISSION = "chat-session:view-all" as const;

export type PlatformPermissionKey = typeof CHAT_SESSION_VIEW_ALL_PERMISSION;

export type SystemRoleDefinition = {
  key: UserRole;
  label: string;
  description: string;
};

export type PlatformPermissionDefinition = {
  key: PlatformPermissionKey;
  group: string;
  label: string;
  description: string;
  defaultEnabledRoles: UserRole[];
};

export type RolePermissionGroupItem = {
  key: PlatformPermissionKey;
  label: string;
  description: string;
  enabled: boolean;
};

export type RolePermissionGroup = {
  group: string;
  description: string;
  items: RolePermissionGroupItem[];
};

export type RolePermissionView = {
  id: UserRole;
  name: string;
  description: string;
  permissions: PlatformPermissionKey[];
  memberCount: number;
  isSystem: boolean;
};

export type RolePermissionSettingsPayload = {
  roles: RolePermissionView[];
  permissionGroups: RolePermissionGroup[];
};

export const SYSTEM_ROLE_DEFINITIONS: SystemRoleDefinition[] = [
  {
    key: "admin",
    label: "超级管理员",
    description: "拥有全局配置与跨用户会话审计能力。"
  },
  {
    key: "manager",
    label: "部门管理员",
    description: "负责本部门员工运营，默认仅查看自己发起的聊天会话。"
  },
  {
    key: "user",
    label: "普通成员",
    description: "默认只能查看和继续自己的聊天会话。"
  }
];

export const PLATFORM_PERMISSION_DEFINITIONS: PlatformPermissionDefinition[] = [
  {
    key: CHAT_SESSION_VIEW_ALL_PERMISSION,
    group: "会话管理",
    label: "查看全部聊天会话",
    description: "开启后可查看指定数字员工下所有用户的聊天会话列表，并访问任意会话历史。",
    defaultEnabledRoles: ["admin"]
  }
];

export function isPermissionEnabledByDefault(role: UserRole, permissionKey: PlatformPermissionKey): boolean {
  const definition = PLATFORM_PERMISSION_DEFINITIONS.find((item) => item.key === permissionKey);
  return definition?.defaultEnabledRoles.includes(role) ?? false;
}

export function getRoleDefinition(role: UserRole): SystemRoleDefinition {
  return SYSTEM_ROLE_DEFINITIONS.find((item) => item.key === role) ?? {
    key: role,
    label: role,
    description: ""
  };
}