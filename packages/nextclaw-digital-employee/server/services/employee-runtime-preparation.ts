import { ensureEmployeeWorkspace, syncEmployeeSkills } from "../engine/employee-workspace";
import type { EmployeeView } from "../repositories/employee-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";

export async function prepareEmployeeRuntime(params: {
  employee: EmployeeView;
  employeeSkillRepo: EmployeeSkillRepository;
  homeDir: string;
  workspaceDir: string;
}): Promise<{
  workspace: string;
  skillNames: string[];
}> {
  const employeeSkills = await params.employeeSkillRepo.listByEmployeeId(params.employee.id);
  const skillNames = employeeSkills.filter((skill) => skill.enabled).map((skill) => skill.skillName);
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

  if (skillNames.length > 0) {
    syncEmployeeSkills(params.homeDir, params.employee.code, skillNames, params.workspaceDir);
  }

  return {
    workspace,
    skillNames
  };
}
