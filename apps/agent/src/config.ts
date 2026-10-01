import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export type Config = { server: string; projectId: string; key: string; name?: string };
export const HOME = process.env.NOCOREACH_AGENT_HOME || join(homedir(), '.nocoreach-agent');
const file = join(HOME, 'config.json');
export function loadConfig(): Config | null { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; }
// Saved with mode 0600; the key is the computer's credential and never goes to the agent process.
export function saveConfig(c: Config) { mkdirSync(HOME, { recursive: true }); writeFileSync(file, JSON.stringify(c, null, 2), { mode: 0o600 }); chmodSync(file, 0o600); }
