import { fileURLToPath } from "node:url";
import { loadConfig, loadMap } from "@troll-vs-elves/shared/config/node";
import { SERVER_DEFAULTS } from "./constants.js";
import { startGameServer } from "./game-server.js";

export const main = async (): Promise<void> => {
  const port = Number(process.env.PORT ?? SERVER_DEFAULTS.port);
  if (!Number.isInteger(port) || port < 0 || port > 65_535)
    throw new Error("PORT must be an integer from 0 to 65535");
  const configDir =
    process.env.GAME_CONFIG_DIR ??
    fileURLToPath(new URL("../../../config/", import.meta.url));
  const config = loadConfig(configDir);
  const host = process.env.HOST ?? SERVER_DEFAULTS.host;
  const server = await startGameServer({
    config,
    map: loadMap(configDir),
    host,
    port,
  });
  const address = server.httpServer.address();
  if (address && typeof address !== "string")
    console.log(`Game server ready at http://${host}:${address.port}`);
  const shutdown = (): void => {
    void server.stop().catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Shutdown failed");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Server startup failed",
  );
  process.exitCode = 1;
});
