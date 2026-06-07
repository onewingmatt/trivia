import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

const DB_PATH = path.join(process.cwd(), "data", "trivia.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  // ensure data dir exists
  const fs = require("fs");
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Use IF NOT EXISTS for initial tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT,
      model TEXT,
      score INTEGER,
      total INTEGER DEFAULT 5,
      questions TEXT NOT NULL,
      answers TEXT NOT NULL,
      results TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS question_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      question_index INTEGER NOT NULL,
      rating TEXT NOT NULL CHECK(rating IN ('like', 'dislike')),
      report TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(game_id, user_id, question_index),
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Migrations — add columns that may not exist yet
  const migrations: string[] = [];

  // Add difficulty column to question_feedback if missing
  try {
    _db.exec("ALTER TABLE question_feedback ADD COLUMN difficulty TEXT CHECK(difficulty IN ('too_easy', 'just_right', 'too_hard'))");
  } catch {
    // Column already exists — ignore
  }

  // Add question_model column to question_feedback if missing
  try {
    _db.exec("ALTER TABLE question_feedback ADD COLUMN question_model TEXT");
  } catch {
    // Column already exists — ignore
  }

  // Add question_prompt_style column to question_feedback if missing
  try {
    _db.exec("ALTER TABLE question_feedback ADD COLUMN question_prompt_style TEXT");
  } catch {
    // Column already exists — ignore
  }

  return _db;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const SESSION_DURATION_DAYS = 30;
