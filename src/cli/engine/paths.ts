import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Returns the absolute path to the built-in commands directory.
 * This works in both development (src/cli/engine) and production (dist/cli/engine)
 * because the `builtin` folder is always copied to sit next to the engine file.
 */
export function getBuiltinCommandsDir(): string {
	return join(__dirname, "..", "builtin");
}
