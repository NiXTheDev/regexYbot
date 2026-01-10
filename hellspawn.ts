declare let self: Worker;
import { Logger } from "./logger";
import { performance } from "perf_hooks";
import { TaskMessage, ResultMessage } from "./types"; // Import from types.ts

function processTask(task: TaskMessage, logger: Logger): ResultMessage {
	logger.debug(
		`Processing task with ${task.commands.length} commands. Performance: ${task.includePerformance}`,
	);
	const { initialText, commands, includePerformance } = task;
	const startTime = includePerformance ? performance.now() : undefined;
	let currentText = initialText;

	try {
		// We're now only processing a single command
		const cmd = commands[0];
		logger.debug(`Applying: /${cmd.pattern}/${cmd.flags}/${cmd.replacement}/`);
		const regex = new RegExp(cmd.pattern, cmd.flags);
		currentText = currentText.replace(regex, cmd.replacement);

		let performanceMs: number | null = null;
		if (includePerformance && startTime !== undefined) {
			performanceMs = performance.now() - startTime;
		}

		logger.debug(`Task successful. Result length: ${currentText.length}`);
		return { result: currentText, performanceMs };
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`ERROR during processing: ${errorMessage}`);
		return { result: "", performanceMs: null, error: errorMessage };
	}
}

self.onmessage = (event: MessageEvent<TaskMessage>) => {
	const logger = new Logger("HellSpawn");
	logger.debug("Received message from main thread.");
	const task = event.data;
	const result = processTask(task, logger);
	logger.debug("Posting result back to main thread.");
	self.postMessage(result);
};
