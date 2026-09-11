/**
 * Watching a live game, for any kind of game.
 *
 * Championship matches grew a spectator feed first, and it was written for
 * championships alone. Team battles, rapid fire and whatever comes next need
 * the same thing, and the dangerous parts are identical every time: a question
 * object carries the correct answer, a session row carries the key that unlocks
 * private game state, and a viewer who reconnects mid question needs the public
 * state back without being handed any of that.
 *
 * So this module owns those parts once. A game kind registers itself, then
 * publishes typed events through `publish`. It cannot publish anything else:
 * every event is rebuilt field by field from a whitelist here, so a caller
 * passing a raw question or a raw team row leaks nothing, because the extra
 * fields are simply never copied. That is deliberate. The older championship
 * fan-out trusted its callers to sanitise, which worked only because every one
 * of its call sites remembered to.
 *
 * It has no socket import. The transport is injected by server/socket.ts, which
 * means the rules below can be tested without a server.
 */

/** A thing that can be watched: a kind plus an id unique within that kind. */
export type SpectatorChannel = { kind: string; id: string };

export const channelKey = (channel: SpectatorChannel): string =>
  `${channel.kind}:${channel.id}`;

export function parseChannelKey(key: string): SpectatorChannel | null {
  const cut = key.indexOf(":");
  if (cut <= 0 || cut === key.length - 1) return null;
  return { kind: key.slice(0, cut), id: key.slice(cut + 1) };
}

/** An answer option as a viewer may see it. Correctness is never included. */
export type PublicOption = { id: string; text: string };

/** A team as a viewer may see it. No roster internals, no session key. */
export type PublicSide = {
  id: string;
  name: string;
  score: number;
  /** Optional decoration; championship teams have these, ad hoc ones do not. */
  emoticon?: string | null;
  logoUrl?: string | null;
};

/**
 * Everything a kind may publish. Adding a case here is the only way to add
 * something a viewer can be told, which keeps the audit surface small.
 */
export type SpectatorEvent =
  | { type: "started"; sides?: PublicSide[] }
  | {
      type: "question";
      questionId: string;
      questionNumber?: number;
      totalQuestions?: number;
      questionText?: string;
      options?: PublicOption[];
      answeringSideId?: string | null;
      answeringSideName?: string | null;
    }
  | {
      type: "answered";
      questionId?: string;
      questionNumber?: number;
      answeringSideId?: string | null;
      answeringSideName?: string | null;
      selectedAnswerId?: string | null;
      correctAnswerId?: string | null;
      isCorrect?: boolean;
      pointsAwarded?: number;
    }
  | { type: "question_ended"; questionId?: string }
  | {
      type: "toss";
      questionId: string;
      questionText?: string;
      options?: PublicOption[];
    }
  | {
      type: "toss_resolved";
      winnerSideId?: string | null;
      winnerSideName?: string | null;
      correctAnswerId?: string | null;
    }
  | { type: "readiness"; sideAReady: boolean; sideBReady: boolean }
  | { type: "score"; sides: PublicSide[] }
  | {
      type: "ended";
      sides?: PublicSide[];
      winnerSideId?: string | null;
      isDraw?: boolean;
    };

/**
 * Strip an answer list down to what a viewer may see.
 *
 * The stored answer carries `isCorrect`. Rebuild each option from two named
 * fields rather than spreading, so a new column on the answers table can never
 * arrive on the wire by accident.
 */
export function publicOptions(question: unknown): PublicOption[] {
  const answers = (question as { answers?: unknown[] } | null)?.answers;
  if (!Array.isArray(answers)) return [];
  return answers.map((a: any) => ({ id: String(a?.id), text: String(a?.text ?? "") }));
}

/**
 * Strip a team down to what a viewer may see.
 *
 * Team rows carry `gameSessionId`, which is the key to private game state, plus
 * `finalAnswers` and per member votes that reveal what a side is about to play.
 * None of it is copied.
 */
export function publicSide(side: unknown): PublicSide {
  const s = side as any;
  return {
    id: String(s?.id ?? ""),
    name: String(s?.name ?? ""),
    score: Number(s?.score ?? 0),
    ...(s?.emoticon !== undefined ? { emoticon: s.emoticon ?? null } : {}),
    ...(s?.logoUrl !== undefined ? { logoUrl: s.logoUrl ?? null } : {}),
  };
}

export const publicSides = (sides: unknown[]): PublicSide[] =>
  (Array.isArray(sides) ? sides : []).map(publicSide);

/**
 * A kind of watchable game.
 *
 * `legacyType` exists for championships only: their spectator page is already
 * deployed and listens for the old event names, so those events go out under
 * both names until that page is retired. New kinds should not use it.
 */
export type SpectatorKind = {
  kind: string;
  /** Public REST payload for a viewer arriving cold. Null means not found. */
  load: (id: string) => Promise<unknown | null>;
  /** Old event name for a given canonical type, when one must be kept. */
  legacyType?: (type: SpectatorEvent["type"]) => string | undefined;
  /** Extra fields merged into every outgoing event, e.g. a legacy id field. */
  legacyFields?: (channel: SpectatorChannel) => Record<string, unknown>;
};

const kinds = new Map<string, SpectatorKind>();

export function registerSpectatorKind(kind: SpectatorKind): void {
  kinds.set(kind.kind, kind);
}

export const getSpectatorKind = (name: string): SpectatorKind | undefined =>
  kinds.get(name);

export const spectatorKindNames = (): string[] => Array.from(kinds.keys());

/** How the fan-out reaches sockets. Injected so this module stays pure. */
export interface SpectatorTransport {
  /** Client ids currently subscribed to this channel key. */
  subscribers(key: string): string[];
  send(clientId: string, payload: unknown): void;
}

let transport: SpectatorTransport | null = null;

export function attachSpectatorTransport(t: SpectatorTransport): void {
  transport = t;
}

/**
 * The public state a viewer needs when they arrive or reconnect mid game.
 *
 * Built only from events that have already been sanitised and sent, never from
 * a game session, so it cannot hold anything a live viewer was not already
 * shown.
 */
type Snapshot = {
  started: boolean;
  question?: Extract<SpectatorEvent, { type: "question" }>;
  toss?: Extract<SpectatorEvent, { type: "toss" }>;
  result?: Extract<SpectatorEvent, { type: "answered" }>;
  readiness?: Extract<SpectatorEvent, { type: "readiness" }>;
  sides?: PublicSide[];
};

const snapshots = new Map<string, Snapshot>();
/**
 * Last write per channel. Kept beside the snapshots rather than inside them so
 * the snapshot stays exactly the public state a viewer is shown, with no
 * bookkeeping mixed in.
 */
const touched = new Map<string, number>();

/**
 * A game that ends tidily deletes its own snapshot. Plenty do not: a battle
 * abandoned mid question never sends an "ended", and without a sweep those
 * entries would accumulate for the life of the process. Two hours is far longer
 * than any game and short enough that nothing meaningful is kept.
 */
const SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000;
/** A ceiling in case a burst arrives faster than the age sweep can help. */
const MAX_SNAPSHOTS = 500;

function sweep(): void {
  const cutoff = Date.now() - SNAPSHOT_TTL_MS;
  for (const [key, at] of touched) {
    if (at < cutoff) {
      snapshots.delete(key);
      touched.delete(key);
    }
  }
  if (snapshots.size <= MAX_SNAPSHOTS) return;
  // Oldest first, since Map preserves insertion order and every write re-sets
  // the entry, which moves it to the end.
  const excess = snapshots.size - MAX_SNAPSHOTS;
  let dropped = 0;
  for (const key of snapshots.keys()) {
    if (dropped++ >= excess) break;
    snapshots.delete(key);
    touched.delete(key);
  }
}

export const spectatorSnapshot = (channel: SpectatorChannel): Snapshot =>
  snapshots.get(channelKey(channel)) ?? { started: false };

export function clearSpectatorSnapshot(channel: SpectatorChannel): void {
  const key = channelKey(channel);
  snapshots.delete(key);
  touched.delete(key);
}

/**
 * Rebuild an event from its whitelist.
 *
 * Every field is copied by name. A caller that passes a whole question row, a
 * whole team row or anything else gets only the fields named here, so no
 * unexpected field can reach a viewer.
 */
function sanitise(event: SpectatorEvent): Record<string, unknown> {
  switch (event.type) {
    case "started":
      return { type: "started", ...(event.sides ? { sides: publicSides(event.sides) } : {}) };
    case "question":
      return {
        type: "question",
        questionId: String(event.questionId),
        questionNumber: event.questionNumber,
        totalQuestions: event.totalQuestions,
        questionText: event.questionText,
        options: (event.options ?? []).map(o => ({ id: String(o.id), text: String(o.text) })),
        answeringSideId: event.answeringSideId ?? null,
        answeringSideName: event.answeringSideName ?? null,
      };
    case "answered":
      return {
        type: "answered",
        questionId: event.questionId,
        questionNumber: event.questionNumber,
        answeringSideId: event.answeringSideId ?? null,
        answeringSideName: event.answeringSideName ?? null,
        selectedAnswerId: event.selectedAnswerId ?? null,
        correctAnswerId: event.correctAnswerId ?? null,
        isCorrect: !!event.isCorrect,
        pointsAwarded: Number(event.pointsAwarded ?? 0),
      };
    case "question_ended":
      return { type: "question_ended", questionId: event.questionId };
    case "toss":
      return {
        type: "toss",
        questionId: String(event.questionId),
        questionText: event.questionText,
        options: (event.options ?? []).map(o => ({ id: String(o.id), text: String(o.text) })),
      };
    case "toss_resolved":
      return {
        type: "toss_resolved",
        winnerSideId: event.winnerSideId ?? null,
        winnerSideName: event.winnerSideName ?? null,
        correctAnswerId: event.correctAnswerId ?? null,
      };
    case "readiness":
      return { type: "readiness", sideAReady: !!event.sideAReady, sideBReady: !!event.sideBReady };
    case "score":
      return { type: "score", sides: publicSides(event.sides) };
    case "ended":
      return {
        type: "ended",
        ...(event.sides ? { sides: publicSides(event.sides) } : {}),
        winnerSideId: event.winnerSideId ?? null,
        isDraw: !!event.isDraw,
      };
  }
}

/** Keep the reconnect snapshot in step with what was just sent. */
function remember(key: string, event: SpectatorEvent): void {
  const snap = snapshots.get(key) ?? { started: false };
  touched.set(key, Date.now());
  switch (event.type) {
    case "started":
      snap.started = true;
      if (event.sides) snap.sides = publicSides(event.sides);
      break;
    case "toss":
      snap.started = true;
      snap.toss = event;
      snap.question = undefined;
      snap.result = undefined;
      break;
    case "toss_resolved":
      snap.toss = undefined;
      break;
    case "question":
      snap.started = true;
      snap.question = event;
      snap.result = undefined;
      snap.toss = undefined;
      break;
    case "answered":
      snap.result = event;
      break;
    case "question_ended":
      snap.question = undefined;
      break;
    case "readiness":
      snap.readiness = event;
      break;
    case "score":
      snap.sides = publicSides(event.sides);
      break;
    case "ended":
      snapshots.delete(key);
      touched.delete(key);
      return;
  }
  // Delete then set, so the entry moves to the end of the insertion order and
  // the eviction above really does drop the least recently written.
  snapshots.delete(key);
  snapshots.set(key, snap);
  sweep();
}

/**
 * Send an event to everyone watching this channel.
 *
 * Sanitising happens here, not at the call site, so a new call site cannot
 * forget. The snapshot is updated from the sanitised event for the same reason.
 */
export function publishSpectatorEvent(
  channel: SpectatorChannel,
  event: SpectatorEvent,
): void {
  const key = channelKey(channel);
  const body = sanitise(event);
  remember(key, event);

  const kind = kinds.get(channel.kind);
  const payload: Record<string, unknown> = {
    ...body,
    type: `spectator_${body.type}`,
    kind: channel.kind,
    id: channel.id,
    ...(kind?.legacyFields ? kind.legacyFields(channel) : {}),
  };

  if (!transport) return;
  for (const clientId of transport.subscribers(key)) {
    transport.send(clientId, payload);
  }

  // Championships have a spectator page already in the wild listening for the
  // old names. Emit those too until it is retired. New kinds declare no legacy
  // type and so send one event only.
  const legacy = kind?.legacyType?.(event.type);
  if (legacy) {
    const legacyPayload = { ...payload, type: legacy };
    for (const clientId of transport.subscribers(key)) {
      transport.send(clientId, legacyPayload);
    }
  }
}

/** The restore event a viewer gets on subscribing or reconnecting. */
export function spectatorRestorePayload(
  channel: SpectatorChannel,
): { type: string } & Record<string, unknown> {
  const snap = spectatorSnapshot(channel);
  return {
    type: "spectator_restored",
    kind: channel.kind,
    id: channel.id,
    started: snap.started,
    question: snap.question ? sanitise(snap.question) : null,
    toss: snap.toss ? sanitise(snap.toss) : null,
    result: snap.result ? sanitise(snap.result) : null,
    readiness: snap.readiness ? sanitise(snap.readiness) : null,
    sides: snap.sides ?? null,
  };
}
