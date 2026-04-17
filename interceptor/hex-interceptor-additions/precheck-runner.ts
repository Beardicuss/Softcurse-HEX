// ============================================================
// H.E.X Interceptor — Precheck Runner (Phase 4 Addition)
// Runs pre-process + context + tool-policy ONLY.
// Does NOT call the AI — H.E.X handles the actual AI call.
// Returns: traceId, sanitizedInput, allowedTools, flags, warnings
// ============================================================

import { UserInput } from "../types/index.js";
import { preProcess }  from "./pre-processor.js";
import { injectContext } from "./context-engine.js";
import { applyToolPolicy } from "./tool-policy.js";
import { checkRateLimit } from "./rate-limiter.js";
import { createContext, StageData } from "../logger/trace-builder.js";
import { logRequest } from "../logger/sqlite-logger.js";
import { buildTrace } from "../logger/trace-builder.js";

export interface PrecheckResult {
  traceId: string;
  sanitized: string;
  allowedTools: string[];
  warnings: string[];
  flags: {
    unsafePatternDetected: boolean;
    contextTruncated: boolean;
    toolsRestricted: boolean;
  };
  rateLimited: boolean;
  retryAfterMs?: number;
}

export async function runPrecheck(input: UserInput): Promise<PrecheckResult> {
  const ctx    = createContext(input.sessionId, input.mode);
  const stages: StageData[] = [];
  const warnings: string[] = [];

  // ── Rate limit ────────────────────────────────────────────
  const rl = checkRateLimit(ctx);
  if (!rl.allowed) {
    return {
      traceId:        ctx.traceId,
      sanitized:      input.raw,
      allowedTools:   [],
      warnings:       [`Rate limit hit. Retry in ${Math.ceil((rl.resetInMs ?? 0) / 1000)}s.`],
      flags:          ctx.flags,
      rateLimited:    true,
      retryAfterMs:   rl.resetInMs,
    };
  }

  // ── Pre-process ───────────────────────────────────────────
  const preResult = preProcess(input, ctx);
  stages.push({
    name:           "pre-process",
    inputSnapshot:  { raw: input.raw },
    outputSnapshot: { sanitized: preResult.sanitized },
    durationMs:     preResult.durationMs,
    mutations:      preResult.mutations,
  });

  if (preResult.ctx.flags.unsafePatternDetected) {
    warnings.push("Unsafe input pattern detected. Tool access has been clamped.");
  }
  if (preResult.ctx.flags.contextTruncated) {
    warnings.push("Input was truncated due to size limits.");
  }

  // ── Context injection ─────────────────────────────────────
  const ctxResult = injectContext(input.sessionId, input.mode);
  stages.push({
    name:           "context-inject",
    inputSnapshot:  { sessionId: input.sessionId },
    outputSnapshot: { historyLength: ctxResult.session.history.length },
    durationMs:     ctxResult.durationMs,
    mutations:      ctxResult.mutations,
  });

  // ── Tool policy ───────────────────────────────────────────
  const policyResult = applyToolPolicy(preResult.ctx);
  stages.push({
    name:           "tool-policy",
    inputSnapshot:  { mode: input.mode, flags: preResult.ctx.flags },
    outputSnapshot: { allowedTools: policyResult.allowedTools },
    durationMs:     policyResult.durationMs,
    mutations:      policyResult.mutations,
  });

  if (preResult.ctx.flags.toolsRestricted) {
    warnings.push("Some tools were restricted for this request.");
  }

  // Log the precheck trace (no AI response yet — that comes in /postlog)
  const dummyOutput = {
    content:      "[pending — AI not yet called]",
    traceId:      ctx.traceId,
    warnings,
    executionTime: Date.now() - ctx.timestamp,
    allowedTools: policyResult.allowedTools,
  };
  const trace = buildTrace(preResult.ctx, stages, dummyOutput, [], {
    rawInput:       input.raw,
    sanitizedInput: preResult.sanitized,
    allowedTools:   policyResult.allowedTools,
  });
  logRequest(trace);

  return {
    traceId:      ctx.traceId,
    sanitized:    preResult.sanitized,
    allowedTools: policyResult.allowedTools,
    warnings,
    flags:        preResult.ctx.flags,
    rateLimited:  false,
  };
}
