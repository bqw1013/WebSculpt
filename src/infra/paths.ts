import { homedir } from "node:os";
import { join } from "node:path";

/** Root directory for all WebSculpt user data. */
export const WEBSCULPT_DIR = join(homedir(), ".websculpt");

/** Directory where user-defined commands are stored. */
export const USER_COMMANDS_DIR = join(WEBSCULPT_DIR, "commands");

/** Path to the global WebSculpt configuration file. */
export const CONFIG_FILE = join(WEBSCULPT_DIR, "config.json");

/** Path to the append-only execution log file. */
export const LOG_FILE = join(WEBSCULPT_DIR, "log.jsonl");

/** Path to the append-only audit log file. */
export const AUDIT_FILE = join(WEBSCULPT_DIR, "audit.jsonl");

/** Path to the persistent registry index file. */
export const INDEX_PATH = join(WEBSCULPT_DIR, "registry-index.json");
