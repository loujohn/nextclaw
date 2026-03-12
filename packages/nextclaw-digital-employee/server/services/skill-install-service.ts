import { SkillInstallationRepository, type SkillInstallationView } from "../repositories/skill-installation-repository";
import { NextclawEngineGateway } from "../engine/NextclawEngineGateway";

export class SkillInstallService {
  constructor(
    private readonly repo: SkillInstallationRepository,
    private readonly gateway: NextclawEngineGateway
  ) {}

  async importFromLocalPath(sourcePath: string): Promise<SkillInstallationView> {
    const imported = await this.gateway.importFromLocalPath(sourcePath);
    return this.repo.upsert({
      skillName: imported.skillName,
      sourceType: imported.sourceType,
      sourceUri: imported.sourceUri,
      installPath: imported.installPath,
      metadata: {}
    });
  }

  async importFromGit(sourceUri: string): Promise<SkillInstallationView> {
    const imported = await this.gateway.importFromGit(sourceUri);
    return this.repo.upsert({
      skillName: imported.skillName,
      sourceType: imported.sourceType,
      sourceUri: imported.sourceUri,
      installPath: imported.installPath,
      metadata: {}
    });
  }
}
