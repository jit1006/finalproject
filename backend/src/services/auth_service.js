import { config } from "../config.js";
import { unauthorized } from "../errors.js";
import { userRepo } from "../repositories/index.js";
import { hashPassword, verifyPassword, newSessionToken, hashToken } from "../security.js";
import { AppUser } from "../models/index.js";

export function authenticate(email, password) {
  const user = userRepo.findByEmail(email);
  if (!user || !AppUser.isActive(user) || !verifyPassword(password, user.passwordHash)) {
    // Uniform message: never reveal whether the email exists.
    throw unauthorized("Invalid email or password");
  }
  return user;
}

export function createSession(user) {
  const raw = newSessionToken();
  const expires = new Date(Date.now() + config.sessionTtlMinutes * 60_000).toISOString();
  userRepo.createSession(hashToken(raw), user.userId, expires);
  return raw;
}

export function resolveSession(rawToken) {
  if (!rawToken) throw unauthorized();
  const row = userRepo.findSession(hashToken(rawToken));
  const now = new Date().toISOString();
  if (!row || row.revoked_at || row.expires_at <= now) throw unauthorized("Session expired or invalid");
  const user = userRepo.findById(row.user_id);
  if (!user || !AppUser.isActive(user)) throw unauthorized("Account is inactive");
  return user;
}

export function revokeSession(rawToken) {
  if (!rawToken) return;
  userRepo.revokeSession(hashToken(rawToken), new Date().toISOString());
}

// Used by the create_user script.
export function provisionUser(input) {
  const user = {
    ...input,
    passwordHash: hashPassword(input.password),
    status: "ACTIVE",
  };
  return AppUser.toPublic(userRepo.upsert(user));
}
