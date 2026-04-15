/** Prints a value as pretty-printed JSON to stdout. */
export function printJson(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}
