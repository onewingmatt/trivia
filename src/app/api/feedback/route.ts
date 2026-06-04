import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { gameId, questionIndex, rating, difficulty, report } = await req.json();

  if (!gameId || questionIndex === undefined) {
    return NextResponse.json({ error: "gameId and questionIndex required" }, { status: 400 });
  }

  const db = getDb();

  const game = db.prepare("SELECT id FROM games WHERE id = ? AND user_id = ?").get(gameId, user.id);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Build the upsert dynamically based on what's provided
  if (rating) {
    if (!["like", "dislike"].includes(rating)) {
      return NextResponse.json({ error: "Rating must be 'like' or 'dislike'" }, { status: 400 });
    }
    db.prepare(
      `INSERT INTO question_feedback (game_id, user_id, question_index, rating, difficulty, report)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id, user_id, question_index) DO UPDATE SET rating = excluded.rating, report = COALESCE(excluded.report, question_feedback.report)`
    ).run(gameId, user.id, questionIndex, rating, null, report || null);
  }

  if (difficulty) {
    if (!["too_easy", "just_right", "too_hard"].includes(difficulty)) {
      return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 });
    }
    db.prepare(
      `INSERT INTO question_feedback (game_id, user_id, question_index, rating, difficulty, report)
       VALUES (?, ?, ?, 'like', ?, ?)
       ON CONFLICT(game_id, user_id, question_index) DO UPDATE SET difficulty = excluded.difficulty`
    ).run(gameId, user.id, questionIndex, difficulty, report || null);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { gameId, questionIndex } = await req.json();

  const db = getDb();
  db.prepare("DELETE FROM question_feedback WHERE game_id = ? AND user_id = ? AND question_index = ?")
    .run(gameId, user.id, questionIndex);

  return NextResponse.json({ ok: true });
}
