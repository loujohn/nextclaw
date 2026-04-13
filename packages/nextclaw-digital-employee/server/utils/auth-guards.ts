import { createError, type H3Event } from "h3";
import type { UserContext, UserRole } from "../../shared/auth-types";

export function requireAuth(event: H3Event): UserContext {
  const user = event.context.user as UserContext | undefined;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }
  return user;
}

export function requireRole(event: H3Event, ...roles: UserRole[]): UserContext {
  const user = requireAuth(event);
  if (!roles.includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: "Insufficient permissions" });
  }
  return user;
}

export function requireDepartmentAccess(event: H3Event, departmentId: string): UserContext {
  const user = requireAuth(event);
  if (user.role === "admin") return user;
  if (user.role === "manager" && user.departmentId === departmentId) return user;
  throw createError({ statusCode: 403, statusMessage: "No access to this department" });
}
