// Re-exports daemon client utilities from the modular daemon package.
export { createClient, type DaemonClient } from "./connection.js";
export { ensureDaemonClient } from "./lifecycle.js";
