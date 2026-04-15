import { initStore } from "../../infra/store.js";

/** Initializes the WebSculpt environment and confirms success to the user. */
export async function handleConfigInit(): Promise<void> {
	await initStore();
	console.log("WebSculpt initialized.");
}
