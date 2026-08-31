/**
 * Default commentator account seed tests.
 *
 * Run with: npx tsx server/commentator-seed.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_COMMENTATOR_PASSWORD_ENV,
  DEFAULT_COMMENTATOR_USERNAME,
  decideDefaultCommentatorSeed,
  readDefaultCommentatorPassword,
  seedDefaultCommentator,
} from "./commentator-seed.ts";

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

function unusedUpdateUser() {
  throw new Error("updateUser must not run during create/missing-password");
}

await test("password is read only from DEFAULT_COMMENTATOR_PASSWORD", () => {
  assert.equal(DEFAULT_COMMENTATOR_USERNAME, "commentator");
  assert.equal(DEFAULT_COMMENTATOR_PASSWORD_ENV, "DEFAULT_COMMENTATOR_PASSWORD");
  assert.equal(readDefaultCommentatorPassword({}), null);
  assert.equal(readDefaultCommentatorPassword({ DEFAULT_COMMENTATOR_PASSWORD: "" }), null);
  assert.equal(readDefaultCommentatorPassword({ DEFAULT_COMMENTATOR_PASSWORD: "   " }), null);
  assert.equal(
    readDefaultCommentatorPassword({ DEFAULT_COMMENTATOR_PASSWORD: "  configured-secret  " }),
    "configured-secret",
  );
});

await test("missing password skips creation instead of inventing a default", () => {
  assert.deepEqual(
    decideDefaultCommentatorSeed({ existingUser: null, password: null }),
    { action: "skip-missing-password" },
  );
});

await test("existing username with a configured password is updated, not duplicated", () => {
  assert.deepEqual(
    decideDefaultCommentatorSeed({
      existingUser: { id: 42, username: "commentator" },
      password: "configured-secret",
    }),
    { action: "update", password: "configured-secret", userId: 42 },
  );
});

await test("existing username without a configured password is not updated", () => {
  assert.deepEqual(
    decideDefaultCommentatorSeed({
      existingUser: { id: 42, username: "commentator" },
      password: null,
    }),
    { action: "skip-missing-password" },
  );
});

await test("new commentator is created only when the username is free and a password is configured", () => {
  assert.deepEqual(
    decideDefaultCommentatorSeed({ existingUser: null, password: "configured-secret" }),
    { action: "create", password: "configured-secret" },
  );
});

await test("first seed creates the account with a hashed password and commentator/non-admin roles", async () => {
  const created: Array<Record<string, unknown>> = [];
  const result = await seedDefaultCommentator({
    getUserByUsername: async () => undefined,
    createUser: async (user) => {
      created.push(user);
      return user;
    },
    updateUser: unusedUpdateUser,
    hashPassword: async (password) => {
      assert.equal(password, "configured-secret");
      assert.equal(password.includes("."), false, "plaintext password must not already look hashed");
      return "hashed-value.salt";
    },
    env: { DEFAULT_COMMENTATOR_PASSWORD: "configured-secret" },
  });

  assert.equal(result, "created");
  assert.equal(created.length, 1);
  assert.equal(created[0].username, "commentator");
  assert.equal(created[0].password, "hashed-value.salt");
  assert.notEqual(created[0].password, "configured-secret");
  assert.equal(created[0].isCommentator, true);
  assert.equal(created[0].isAdmin, false);
});

await test("running setup again does not create a duplicate and updates the hashed password from env", async () => {
  let createCalls = 0;
  const updates: Array<{ id: number; updates: Record<string, unknown> }> = [];
  const hashedPasswords: string[] = [];

  const first = await seedDefaultCommentator({
    getUserByUsername: async () => undefined,
    createUser: async () => {
      createCalls += 1;
    },
    updateUser: unusedUpdateUser,
    hashPassword: async (password) => {
      hashedPasswords.push(password);
      return "hashed-first.salt";
    },
    env: { DEFAULT_COMMENTATOR_PASSWORD: "first-secret" },
  });

  const second = await seedDefaultCommentator({
    getUserByUsername: async () => ({ id: 42, username: "commentator" }),
    createUser: async () => {
      createCalls += 1;
    },
    updateUser: async (id, userUpdates) => {
      updates.push({ id, updates: userUpdates });
    },
    hashPassword: async (password) => {
      hashedPasswords.push(password);
      return "hashed-second.salt";
    },
    env: { DEFAULT_COMMENTATOR_PASSWORD: "second-secret" },
  });

  assert.equal(first, "created");
  assert.equal(second, "updated");
  assert.equal(createCalls, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 42);
  assert.equal(updates[0].updates.password, "hashed-second.salt");
  assert.notEqual(updates[0].updates.password, "second-secret");
  assert.equal(updates[0].updates.isCommentator, true);
  assert.equal(updates[0].updates.isAdmin, false);
  assert.deepEqual(Object.keys(updates[0].updates).sort(), ["isAdmin", "isCommentator", "password"]);
  assert.deepEqual(hashedPasswords, ["first-secret", "second-secret"]);
});

await test("existing commentator roles are forced to commentator/non-admin on update", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const result = await seedDefaultCommentator({
    getUserByUsername: async () => ({ id: 7, username: "commentator" }),
    createUser: async () => {
      throw new Error("must not create a duplicate");
    },
    updateUser: async (_id, userUpdates) => {
      updates.push(userUpdates);
    },
    hashPassword: async () => "hashed-value.salt",
    env: { DEFAULT_COMMENTATOR_PASSWORD: "configured-secret" },
  });
  assert.equal(result, "updated");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].isCommentator, true);
  assert.equal(updates[0].isAdmin, false);
});

await test("missing env var warns without logging a password and does not create or update", async () => {
  const warnings: string[] = [];
  let createCalls = 0;
  let updateCalls = 0;
  const result = await seedDefaultCommentator({
    getUserByUsername: async () => ({ id: 42, username: "commentator" }),
    createUser: async () => {
      createCalls += 1;
    },
    updateUser: async () => {
      updateCalls += 1;
    },
    hashPassword: async () => "hashed-value.salt",
    env: {},
    warn: (message) => warnings.push(message),
  });
  assert.equal(result, "missing-password");
  assert.equal(createCalls, 0);
  assert.equal(updateCalls, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /DEFAULT_COMMENTATOR_PASSWORD/);
  assert.doesNotMatch(warnings[0], /configured-secret|CHANGE_THIS_PASSWORD|password=/i);
});

await test("seed is wired into setupAuth, updates via hashPassword, and never assigns a championship", () => {
  const authSource = read("server/auth.ts");
  const seedSource = read("server/commentator-seed.ts");
  assert.match(authSource, /createInitialCommentator\(\)/);
  assert.match(authSource, /seedDefaultCommentator/);
  assert.match(authSource, /updateUser: \(id, updates\) => database\.updateUser\(id, updates\)/);
  assert.match(authSource, /hashPassword/);
  assert.match(seedSource, /isAdmin: false/);
  assert.match(seedSource, /isCommentator: true/);
  assert.doesNotMatch(seedSource, /commentatorUserId/);
  assert.doesNotMatch(seedSource, /championships/);
  assert.doesNotMatch(authSource, /DEFAULT_COMMENTATOR_PASSWORD\s*=/);
});

await test("no public API endpoint creates the default commentator account", () => {
  const commentatorRoutes = read("server/commentator-routes.ts");
  const routes = read("server/routes.ts");
  assert.doesNotMatch(commentatorRoutes, /createUser/);
  assert.doesNotMatch(commentatorRoutes, /seedDefaultCommentator/);
  assert.doesNotMatch(routes, /app\.(post|put).*\/api\/commentator.*create/i);
});

await test("login uses the existing session auth against the hashed password and never returns a password", () => {
  const authSource = read("server/auth.ts");
  const loginPage = read("client/src/pages/CommentatorLoginPage.tsx");
  const sanitize = read("server/user-profile.ts");
  assert.match(authSource, /app\.post\("\/api\/login"/);
  assert.match(authSource, /comparePasswords\(password, user\.password\)/);
  assert.match(authSource, /res\.status\(200\)\.json\(sanitizeUser\(freshUser \?\? user\)\)/);
  assert.match(loginPage, /loginMutation\.mutate/);
  assert.match(loginPage, /setLocation\("\/commentator"\)/);
  assert.match(sanitize, /export function sanitizeUser/);
  assert.doesNotMatch(sanitize, /password:/);
});

await test("commentator dashboard authorization stays separate from admin", () => {
  const routes = read("server/routes.ts");
  const gate = read("client/src/components/ProtectedRoute.tsx");
  const app = read("client/src/App.tsx");
  assert.match(routes, /function ensureAdmin/);
  assert.match(routes, /req\.user && req\.user\.isAdmin/);
  assert.match(routes, /function ensureCommentator/);
  assert.match(routes, /req\.user\.isCommentator && !req\.user\.isAdmin/);
  assert.match(gate, /if \(!user\?\.isCommentator \|\| user\.isAdmin\)/);
  assert.match(app, /CommentatorGate/);
  assert.match(app, /AdminGate/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
