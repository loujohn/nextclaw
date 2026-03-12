import { getPlatformContext } from "../../runtime/platform-context";
import { buildSkillCatalogEntries } from "../../../shared/ui-models";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const available = await ctx.gateway.listAvailableSkills();
  const installed = await ctx.skillInstallationRepo.list();
  const employees = await ctx.employeeRepo.list();
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const skillBindings = (await ctx.employeeSkillRepo.listAll()).map((binding) => ({
    employeeId: binding.employeeId,
    employeeName: employeeMap.get(binding.employeeId)?.name ?? binding.employeeId,
    skillName: binding.skillName
  }));
  return {
    ok: true,
    data: buildSkillCatalogEntries({
      availableSkills: available,
      installations: installed,
      skillBindings
    })
  };
});
