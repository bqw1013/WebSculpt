/** Prints a value as pretty-printed JSON to stdout. */
export function printJson(data: any): void {
	console.log(JSON.stringify(data, null, 2));
}
