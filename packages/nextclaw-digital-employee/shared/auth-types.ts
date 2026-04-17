export type UserRole = "admin" | "manager" | "user";

export type AuthProvider = "keycloak" | "local";

export type UserSource = "manual" | "sync";

export type UserView = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: UserRole;
  isActive: boolean;
  authProvider: AuthProvider;
  userSource: UserSource;
  syncProvider: string | null;
  externalUserId: string | null;
  externalUserName: string;
  externalName: string;
  externalPostName: string;
  externalRoleName: string;
  externalDingTalkId: string;
  externalPhone: string;
  externalUserType: string;
  departmentId: string | null;
  humanEmployeeId: string | null;
  lastLoginAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserContext = {
  id: string;
  keycloakSub: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: UserRole;
  isActive: boolean;
  departmentId: string | null;
  humanEmployeeId: string | null;
};

export type UserListPayload = {
  ok: boolean;
  data: UserView[];
  total: number;
  page: number;
  pageSize: number;
};
export type UserPayload = { ok: boolean; data: UserView };
export type AuthMePayload = { ok: boolean; data: UserView };

export type UpdateUserInput = {
  role?: UserRole;
  isActive?: boolean;
  username?: string;
  displayName?: string;
  email?: string;
  humanEmployeeId?: string | null;
  departmentId?: string | null;
};
