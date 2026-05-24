import type { MetaCommandResult } from "./types.js";

export interface Renderer<T extends MetaCommandResult> {
	predicate: (r: MetaCommandResult) => r is T;
	render: (r: T) => void;
}

type AnyRenderer = {
	predicate: (r: MetaCommandResult) => boolean;
	render: (r: MetaCommandResult) => void;
};

function register<T extends MetaCommandResult>(
	predicate: (r: MetaCommandResult) => r is T,
	render: (r: T) => void,
): AnyRenderer {
	return { predicate, render: render as (r: MetaCommandResult) => void };
}

import {
	isCaptureNewResult,
	isCaptureStatusResult,
	renderCaptureNewResult,
	renderCaptureStatusResult,
} from "./renderers/capture.js";
import {
	isCommandCreateResult,
	isCommandDraftResult,
	isCommandListResult,
	isCommandRemoveResult,
	isCommandShowResult,
	isCommandValidateResult,
	renderCreateResult,
	renderDraftResult,
	renderListResult,
	renderRemoveResult,
	renderShowResult,
	renderValidationResult,
} from "./renderers/command.js";
import { isConfigInitResult, renderConfigInit } from "./renderers/config.js";
import {
	isDaemonLogsResult,
	isDaemonRestartResult,
	isDaemonStartResult,
	isDaemonStatusResult,
	isDaemonStopResult,
	renderDaemonLogs,
	renderDaemonRestart,
	renderDaemonStart,
	renderDaemonStatus,
	renderDaemonStop,
} from "./renderers/daemon.js";
import { isMetaCommandError, renderError } from "./renderers/error.js";
import {
	isExploreAssessResult,
	isExploreNewResult,
	renderExploreAssessResult,
	renderExploreNewResult,
} from "./renderers/explore.js";
import { isScopeShowResult, renderScopeShowResult } from "./renderers/scope.js";
import {
	isSkillInstallResult,
	isSkillStatusResult,
	isSkillUninstallResult,
	renderSkillResults,
	renderSkillStatus,
} from "./renderers/skill.js";

/**
 * Static registry of human-format renderers.
 *
 * Order matters: the first matching predicate wins.
 * Error renderers are registered first per the contract.
 * Several predicates overlap at runtime (e.g. message-based results, line-based
 * results, skill results) but their renderers are behaviourally identical, so
 * whichever matches first produces correct output.
 */
export const renderers: AnyRenderer[] = [
	register(isMetaCommandError, renderError),
	register(isCommandDraftResult, renderDraftResult),
	register(isExploreNewResult, renderExploreNewResult),
	register(isExploreAssessResult, renderExploreAssessResult),
	register(isCaptureNewResult, renderCaptureNewResult),
	register(isCaptureStatusResult, renderCaptureStatusResult),
	register(isCommandCreateResult, renderCreateResult),
	register(isCommandListResult, renderListResult),
	register(isDaemonStatusResult, renderDaemonStatus),
	register(isDaemonLogsResult, renderDaemonLogs),
	register(isSkillStatusResult, renderSkillStatus),
	register(isSkillInstallResult, renderSkillResults),
	register(isSkillUninstallResult, renderSkillResults),
	register(isCommandValidateResult, renderValidationResult),
	register(isDaemonStartResult, renderDaemonStart),
	register(isDaemonStopResult, renderDaemonStop),
	register(isDaemonRestartResult, renderDaemonRestart),
	register(isScopeShowResult, renderScopeShowResult),
	register(isConfigInitResult, renderConfigInit),
	register(isCommandShowResult, renderShowResult),
	register(isCommandRemoveResult, renderRemoveResult),
];
