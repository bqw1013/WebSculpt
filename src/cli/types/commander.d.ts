// Extend Commander's Command type to attach domain-source metadata for custom help formatting.
export {};

declare module "commander" {
	interface Command {
		_domainSource?: string;
	}
}
