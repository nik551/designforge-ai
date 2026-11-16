import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3001);
const production = process.env.NODE_ENV === "production";
const server = createApp({
  key: process.env.OPENAI_API_KEY?.trim(),
  model: process.env.OPENAI_MODEL?.trim() || undefined,
  trustProxy: process.env.TRUST_PROXY === "1",
}).listen(port, production ? "0.0.0.0" : "127.0.0.1");
server.on("listening", () => {
  console.log(`DesignForge server listening on port ${port}`);
});
