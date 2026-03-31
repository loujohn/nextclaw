import { createConsola } from "consola";

const root = createConsola({
  level: process.env.LOG_LEVEL ? Number(process.env.LOG_LEVEL) : 3,
});

export function createLogger(tag: string) {
  return root.withTag(tag);
}

export type Logger = ReturnType<typeof createLogger>;
