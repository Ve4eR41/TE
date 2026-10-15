export const SERVER_DEFAULTS = (() => ({ host: "127.0.0.1", port: 3001 }))();
export const SOCKET_CLOSE = (() => ({
  unsupportedData: 1003,
  policyViolation: 1008,
  tryAgainLater: 1013,
}))();
