/**
 * 非 CLI 模块调试沙盒
 *
 * 用途：当你想调试某个内部模块（如 store、engine、utils）但不想经过 CLI 入口时，
 * 可以在这里直接 import 并调用它们，然后运行 "Debug Current TS File"。
 *
 * 运行方式：
 * 1. 打开本文件
 * 2. 在左侧行号旁点击设置断点（红点）
 * 3. 按 F5，选择 "Debug Current TS File"
 */

import { initStore, readConfig, appendLog } from "../src/infra/store.js";
import { listAllCommands } from "../src/cli/engine/registry.js";

async function main() {
	// 在这里写你想调试的代码
	await initStore();
	const config = await readConfig();
	console.log("Config:", config);

	const commands = await listAllCommands();
	console.log("Commands:", commands);
}

main().catch(console.error);
