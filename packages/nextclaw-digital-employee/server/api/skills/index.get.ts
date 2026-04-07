import { getPlatformContext } from "../../runtime/platform-context";
import { buildSkillCatalogEntries } from "../../../shared/ui-models";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const [available, installed, skillBindings] = await Promise.all([
    ctx.gateway.listAvailableSkills(),
    ctx.skillInstallationRepo.list(),
    ctx.employeeSkillRepo.listAllWithEmployeeNames()
  ]);
  return {
    ok: true,
    data: buildSkillCatalogEntries({
      availableSkills: available,
      installations: installed,
      skillBindings
    })
  };
});
