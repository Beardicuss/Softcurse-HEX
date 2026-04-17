// ============================================================
// PHASE 4 ADDITIONS — Add these routes to src/index.ts
// Insert BEFORE the closing server.listen() call
// ============================================================

// ── POST /precheck ─────────────────────────────────────────────
// Phase 4: H.E.X calls this BEFORE its own AI call.
// Runs pre-process + tool-policy. Does NOT call AI.
// Returns: traceId, sanitizedInput, allowedTools, flags, warnings.
server.post("/precheck", async (req, reply) => {
  const parsed = ProcessRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error:  "Invalid request",
      code:   400,
      detail: parsed.error.flatten(),
    });
  }

  const { userInput, sessionId, mode } = parsed.data;
  const result = await runPrecheck({ raw: userInput, sessionId, mode });

  if (result.rateLimited) {
    return reply.status(429).send({
      error:        "Rate limit exceeded",
      retryAfterMs: result.retryAfterMs,
      traceId:      result.traceId,
    });
  }

  return reply.status(200).send(result);
});

// ── POST /postlog ──────────────────────────────────────────────
// Phase 4: H.E.X calls this AFTER its own AI call completes.
// Accepts the AI's raw response, post-processes it, and logs
// the full trace linked to the traceId from /precheck.
server.post("/postlog", async (req, reply) => {
  const body = req.body as {
    traceId:      string;
    sessionId:    string;
    mode:         string;
    rawInput:     string;
    aiResponse:   string;
    allowedTools?: string[];
  };

  if (!body?.traceId || !body?.sessionId || !body?.aiResponse) {
    return reply.status(400).send({ error: "Missing required fields: traceId, sessionId, aiResponse", code: 400 });
  }

  const result = runPostlog({
    traceId:      body.traceId,
    sessionId:    body.sessionId,
    mode:         (body.mode ?? "normal") as RequestContext["mode"],
    rawInput:     body.rawInput ?? "",
    aiResponse:   body.aiResponse,
    allowedTools: body.allowedTools ?? [],
  });

  return reply.status(200).send(result);
});

// ── Additional imports needed at the top of index.ts: ──────────
// import { runPrecheck } from "./pipeline/precheck-runner.js";
// import { runPostlog }  from "./pipeline/postlog-runner.js";
// import { RequestContext } from "./types/index.js";
