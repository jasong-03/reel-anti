import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Lightweight usage logging (Phase 4): append one JSONL line per agent turn —
 * what was asked, what ops were emitted, which model/tier handled it, and
 * whether a self-correction was needed. This is the raw material for finding
 * failing prompts during the pilot. Swap the sink for a DB/warehouse later.
 */
export interface UsageEntry {
  message: string;
  provider: string;
  model: string;
  tier: string;
  attempts: number;
  opCount: number;
  ops: string[];
  destructiveCount: number;
  ok: boolean;
  error?: string;
}

const LOG_DIR = path.join(process.cwd(), ".data");
const LOG_FILE = path.join(LOG_DIR, "agent-usage.jsonl");

export const logUsage = async (entry: UsageEntry): Promise<void> => {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    await fs.appendFile(LOG_FILE, line, "utf8");
  } catch {
    // Logging must never break the request path.
  }
};
