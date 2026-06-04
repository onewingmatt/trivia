import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = getDb();
  const games = db
    .prepare(
      `SELECT id, provider, model, score, total, questions, answers, results, created_at
       FROM games WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(user.id);

  return NextResponse.json({ games });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { gameId } = await req.json();
  if (!gameId) {
    return NextResponse.json({ error: "Game ID required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM games WHERE id = ? AND user_id = ?").run(gameId, user.id);

  return NextResponse.json({ ok: true });
}
