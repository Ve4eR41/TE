import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import {
  decodeClientMessage,
  MAX_BUFFERED_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGES_PER_WINDOW,
  MESSAGE_WINDOW_MS,
  PROTOCOL_VERSION,
  type GameConfig,
  type ServerMessage,
} from "@troll-vs-elves/shared";
import { WebSocket, WebSocketServer } from "ws";
import { SERVER_DEFAULTS, SOCKET_CLOSE } from "./constants.js";
import { MatchRoom } from "./match-room.js";

export interface GameServerOptions {
  config: GameConfig;
  host?: string;
  port?: number;
}

export const startGameServer = async (options: GameServerOptions) => {
  const room = new MatchRoom(options.config.match);
  const httpServer = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify({ status: "ok", connections: room.size }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    perMessageDeflate: false,
  });
  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") {
      socket.end(
        "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
      return;
    }
    sockets.handleUpgrade(request, socket, head, (webSocket) => {
      sockets.emit("connection", webSocket, request);
    });
  });
  sockets.on("connection", (socket) => {
    const playerId = room.join();
    let windowStart = performance.now();
    let received = 0;
    const send = (message: ServerMessage): void => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const text = JSON.stringify(message);
      if (
        socket.bufferedAmount + Buffer.byteLength(text) > MAX_BUFFERED_BYTES ||
        Buffer.byteLength(text) > MAX_MESSAGE_BYTES
      ) {
        socket.close(SOCKET_CLOSE.tryAgainLater);
        return;
      }
      socket.send(text);
    };
    socket.on("close", () => room.leave(playerId));
    // ws closes malformed/oversized frames itself; avoid an unhandled error event.
    socket.on("error", () => room.leave(playerId));
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        socket.close(SOCKET_CLOSE.unsupportedData);
        return;
      }
      const now = performance.now();
      if (now - windowStart >= MESSAGE_WINDOW_MS) {
        windowStart = now;
        received = 0;
      }
      received += 1;
      if (received > MAX_MESSAGES_PER_WINDOW) {
        send({ v: PROTOCOL_VERSION, t: "error", code: "RATE_LIMITED" });
        socket.close(SOCKET_CLOSE.policyViolation);
        return;
      }
      const message = decodeClientMessage(data.toString());
      if (!message) {
        send({ v: PROTOCOL_VERSION, t: "error", code: "INVALID_MESSAGE" });
      } else if (message.t === "ping") {
        send({ v: PROTOCOL_VERSION, t: "pong", requestId: message.requestId });
      } else {
        send({
          v: PROTOCOL_VERSION,
          t: "error",
          code: "UNSUPPORTED_INTENT",
          requestId: message.requestId,
        });
      }
    });
    send(room.welcome(playerId));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(
        options.port ?? SERVER_DEFAULTS.port,
        options.host ?? SERVER_DEFAULTS.host,
        () => {
          httpServer.removeListener("error", reject);
          resolve();
        },
      );
    });
  } catch (error: unknown) {
    sockets.close();
    throw error;
  }

  let stopPromise: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopPromise ??= (async () => {
      for (const client of sockets.clients) client.terminate();
      await Promise.all([
        new Promise<void>((resolve, reject) =>
          sockets.close((error) => (error ? reject(error) : resolve())),
        ),
        new Promise<void>((resolve, reject) =>
          httpServer.close((error) => (error ? reject(error) : resolve())),
        ),
      ]);
    })();
    return stopPromise;
  };
  return { httpServer, room, stop };
};
