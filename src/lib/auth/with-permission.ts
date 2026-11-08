import { redirect } from "next/navigation";
import { auth } from "./options";
import { hasGrant, hasModuleGrant } from "./rbac";
import { loadConfig } from "@/lib/config";

/**
 * `Secure_Controller::__construct`: require the module grant AND, when a
 * submodule is supplied, its grant. Upstream does not short-circuit on
 * `isAdmin()`, so neither do we.
 */
export async function requirePermission(moduleId: string, submoduleId?: string) {
  await loadConfig();
  const session = await auth();
  if (!session?.user?.personId) {
    redirect("/login");
    return null;
  }
  const personId = session.user.personId;
  if (
    !(await hasModuleGrant(moduleId, personId)) ||
    (submoduleId !== undefined && !(await hasModuleGrant(submoduleId, personId)))
  ) {
    redirect(`/no_access/${moduleId}${submoduleId ? `/${submoduleId}` : ""}`);
    return null;
  }
  return session;
}

/** JSON-safe variant for route handlers: 401 instead of a redirect. */
export async function requirePermissionApi(moduleId: string, submoduleId?: string) {
  await loadConfig();
  const session = await auth();
  if (!session?.user?.personId) {
    return {
      ok: false as const,
      status: 401,
      body: { success: false, message: "Session expired. Please log in again." },
    };
  }
  const personId = session.user.personId;
  if (
    !(await hasModuleGrant(moduleId, personId)) ||
    (submoduleId !== undefined && !(await hasModuleGrant(submoduleId, personId)))
  ) {
    return {
      ok: false as const,
      status: 401,
      body: { success: false, message: "Session expired. Please log in again." },
    };
  }
  return { ok: true as const, session };
}


/** Exact-grant gate used by report actions (`Employee::has_grant`). */
export async function requireGrant(permissionId: string) {
  await loadConfig();
  const session = await auth();
  if (!session?.user?.personId) {
    redirect("/login");
    return null;
  }
  if (!(await hasGrant(permissionId, session.user.personId))) {
    const [moduleId, ...rest] = permissionId.split("_");
    redirect(`/no_access/${moduleId}${rest.length ? `/${rest.join("_")}` : ""}`);
    return null;
  }
  return session;
}

export async function requireGrantApi(permissionId: string) {
  await loadConfig();
  const session = await auth();
  if (!session?.user?.personId) {
    return {
      ok: false as const,
      status: 401,
      body: { success: false, message: "Session expired. Please log in again." },
    };
  }
  if (!(await hasGrant(permissionId, session.user.personId))) {
    return {
      ok: false as const,
      status: 401,
      body: { success: false, message: "Session expired. Please log in again." },
    };
  }
  return { ok: true as const, session };
}
