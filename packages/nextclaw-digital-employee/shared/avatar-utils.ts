export const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #ec4899, #f472b6)",
  "linear-gradient(135deg, #06b6d4, #22d3ee)",
  "linear-gradient(135deg, #f59e0b, #fbbf24)",
  "linear-gradient(135deg, #8b5cf6, #a78bfa)",
  "linear-gradient(135deg, #10b981, #34d399)",
] as const;

export function pickAvatarGradient(id: string): string {
  const hash = id.charCodeAt(0) + id.charCodeAt(id.length - 1);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}
