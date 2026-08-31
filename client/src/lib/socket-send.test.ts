/**
 * WebSocket send-while-CONNECTING race tests.
 *
 * Run with: npx tsx client/src/lib/socket-send.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sendJsonWhenOpen } from "./socket.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(error);
  }
}

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  private listeners = new Set<() => void>();

  send(data: string) {
    if (this.readyState !== 1) {
      throw new Error("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.");
    }
    this.sent.push(data);
  }

  addEventListener(type: string, listener: () => void) {
    if (type === "open") this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: () => void) {
    if (type === "open") this.listeners.delete(listener);
  }

  open() {
    this.readyState = 1;
    this.fireOpenListeners();
  }

  fireOpenListeners() {
    for (const listener of [...this.listeners]) listener();
  }
}

const source = readFileSync(resolve(process.cwd(), "client/src/lib/socket.ts"), "utf8");

console.log("websocket send race");

test("already OPEN sends immediately, once", () => {
  const live = new FakeSocket();
  live.readyState = 1;
  sendJsonWhenOpen(live, '{"type":"watch_match"}', () => live);
  assert.deepEqual(live.sent, ['{"type":"watch_match"}']);
});

test("send while CONNECTING waits, then sends once when that socket opens", () => {
  const live = new FakeSocket();
  sendJsonWhenOpen(live, '{"type":"watch_match"}', () => live);
  assert.equal(live.sent.length, 0);
  live.open();
  assert.deepEqual(live.sent, ['{"type":"watch_match"}']);
  live.open();
  assert.equal(live.sent.length, 1);
});

test("socket replaced before open does not send on the stale instance", () => {
  const stale = new FakeSocket();
  const live = new FakeSocket();
  sendJsonWhenOpen(stale, '{"type":"watch_match"}', () => live);
  stale.open();
  assert.equal(stale.sent.length, 0);
  assert.equal(live.sent.length, 0);
});

test("socket closed before open does not send", () => {
  const target = new FakeSocket();
  sendJsonWhenOpen(target, '{"type":"ping"}', () => target);
  target.readyState = 3;
  target.fireOpenListeners();
  assert.equal(target.sent.length, 0);
});

test("closed or closing target is not sent to", () => {
  const closing = new FakeSocket();
  closing.readyState = 2;
  sendJsonWhenOpen(closing, '{"type":"watch_match"}', () => closing);
  assert.equal(closing.sent.length, 0);

  const closed = new FakeSocket();
  closed.readyState = 3;
  sendJsonWhenOpen(closed, '{"type":"watch_match"}', () => closing);
  assert.equal(closed.sent.length, 0);
});

test("two queued events while CONNECTING each send once after open", () => {
  const live = new FakeSocket();
  sendJsonWhenOpen(live, '{"type":"a"}', () => live);
  sendJsonWhenOpen(live, '{"type":"b"}', () => live);
  live.open();
  assert.deepEqual(live.sent, ['{"type":"a"}', '{"type":"b"}']);
});

test("sendGameEvent no longer sends on the module socket from a raw open listener", () => {
  assert.match(source, /sendJsonWhenOpen/);
  assert.match(source, /readyState === WebSocket\.CONNECTING/);
  assert.doesNotMatch(
    source,
    /socket\.addEventListener\('open', \(\) => \{\s*socket\?\.send\(JSON\.stringify\(event\)\)/,
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
