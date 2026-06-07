import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPromptForStyle, parseQuestions } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { apiKey, baseURL, model, promptStyle = "full", count = 20 } = await req.json();
    const user = await getCurrentUser();

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 400 });
    }

    const selectedModel = model || "gpt-4o-mini";
    const safeCount = Math.min(Math.max(Number(count), 1), 30);

    const openai = new OpenAI({
      apiKey,
      ...(baseURL && { baseURL }),
    });

    let content: string | null;
    try {
      const completion = await openai.chat.completions.create({
        model: selectedModel,
        messages: [{ role: "system", content: getPromptForStyle(promptStyle, safeCount, [], []) }],
        response_format: { type: "json_object" },
      });
      content = completion.choices[0].message.content;
    } catch {
      const completion = await openai.chat.completions.create({
        model: selectedModel,
        messages: [{ role: "system", content: getPromptForStyle(promptStyle, safeCount, [], []) }],
      });
      content = completion.choices[0].message.content;
    }

    const questions = parseQuestions(content);

    // Stamp each with model AND prompt style
    const stamped = questions.map((q: any) => ({
      ...q,
      model: selectedModel,
      promptStyle,
    }));

    if (!stamped || stamped.length === 0) {
      return NextResponse.json(
        { error: "Model returned no valid questions. Try a different model or prompt style." },
        { status: 500 }
      );
    }

    // Save as a seed game record
    let storedCount = 0;
    if (user) {
      const db = getDb();
      db.prepare(
        "INSERT INTO games (user_id, provider, model, total, questions, answers) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(
        user.id,
        "seed-pool",
        selectedModel,
        stamped.length,
        JSON.stringify(stamped),
        JSON.stringify([])
      );
      storedCount = stamped.length;
    }

    return NextResponse.json({
      stored: storedCount,
      questions: stamped,
    });
  } catch (error: unknown) {
    console.error("Generate seed error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate seed questions" },
      { status: 500 }
    );
  }
}
