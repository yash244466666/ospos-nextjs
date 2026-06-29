import { requirePermission } from "@/lib/auth/with-permission";
import { getEmployee, listAllPermissions, listEmployeeGrants } from "@/lib/persons/repository";
import EmployeeForm from "@/components/employees/employee-form";

export default async function EmployeeEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("employees");
  const { id } = await params;
  const personId = parseInt(id, 10);
  const employee = personId > 0 ? getEmployee(personId) : null;
  const allPerms = listAllPermissions();
  const currentGrants = personId > 0 ? listEmployeeGrants(personId).map((g) => g.permissionId) : [];
  const grantsByModule = new Map<string, { permissionId: string; moduleName: string }[]>();
  for (const p of allPerms) {
    if (!grantsByModule.has(p.moduleId)) grantsByModule.set(p.moduleId, []);
    grantsByModule.get(p.moduleId)!.push({ permissionId: p.permissionId, moduleName: p.moduleName });
  }
  return (
    <EmployeeForm
      initial={employee}
      permissions={Array.from(grantsByModule.entries()).map(([moduleId, perms]) => ({ moduleId, perms }))}
      currentGrants={currentGrants}
    />
  );
}