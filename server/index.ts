import { createApp } from "./app.ts";
import { generationConfig } from "./generate.ts";

const port = Number(process.env.PORT ?? 3001);
const production = process.env.NODE_ENV === "production";
const server = createApp({
  ...generationConfig(),
  trustProxy: process.env.TRUST_PROXY === "1",
}).listen(port, production ? "0.0.0.0" : "127.0.0.1");
server.on("listening", () => {
  console.log(`DesignForge server listening on port ${port}`);
});
