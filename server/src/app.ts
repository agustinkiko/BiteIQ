import Fastify, { type FastifyInstance } from "fastify";
import { registerErrorHandler } from "./errors.js";

export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  registerErrorHandler(app);

  app.get("/api/health/live", async () => ({ status: "ok" }));

  return app;
}
