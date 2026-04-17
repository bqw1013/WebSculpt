export interface JsonObject {
	[key: string]: unknown;
}

export interface ChromeDiscovery {
	port: number;
	wsPath: string | null;
}

export interface ProxyHealthResponse {
	status: "ok";
	connected: boolean;
	sessions: number;
	chromePort: number | null;
}

/**
 * Structured status returned by `ensureCDPProxy()` so callers can branch on success or failure.
 */
export interface ProxyResult {
	ok: boolean;
	url: string;
	chromePort: number | null;
	reason?: string;
}

export interface TargetInfo extends JsonObject {
	targetId: string;
	type: string;
	title?: string;
	url?: string;
	attached?: boolean;
}

export interface EndpointQuery {
	target?: string;
	url?: string;
	expr?: string;
	y?: string;
	direction?: string;
	format?: string;
	file?: string;
}

export interface SetFilesRequestBody {
	selector: string;
	files: string[];
}

export interface CDPError extends JsonObject {
	code?: number;
	message?: string;
}

export interface CDPRemoteObject extends JsonObject {
	value?: unknown;
}

export interface CDPExceptionDetails extends JsonObject {
	text?: string;
}

export interface CDPCommandResult extends JsonObject {}

export interface CDPCommandResponse<TResult extends CDPCommandResult = CDPCommandResult> {
	id?: number;
	method?: string;
	sessionId?: string;
	params?: JsonObject;
	result?: TResult;
	error?: CDPError;
}

export interface CDPOutgoingMessage {
	id: number;
	method: string;
	params: JsonObject;
	sessionId?: string;
}

export interface PendingCommand {
	resolve: (message: CDPCommandResponse) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

export interface GetTargetsResult extends CDPCommandResult {
	targetInfos: TargetInfo[];
}

export interface CreateTargetResult extends CDPCommandResult {
	targetId: string;
}

export interface AttachToTargetResult extends CDPCommandResult {
	sessionId: string;
}

export interface RuntimeEvaluateResult extends CDPCommandResult {
	result?: CDPRemoteObject;
	exceptionDetails?: CDPExceptionDetails;
}

export interface GetDocumentResult extends CDPCommandResult {
	root: {
		nodeId: number;
	};
}

export interface QuerySelectorResult extends CDPCommandResult {
	nodeId: number;
}

export interface CaptureScreenshotResult extends CDPCommandResult {
	data: string;
}

export interface AttachedToTargetParams extends JsonObject {
	sessionId: string;
	targetInfo: TargetInfo;
}

export interface FetchRequestPausedParams extends JsonObject {
	requestId: string;
	sessionId?: string;
}

export interface PageInfo extends JsonObject {
	title: string;
	url: string;
	ready: string;
}
