/**
 * Live commentator WebRTC signaling tests.
 *
 * Run with: npx tsx server/commentary-signaling.test.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canForwardCommentarySignal,
  canListenCommentary,
  canPublishCommentary,
  CommentaryRegistry,
  getCommentaryIceServers,
} from "./commentary-signaling.ts";
import { championshipMatchIdFromBattleId } from "./commentator-advance.ts";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(error);
  }
}

const root = process.cwd();
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

await test("only authenticated commentators can publish", () => {
  assert.equal(canPublishCommentary({ user: null, championshipStatus: "active", matchStatus: "live" }).ok, false);
  assert.equal(canPublishCommentary({
    user: { isCommentator: false, isAdmin: false },
    championshipStatus: "active",
    matchStatus: "live",
  }).ok, false);
  assert.equal(canPublishCommentary({
    user: { isCommentator: true, isAdmin: true },
    championshipStatus: "active",
    matchStatus: "live",
  }).ok, false);
  const allowed = canPublishCommentary({
    user: { isCommentator: true, isAdmin: false },
    championshipStatus: "active",
    matchStatus: "live",
  });
  assert.deepEqual(allowed, { ok: true });
});

await test("unauthorized users cannot publish to inactive or non-live matches", () => {
  const inactive = canPublishCommentary({
    user: { isCommentator: true, isAdmin: false },
    championshipStatus: "completed",
    matchStatus: "live",
  });
  assert.equal(inactive.ok, false);
  const notLive = canPublishCommentary({
    user: { isCommentator: true, isAdmin: false },
    championshipStatus: "active",
    matchStatus: "upcoming",
  });
  assert.equal(notLive.ok, false);
});

await test("players can subscribe only to the match they are playing", () => {
  assert.equal(canListenCommentary({
    userId: 9,
    memberIds: [1, 2, 3],
    championshipStatus: "active",
    matchStatus: "live",
  }).ok, false);
  assert.equal(canListenCommentary({
    userId: 2,
    memberIds: [1, 2, 3],
    championshipStatus: "active",
    matchStatus: "live",
  }).ok, true);
  assert.equal(canListenCommentary({
    userId: 2,
    memberIds: [1, 2, 3],
    championshipStatus: "draft",
    matchStatus: "live",
  }).ok, false);
});

await test("different matches cannot receive each other's commentary signals", () => {
  assert.equal(canForwardCommentarySignal({
    senderClientId: "pub",
    peerId: "listener-b",
    publisherClientId: "pub",
    listenerClientIds: ["listener-a"],
  }), false);
  assert.equal(canForwardCommentarySignal({
    senderClientId: "pub",
    peerId: "listener-a",
    publisherClientId: "pub",
    listenerClientIds: ["listener-a"],
  }), true);
  assert.equal(canForwardCommentarySignal({
    senderClientId: "stranger",
    peerId: "listener-a",
    publisherClientId: "pub",
    listenerClientIds: ["listener-a"],
  }), false);
});

await test("publisher disconnect stops commentary for listeners", () => {
  const sent: Array<{ id: string; type: string; live?: boolean }> = [];
  const clients = new Map([
    ["pub", { id: "pub", userId: 10, verifiedUserId: 10 }],
    ["p1", { id: "p1", userId: 1, verifiedUserId: 1 }],
  ]);
  const registry = new CommentaryRegistry({
    sendToClient: (id, message) => {
      sent.push({ id, type: String(message.type), live: message.live as boolean | undefined });
    },
    getClient: id => clients.get(id),
    listClients: () => clients.values(),
  });
  (registry as unknown as { sessions: Map<string, { matchId: string; publisherClientId: string; publisherUserId: number; listeners: Set<string> }> }).sessions.set("m1", {
    matchId: "m1",
    publisherClientId: "pub",
    publisherUserId: 10,
    listeners: new Set(["p1"]),
  });
  (registry as unknown as { clientMatch: Map<string, { matchId: string; role: string }> }).clientMatch.set("pub", { matchId: "m1", role: "publisher" });
  (registry as unknown as { clientMatch: Map<string, { matchId: string; role: string }> }).clientMatch.set("p1", { matchId: "m1", role: "listener" });

  registry.disconnect("pub");
  assert.equal(registry.isLive("m1"), false);
  assert.equal(sent.some(item => item.id === "p1" && item.type === "commentary_status" && item.live === false), true);
});

await test("match completion stops commentary", () => {
  const sent: Array<{ id: string; live?: boolean }> = [];
  const registry = new CommentaryRegistry({
    sendToClient: (id, message) => sent.push({ id, live: message.live as boolean | undefined }),
    getClient: () => undefined,
    listClients: () => [],
  });
  (registry as unknown as { sessions: Map<string, { matchId: string; publisherClientId: string; publisherUserId: number; listeners: Set<string> }> }).sessions.set("m1", {
    matchId: "m1",
    publisherClientId: "pub",
    publisherUserId: 10,
    listeners: new Set(["p1"]),
  });
  registry.stopMatch("m1", "ended");
  assert.equal(registry.isLive("m1"), false);
  assert.equal(sent.some(item => item.id === "p1" && item.live === false), true);
  assert.equal(sent.some(item => item.id === "pub" && item.live === false), true);
});

await test("championship match ids stay isolated by battle prefix", () => {
  assert.equal(championshipMatchIdFromBattleId("championship-abc"), "abc");
  assert.equal(championshipMatchIdFromBattleId("regular-uuid"), null);
});

await test("ICE servers use STUN and never put audio in JSON websocket messages", () => {
  const servers = getCommentaryIceServers({});
  assert.ok(servers.some(server => String(server.urls).includes("stun:")));
  const socketSource = read("server/socket.ts");
  const signalingSource = read("server/commentary-signaling.ts");
  assert.match(socketSource, /commentary_publish/);
  assert.match(socketSource, /commentary_signal/);
  assert.match(signalingSource, /Audio bytes never travel in JSON WebSocket messages/);
  assert.doesNotMatch(signalingSource, /getUserMedia|MediaStream|audio\/webm/);
});

await test("socket disconnect and match completion hook commentary teardown", () => {
  const socketSource = read("server/socket.ts");
  const routesSource = read("server/championship-routes.ts");
  assert.match(socketSource, /handleCommentaryDisconnect\(clientId\)/);
  assert.match(socketSource, /stopCommentaryForMatch\(match\.id\)/);
  assert.match(routesSource, /stopCommentaryForMatch\(match\.id\)/);
});

await test("player widget and commentator desk use WebRTC, not cloned voice", () => {
  const publisher = read("client/src/lib/commentary-rtc.ts");
  const mic = read("client/src/components/commentary/CommentatorMicControl.tsx");
  const receiver = read("client/src/components/commentary/PlayerCommentaryReceiver.tsx");
  const desk = read("client/src/pages/CommentatorMatchDesk.tsx");
  const game = read("client/src/pages/TeamBattleGame.tsx");
  assert.match(publisher, /RTCPeerConnection/);
  assert.match(publisher, /getUserMedia/);
  assert.match(publisher, /track\.enabled = enabled/);
  assert.doesNotMatch(publisher, /elevenlabs|clone voice|speechSynthesis/i);
  assert.doesNotMatch(desk, /CommentatorMicControl/);
  assert.match(mic, /Start Commentary/);
  assert.match(mic, /Mute Mic/);
  assert.match(mic, /connection_established/);
  assert.doesNotMatch(game, /PlayerCommentaryReceiver/);
  assert.match(receiver, /connection_established/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
