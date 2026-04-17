// ============================================================
// H.E.X Interceptor — Postlog Runner (Phase 4 Addition)
// Accepts the AI response that H.E.X produced independently,
// runs post-processing, and logs the final complete trace.
// ============================================================

import { RequestContext } from "../types/index.js";
import { postProcess } from "./post-processor.js";
import { appendToHistory, getSessionSnapshot } from "./context-engine.js";
import { getTrace, logRequest } from "../logger/sqlite-logger.js";
import { buildTrace } from "../logger/trace-builder.js";

export interface PostlogInput {
  traceId:     string;
  sessionId:   string;
  mode:        RequestContext["mode"];
  rawInput:    string;
  aiResponse:  string;
  allowedTools: string[];
}

export interface PostlogResult {
  traceId:      string;
  content:      string;
  warnings:     string[];
  executionTime: number;
}

export function runPostlog(input: PostlogInput): PostlogResult {
  const start = Date.now();

  // Retrieve the precheck trace to reconstruct context flags
  const existingTrace = getTrace(input.traceId);
  const flags = existingTrace?.flags ?? {
    unsafePatternDetected: false,
    contextTruncated: false,
    toolsRestricted: false,
  };

  // Reconstruct a minimal context for post-processing
  const ctx: RequestContext = {
    sessionId: input.sessionId,
    traceId:   input.traceId,
    mode:      input.mode,
    timestamp: start,
    metadata:  {},
    flags:     flags as RequestContext["flags"],
  };

  // Build a minimal AIResponse wrapper
  const rawAIResponse = {
    raw:          input.aiResponse,
    finishReason: "stop" as const,
  };

  // Post-process: strip injections, gather warnings
  const postResult = postProcess(rawAIResponse, ctx, input.allowedTools);

  // Append to session history so context engine stays in sync
  appendToHistory(input.sessionId, "user",      input.rawInput);
  appendToHistory(input.sessionId, "assistant", postResult.output.content);

  // Update the stored trace with the actual AI response
  if (existingTrace) {
    const updatedOutput = {
      ...postResult.output,
      traceId: input.traceId,
    };
    const updatedTrace = buildTrace(ctx, existingTrace.stages, updatedOutput, [], {
      rawInput:      input.rawInput,
      allowedTools:  input.allowedTools,
      aiResponse:    input.aiResponse,
    });
    logRequest(updatedTrace);
  }

  return {
    traceId:       input.traceId,
    content:       postResult.output.content,
    warnings:      postResult.output.warnings,
    executionTime: Date.now() - start,
  };
}
