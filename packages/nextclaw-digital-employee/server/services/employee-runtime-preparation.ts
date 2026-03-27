import { ensureEmployeeWorkspace } from "../engine/employee-workspace";
import type { EmployeeView } from "../repositories/employee-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";
import { SkillInstallationRepository } from "../repositories/skill-installation-repository";

export async function prepareEmployeeRuntime(params: {
  employee: EmployeeView;
  employeeSkillRepo: EmployeeSkillRepository;
  skillInstallationRepo?: SkillInstallationRepository;
  homeDir: string;
  workspaceDir: string;
}): Promise<{
  workspace: string;
  skillNames: string[];
}> {
  const employeeSkills = await params.employeeSkillRepo.listByEmployeeId(params.employee.id);

  const installations = params.skillInstallationRepo
    ? await params.skillInstallationRepo.list()
    : [];

  const disabledGlobally = new Set(
    installations.filter((i) => !i.enabled).map((i) => i.skillName)
  );

  const globallyEnabled = new Set(
    installations.filter((i) => i.enabled).map((i) => i.skillName)
  );

  const boundSkills = employeeSkills
    .filter((skill) => skill.enabled && !disabledGlobally.has(skill.skillName))
    .map((skill) => skill.skillName);

  const skillNames = [...new Set([...boundSkills, ...globallyEnabled])];

  const workspace = ensureEmployeeWorkspace(
    params.homeDir,
    {
      code: params.employee.code,
      name: params.employee.name,
      description: params.employee.description,
      systemPrompt: params.employee.systemPrompt
    },
    params.workspaceDir
  );

  return { workspace, skillNames };
}
