import "dotenv/config";
import { resolveDefaultAvatarPath } from "../shared/user-validation";
import { hashPassword } from "../server/auth";
import { seedDefaultCommentator } from "../server/commentator-seed";
import { database } from "../server/database";

const result = await seedDefaultCommentator({
  getUserByUsername: username => database.getUserByUsername(username),
  createUser: user => database.createUser(user),
  updateUser: (id, updates) => database.updateUser(id, updates),
  hashPassword,
  resolveDefaultAvatarPath,
  warn: message => console.warn(message),
  info: message => console.log(message),
});

console.log(`[seed] Default commentator result: ${result}`);
process.exit(0);
