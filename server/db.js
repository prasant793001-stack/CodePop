'use strict';
const Database = require('better-sqlite3');
const fs = require('fs'), path = require('path');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000');
  db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, sub TEXT UNIQUE NOT NULL, email TEXT, email_verified INTEGER DEFAULT 0, name TEXT,
  nickname TEXT NOT NULL, avatar TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'player',
  created INTEGER NOT NULL, last_login INTEGER, banned INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(
  hash TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, exp INTEGER NOT NULL, ip TEXT, ua TEXT);
CREATE INDEX IF NOT EXISTS sess_uid ON sessions(uid);
CREATE TABLE IF NOT EXISTS markers(
  token TEXT PRIMARY KEY, uid TEXT NOT NULL, cid TEXT NOT NULL, slot INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(
  id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, cid TEXT NOT NULL, started INTEGER NOT NULL, submitted INTEGER,
  code TEXT, score INTEGER, solved INTEGER, parts TEXT, tel TEXT, counters TEXT, verdict TEXT, reasons TEXT,
  counted INTEGER NOT NULL DEFAULT 0, decision TEXT, decided_by TEXT, decided_at INTEGER, note TEXT);
CREATE INDEX IF NOT EXISTS att_uid ON attempts(uid, cid);
CREATE INDEX IF NOT EXISTS att_counted ON attempts(counted, cid);
CREATE INDEX IF NOT EXISTS att_review ON attempts(verdict, decision);
CREATE TABLE IF NOT EXISTS projects(
  id TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, lang TEXT NOT NULL, code TEXT NOT NULL,
  created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS proj_uid ON projects(uid);
CREATE TABLE IF NOT EXISTS groups(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, code TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS group_members(
  gid TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, joined INTEGER NOT NULL, PRIMARY KEY(gid, uid));
CREATE TABLE IF NOT EXISTS group_challenges(
  id TEXT PRIMARY KEY, gid TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, cid TEXT NOT NULL, creator TEXT NOT NULL,
  mode TEXT NOT NULL, participants TEXT, created INTEGER NOT NULL, due INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT);
CREATE INDEX IF NOT EXISTS audit_target ON audit(target, ts);
`);
  return db;
}
module.exports = { openDb };
