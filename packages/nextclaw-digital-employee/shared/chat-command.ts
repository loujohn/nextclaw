const RESET_COMMAND_NAMES = new Set(["new", "reset"]);

export function isConversationResetCommand(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return false;
  }
  const commandBody = trimmed.slice(1).trim();
  if (!commandBody) {
    return false;
  }
  const [commandName] = commandBody.split(/\s+/, 1);
  return RESET_COMMAND_NAMES.has((commandName ?? "").trim().toLowerCase());
}
