import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

// Serve the pre-generated verified board
export async function POST(req: NextRequest) {
  try {
    const boardPath = path.join(process.cwd(), "src", "data", "pregen-board.json");
    const raw = fs.readFileSync(boardPath, "utf-8");
    const data = JSON.parse(raw);

    // Save game in DB
    let gameId: number | null = null;
    const user = await getCurrentUser();
    if (user) {
      const db = getDb();
      const questions = data.categories.flatMap((c: any) =>
        c.clues.map((cl: any) => ({
          category: c.name,
          question: cl.question,
          answer: cl.answer,
          value: cl.value,
        }))
      );
      const result = db
        .prepare("INSERT INTO games (user_id, provider, model, total, questions, answers) VALUES (?, ?, ?, ?, ?, ?)")
        .run(user.id, "pregen", "mimo-v2.5", 30, JSON.stringify(questions), JSON.stringify(Array(30).fill("")));
      gameId = Number(result.lastInsertRowid);
    }

    return NextResponse.json({ board: data.categories, gameId });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load board" },
      { status: 500 }
    );
  }
}
