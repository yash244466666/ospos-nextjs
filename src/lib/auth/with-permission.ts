import { redirect } from "next/navigation";
import { auth } from "./options";
import { hasModuleGrant, isAdmin } from "./rbac";

export async function requirePermission(moduleId: string, submoduleId?: string) {
  const session = await auth();
  if (!session?.user?.personId) {
    redirect("/login");
    return null;
  }
  const personId = session.user.personId;
  if (isAdmin(personId)) return session;
  const target = submoduleId ? `${moduleId}_${submoduleId}` : moduleId;
  if (!hasModuleGrant(moduleId, personId) && !hasModuleGrant(target, personId)) {
    redirect(`/no_access/${moduleId}${submoduleId ? `/${submoduleId}` : ""}`);
    return null;
  }
  return session;
}