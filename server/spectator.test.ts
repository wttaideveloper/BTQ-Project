/**
 * Spectator sanitising tests.
 *
 * This module's whole job is to keep a live quiz spectator from ever seeing
 * the correct answer before players have answered, and from ever seeing an
 * internal identifier such as a session key or a roster field. These tests
 * are written to fail if that guarantee is ever weakened.
 *
 * Run with: npx tsx server/spectator.test.ts
 */
import assert from "node:assert/strict";
import {
  channelKey,
  parseChannelKey,
  publicOptions,
  publicSide,
  registerSpectatorKind,
  attachSpectatorTransport,
  publishSpectatorEvent,
  spectatorSnapshot,
  spectatorRestorePayload,
} from "./spectator.ts";
import type { SpectatorChannel, SpectatorTransport } from "./spectator.ts";

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

function makeFakeTransport() {
  const sent: { clientId: string; payload: any }[] = [];
  const subscribersMap = new Map<string, string[]>();
  const transport: SpectatorTransport = {
    subscribers: (key: string) => subscribersMap.get(key) ?? [],
    send: (clientId: string, payload: unknown) => {
      sent.push({ clientId, payload });
    },
  };
  return { transport, sent, subscribersMap };
}

console.log("spectator sanitising");

// 7. No transport attached must never throw. This has to run before any
// attachSpectatorTransport call in this file, while the module level
// transport is still unset.
test("publishing with no transport attached does not throw", () => {
  registerSpectatorKind({ kind: "notransportkind", load: async () => null });
  assert.doesNotThrow(() => {
    publishSpectatorEvent(
      { kind: "notransportkind", id: "x1" },
      { type: "readiness", sideAReady: true, sideBReady: false },
    );
  });
});

// 1. publicOptions

test("publicOptions strips everything except id and text", () => {
  const question = {
    id: "q1",
    answers: [
      { id: 1, text: "Paris", isCorrect: true, explanation: "capital of France", points: 10, createdAt: "2020-01-01" },
      { id: 2, text: "London", isCorrect: false, explanation: "wrong city", points: 0, createdAt: "2020-01-01" },
    ],
  };
  const options = publicOptions(question);
  assert.equal(options.length, 2);
  for (const option of options) {
    assert.deepEqual(Object.keys(option).sort(), ["id", "text"]);
    assert.equal(Object.prototype.hasOwnProperty.call(option, "isCorrect"), false);
  }
  assert.equal(options[0].id, "1");
  assert.equal(options[0].text, "Paris");
  assert.equal(options[1].id, "2");
  assert.equal(options[1].text, "London");
});

test("publicOptions handles a null question", () => {
  assert.deepEqual(publicOptions(null), []);
});

test("publicOptions handles a question with no answers field", () => {
  assert.deepEqual(publicOptions({ id: "q1" }), []);
});

test("publicOptions handles answers that is not an array", () => {
  assert.deepEqual(publicOptions({ id: "q1", answers: "not an array" }), []);
  assert.deepEqual(publicOptions({ id: "q1", answers: { 0: "weird" } }), []);
});

// 2. publicSide

test("publicSide strips session and roster internals", () => {
  const side = {
    id: "team1",
    name: "Dragons",
    score: "7",
    gameSessionId: "secret-session-key",
    finalAnswers: { q1: "a1" },
    memberAnswers: { user1: "a1", user2: "a2" },
    captainId: "user1",
    memberIds: ["user1", "user2"],
    emoticon: "dragon",
    logoUrl: "https://example.com/logo.png",
  };
  const result = publicSide(side);
  assert.deepEqual(
    Object.keys(result).sort(),
    ["emoticon", "id", "logoUrl", "name", "score"].sort(),
  );
  assert.equal(result.id, "team1");
  assert.equal(result.name, "Dragons");
  assert.equal(typeof result.score, "number");
  assert.equal(result.score, 7);
  assert.equal(result.emoticon, "dragon");
  assert.equal(result.logoUrl, "https://example.com/logo.png");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "gameSessionId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "finalAnswers"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "memberAnswers"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "captainId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "memberIds"), false);
});

test("publicSide omits emoticon and logoUrl when absent from the input", () => {
  const result = publicSide({ id: "team2", name: "Wolves", score: 5 });
  assert.deepEqual(Object.keys(result).sort(), ["id", "name", "score"]);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "emoticon"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "logoUrl"), false);
});

test("publicSide carries emoticon and logoUrl through as null when explicitly null", () => {
  const result = publicSide({ id: "team3", name: "Foxes", score: 1, emoticon: null, logoUrl: null });
  assert.equal(Object.prototype.hasOwnProperty.call(result, "emoticon"), true);
  assert.equal(result.emoticon, null);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "logoUrl"), true);
  assert.equal(result.logoUrl, null);
});

test("publicSide coerces score to a number", () => {
  assert.equal(publicSide({ id: "t", name: "n", score: "42" }).score, 42);
  assert.equal(publicSide({ id: "t", name: "n" }).score, 0);
  assert.equal(typeof publicSide({ id: "t", name: "n", score: 3 }).score, "number");
});

// 4. Channel routing, channelKey and parseChannelKey

test("channelKey and parseChannelKey round trip", () => {
  const channel: SpectatorChannel = { kind: "quiz", id: "1" };
  assert.equal(channelKey(channel), "quiz:1");
  assert.deepEqual(parseChannelKey("quiz:1"), channel);
});

test("channelKey and parseChannelKey round trip with a colon inside the id", () => {
  const channel: SpectatorChannel = { kind: "quiz", id: "a:b:c" };
  const key = channelKey(channel);
  assert.equal(key, "quiz:a:b:c");
  assert.deepEqual(parseChannelKey(key), channel);
});

test("parseChannelKey rejects a key with no colon", () => {
  assert.equal(parseChannelKey("noSeparatorHere"), null);
});

test("parseChannelKey rejects a key with an empty kind", () => {
  assert.equal(parseChannelKey(":onlyid"), null);
});

test("parseChannelKey rejects a key with an empty id", () => {
  assert.equal(parseChannelKey("onlykind:"), null);
});

test("two channels of different kinds with the same id do not cross talk", () => {
  const { transport, sent, subscribersMap } = makeFakeTransport();
  attachSpectatorTransport(transport);
  registerSpectatorKind({ kind: "kindA", load: async () => null });
  registerSpectatorKind({ kind: "kindB", load: async () => null });

  const chanA = { kind: "kindA", id: "1" };
  const chanB = { kind: "kindB", id: "1" };
  subscribersMap.set(channelKey(chanA), ["clientA"]);
  subscribersMap.set(channelKey(chanB), ["clientB"]);

  publishSpectatorEvent(chanA, { type: "readiness", sideAReady: true, sideBReady: true });

  const recipients = sent.map(s => s.clientId);
  assert.ok(recipients.includes("clientA"));
  assert.equal(recipients.includes("clientB"), false);
});

test("two channels of the same kind with different ids do not cross talk", () => {
  const { transport, sent, subscribersMap } = makeFakeTransport();
  attachSpectatorTransport(transport);
  registerSpectatorKind({ kind: "kindC", load: async () => null });

  const chan1 = { kind: "kindC", id: "1" };
  const chan2 = { kind: "kindC", id: "2" };
  subscribersMap.set(channelKey(chan1), ["client1"]);
  subscribersMap.set(channelKey(chan2), ["client2"]);

  publishSpectatorEvent(chan1, { type: "readiness", sideAReady: false, sideBReady: false });

  const recipients = sent.map(s => s.clientId);
  assert.ok(recipients.includes("client1"));
  assert.equal(recipients.includes("client2"), false);
});

// 3. The single most important test: a careless call site passing a whole
// raw question, with correctness data and other internal fields riding
// along, must not leak any of that onto the wire.

test("publishSpectatorEvent strips extra fields a careless call site attaches", () => {
  const { transport, sent, subscribersMap } = makeFakeTransport();
  attachSpectatorTransport(transport);
  registerSpectatorKind({ kind: "careless", load: async () => null });
  const channel = { kind: "careless", id: "c1" };
  subscribersMap.set(channelKey(channel), ["viewer1"]);

  // A raw question row, options included, spread onto an event object and
  // cast through any, the way a rushed call site might do it.
  const rawEventFromCarelessCallSite = {
    type: "question",
    questionId: "q1",
    questionNumber: 3,
    totalQuestions: 10,
    questionText: "What is the capital of France?",
    options: [
      { id: "o1", text: "Paris", isCorrect: true, explanation: "correct, it is the capital", points: 10, createdAt: "2020-01-01" },
      { id: "o2", text: "London", isCorrect: false, explanation: "wrong city", points: 0, createdAt: "2020-01-01" },
    ],
    answeringSideId: "sideA",
    answeringSideName: "Team A",
    // fields from the raw question row that have no business on the wire
    isCorrect: true,
    correctAnswerId: "o1",
    explanation: "the whole raw row, leaked",
    points: 100,
    createdAt: "2020-01-01",
    gameSessionId: "secret-session-key",
  };

  publishSpectatorEvent(channel, rawEventFromCarelessCallSite as any);

  assert.equal(sent.length, 1);
  const payload = sent[0].payload;
  const serialised = JSON.stringify(payload);

  assert.equal(payload.type, "spectator_question");
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "isCorrect"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "correctAnswerId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "explanation"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "points"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "createdAt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "gameSessionId"), false);
  assert.equal(serialised.includes("isCorrect"), false);
  assert.equal(serialised.includes("correctAnswerId"), false);
  assert.equal(serialised.includes("explanation"), false);
  assert.equal(serialised.includes("secret-session-key"), false);

  assert.equal((payload.options as any[]).length, 2);
  for (const option of payload.options as any[]) {
    assert.deepEqual(Object.keys(option).sort(), ["id", "text"]);
  }
  assert.equal((payload.options as any[])[0].text, "Paris");
});

// 5. Snapshot and restore across a full sequence of events.

test("spectatorRestorePayload tracks a full event sequence correctly", () => {
  const { transport, subscribersMap } = makeFakeTransport();
  attachSpectatorTransport(transport);
  registerSpectatorKind({ kind: "snapkind", load: async () => null });
  const channel = { kind: "snapkind", id: "s1" };
  subscribersMap.set(channelKey(channel), []);

  publishSpectatorEvent(channel, {
    type: "started",
    sides: [
      { id: "A", name: "Team A", score: 0 },
      { id: "B", name: "Team B", score: 0 },
    ],
  });
  let restore = spectatorRestorePayload(channel);
  assert.equal(restore.started, true);
  assert.equal(restore.question, null);
  assert.equal(restore.toss, null);
  assert.equal(restore.result, null);
  assert.deepEqual(restore.sides, [
    { id: "A", name: "Team A", score: 0 },
    { id: "B", name: "Team B", score: 0 },
  ]);

  publishSpectatorEvent(channel, {
    type: "toss",
    questionId: "t1",
    questionText: "Heads or tails?",
    options: [
      { id: "h", text: "Heads", isCorrect: true, explanation: "chosen at random" } as any,
      { id: "t", text: "Tails", isCorrect: false } as any,
    ],
  });
  restore = spectatorRestorePayload(channel);
  assert.notEqual(restore.toss, null);
  assert.equal((restore.toss as any).questionId, "t1");
  for (const option of (restore.toss as any).options) {
    assert.deepEqual(Object.keys(option).sort(), ["id", "text"]);
  }
  assert.equal(restore.question, null);
  assert.equal(restore.result, null);

  publishSpectatorEvent(channel, {
    type: "toss_resolved",
    winnerSideId: "A",
    winnerSideName: "Team A",
    correctAnswerId: "h",
  });
  restore = spectatorRestorePayload(channel);
  assert.equal(restore.toss, null);
  assert.equal(restore.question, null);
  assert.equal(restore.result, null);

  publishSpectatorEvent(channel, {
    type: "question",
    questionId: "q1",
    questionNumber: 1,
    totalQuestions: 5,
    questionText: "2 + 2 = ?",
    options: [
      { id: "o1", text: "3", isCorrect: false, points: 0 } as any,
      { id: "o2", text: "4", isCorrect: true, points: 10 } as any,
    ],
    answeringSideId: "A",
    answeringSideName: "Team A",
  });
  restore = spectatorRestorePayload(channel);
  assert.equal(restore.toss, null);
  assert.notEqual(restore.question, null);
  assert.equal((restore.question as any).questionId, "q1");
  for (const option of (restore.question as any).options) {
    assert.deepEqual(Object.keys(option).sort(), ["id", "text"]);
  }
  assert.equal(restore.result, null);

  publishSpectatorEvent(channel, {
    type: "answered",
    questionId: "q1",
    questionNumber: 1,
    answeringSideId: "A",
    answeringSideName: "Team A",
    selectedAnswerId: "o1",
    correctAnswerId: "o2",
    isCorrect: false,
    pointsAwarded: 0,
  });
  restore = spectatorRestorePayload(channel);
  assert.notEqual(restore.result, null);
  assert.equal((restore.result as any).correctAnswerId, "o2");
  assert.equal((restore.result as any).isCorrect, false);
  assert.notEqual(restore.question, null, "question stays until question_ended clears it");

  publishSpectatorEvent(channel, { type: "question_ended", questionId: "q1" });
  restore = spectatorRestorePayload(channel);
  assert.equal(restore.question, null);
  assert.notEqual(restore.result, null, "the answered result survives question_ended");

  publishSpectatorEvent(channel, {
    type: "score",
    sides: [
      { id: "A", name: "Team A", score: 10 },
      { id: "B", name: "Team B", score: 0 },
    ],
  });
  restore = spectatorRestorePayload(channel);
  assert.deepEqual(restore.sides, [
    { id: "A", name: "Team A", score: 10 },
    { id: "B", name: "Team B", score: 0 },
  ]);
  assert.notEqual(restore.result, null, "score does not disturb the answered result");
  assert.equal(restore.question, null);

  publishSpectatorEvent(channel, { type: "ended", winnerSideId: "A", isDraw: false });
  assert.deepEqual(spectatorSnapshot(channel), { started: false });
  restore = spectatorRestorePayload(channel);
  assert.equal(restore.started, false);
  assert.equal(restore.question, null);
  assert.equal(restore.toss, null);
  assert.equal(restore.result, null);
  assert.equal(restore.sides, null);
});

test("a question event clears an active toss directly, without a toss_resolved in between", () => {
  const { transport, subscribersMap } = makeFakeTransport();
  attachSpectatorTransport(transport);
  registerSpectatorKind({ kind: "snapkind2", load: async () => null });
  const channel = { kind: "snapkind2", id: "s2" };
  subscribersMap.set(channelKey(channel), []);

  publishSpectatorEvent(channel, { type: "toss", questionId: "t1", options: [] });
  assert.notEqual(spectatorRestorePayload(channel).toss, null);

  publishSpectatorEvent(channel, {
    type: "question",
    questionId: "q1",
    options: [],
  });
  const restore = spectatorRestorePayload(channel);
  assert.equal(restore.toss, null, "the question case must clear a toss still in progress");
  assert.notEqual(restore.question, null);
});

// 6. legacyType: canonical and legacy named events both go out, sanitised
// the same way.

test("a registered legacyType delivers both the canonical and legacy event names", () => {
  const { transport, sent, subscribersMap } = makeFakeTransport();
  attachSpectatorTransport(transport);
  registerSpectatorKind({
    kind: "legacykind",
    load: async () => null,
    legacyType: (type) => (type === "question" ? "quiz_question" : undefined),
  });
  const channel = { kind: "legacykind", id: "L1" };
  subscribersMap.set(channelKey(channel), ["viewer1"]);

  publishSpectatorEvent(channel, {
    type: "question",
    questionId: "q1",
    questionText: "Legacy compatible question",
    options: [
      { id: "o1", text: "A", isCorrect: true, explanation: "leaked if not stripped" } as any,
      { id: "o2", text: "B", isCorrect: false } as any,
    ],
  } as any);

  assert.equal(sent.length, 2, "one canonical event and one legacy named event");
  const types = sent.map(s => s.payload.type).sort();
  assert.deepEqual(types, ["quiz_question", "spectator_question"]);

  const canonical = sent.find(s => s.payload.type === "spectator_question")!.payload;
  const legacy = sent.find(s => s.payload.type === "quiz_question")!.payload;

  const canonicalBody = { ...canonical };
  const legacyBody = { ...legacy };
  delete (canonicalBody as any).type;
  delete (legacyBody as any).type;
  assert.deepEqual(canonicalBody, legacyBody, "the legacy event carries the same sanitised body");

  for (const payload of [canonical, legacy]) {
    assert.equal(JSON.stringify(payload).includes("isCorrect"), false);
    assert.equal(JSON.stringify(payload).includes("explanation"), false);
  }
});

test("no legacyType means only the canonical event is delivered", () => {
  const { transport, sent, subscribersMap } = makeFakeTransport();
  attachSpectatorTransport(transport);
  registerSpectatorKind({ kind: "nolegacykind", load: async () => null });
  const channel = { kind: "nolegacykind", id: "N1" };
  subscribersMap.set(channelKey(channel), ["viewer1"]);

  publishSpectatorEvent(channel, { type: "readiness", sideAReady: true, sideBReady: false });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.type, "spectator_readiness");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
