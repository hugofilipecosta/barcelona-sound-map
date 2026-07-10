import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(path = ".env") {
  const fullPath = resolve(process.cwd(), path);
  if (!existsSync(fullPath)) return false;

  const lines = readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}
