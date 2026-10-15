import { EventEmitter } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDevelopment } from "./dev.mjs";

const fixture = (extra = {}) => {
  const signals = new EventEmitter();
  const children = [];
  const commands = [{ executable: "server" }, { executable: "client" }];
  const done = runDevelopment(commands, {
    signals,
    spawnChild: (executable) => {
      const child = new EventEmitter();
      child.executable = executable;
      child.killedWith = [];
      child.kill = (signal) => child.killedWith.push(signal);
      children.push(child);
      return child;
    },
    ...extra,
  });
  return { signals, children, done };
};

test("launches both processes and stops the survivor after an unexpected exit", async () => {
  const { children, done, signals } = fixture();
  assert.deepEqual(
    children.map((child) => child.executable),
    ["server", "client"],
  );
  children[0].emit("exit", 1);
  assert.deepEqual(children[1].killedWith, ["SIGTERM"]);
  children[1].emit("exit", 0);
  assert.equal(await done, 1);
  assert.equal(signals.listenerCount("SIGINT"), 0);
  assert.equal(signals.listenerCount("SIGTERM"), 0);
});

for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  test(`${signal} terminates both children and retains its exit status`, async () => {
    const { children, done, signals } = fixture();
    signals.emit(signal);
    signals.emit(signal);
    for (const child of children) {
      assert.deepEqual(child.killedWith, ["SIGTERM"]);
      child.emit("exit", 0);
    }
    assert.equal(await done, code);
  });
}

test("a spawn error shuts down the other child", async () => {
  const { children, done } = fixture();
  children[0].emit("error", new Error("synthetic spawn failure"));
  assert.deepEqual(children[1].killedWith, ["SIGTERM"]);
  children[1].emit("exit", 0);
  assert.equal(await done, 1);
});

test("a clean child exit also stops the companion", async () => {
  const { children, done } = fixture();
  children[1].emit("exit", 0);
  assert.deepEqual(children[0].killedWith, ["SIGTERM"]);
  children[0].emit("exit", 0);
  assert.equal(await done, 0);
});

test("kills a child that ignores graceful shutdown", async () => {
  const { children, done, signals } = fixture({ stopTimeoutMs: 5 });
  signals.emit("SIGTERM");
  children[0].emit("exit", 0);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(children[1].killedWith, ["SIGTERM", "SIGKILL"]);
  children[1].emit("exit", null);
  assert.equal(await done, 143);
});
