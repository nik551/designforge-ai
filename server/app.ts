import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { resolve } from "node:path";
import { requestSchema } from "../shared/design.ts";
import { runDemo } from "../shared/demo.ts";
import { generate, GenerationError } from "./generate.ts";

export function createApp({ key, model = "gpt-4.1-mini", trustProxy = false }: {
  key?: string;
  model?: string;
  trustProxy?: boolean;
} = {}) {
  const app = express();
  let active = 0;
  if (trustProxy) app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: {
    directives: { upgradeInsecureRequests: null },
  } }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true, mode: key ? "openai" : "demo" }));
  app.post("/api/design",
    rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false,
      message: { error: "Too many requests. Try again in a minute." } }),
    express.json({ limit: "80kb" }),
    async (req, res) => {
      const request = requestSchema.safeParse(req.body);
      if (!request.success) {
        res.status(400).json({ error: "Provide a prompt of 1–2,000 characters and a valid current design or null." });
        return;
      }
      if (!key) {
        const design = runDemo(request.data);
        if (!design) {
          res.status(422).json({ error: "Demo mode supports the examples and two edits: “Add missing states” and “Stack the layout for mobile.” Configure a server key for custom dashboard prompts." });
          return;
        }
        res.json({ design, mode: "demo" });
        return;
      }
      if (active >= 3) {
        res.status(503).json({ error: "The studio is busy. Try again shortly." });
        return;
      }
      active++;
      try {
        res.json({ design: await generate(request.data, { key, model }), mode: "openai" });
      } catch (error) {
        if (error instanceof GenerationError) {
          res.status(error.status).json({ error: error.message });
        } else {
          res.status(502).json({ error: "The AI request failed or timed out. Try again." });
        }
      } finally {
        active--;
      }
    },
  );
  app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));
  app.use(express.static(resolve("dist")));
  const handleError: express.ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 413 ? "Request is too large." : status === 400 ? "Malformed JSON." : "Unexpected server error." });
  };
  app.use(handleError);
  return app;
}
