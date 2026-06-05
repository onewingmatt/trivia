import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const SYSTEM_PROMPT = `You are an expert trivia judge. You will be given a list of questions, the correct answers, and a user's answers.
Determine if each user answer is correct or close enough (ignore typos, minor spelling errors, missing 'the/a', or missing first names if the last name is highly distinguishing).

You MUST respond with valid JSON. Output ONLY a JSON object — no markdown, no backticks, no extra text.

Format:
{
  "results": [
    {"isCorrect": true/false, "feedback": "Short encouraging feedback. If wrong, explain the correct answer."},
    ...one per question
  ]
}`;

function parseResults(raw: string | null): { isCorrect: boolean; feedback: string }[] {
  if (!raw) return [];
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed.results || [];
  } catch {
    return [];
  }
}

function normalizeString(s: string): string {
  // Lowercase, remove all punctuation, trim whitespace
  return s.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const { apiKey, baseURL, model, userAnswers, questions, gameId } = await req.json();

    if (!userAnswers || !questions) {
      return NextResponse.json({ error: "Missing required data" }, { status: 400 });
    }

    let results: { isCorrect: boolean; feedback: string }[] = [];

    // OFFLINE MODE: Smart local grading (NO LLM)
    if (!apiKey) {
      results = questions.map((q: { question: string; answer: string }, i: number) => {
        const userAns = normalizeString(userAnswers[i] || "");
        const officialAns = normalizeString(q.answer);
        
        // Smart fuzzy match: exact match OR official answer contains the user's core answer (min 3 chars)
        const isCorrect = userAns === officialAns || (officialAns.includes(userAns) && userAns.length > 3);
        
        return {
          isCorrect,
          feedback: isCorrect 
            ? "Correct!" 
            : `Incorrect. The answer is: ${q.answer}`,
        };
      });
    } else {
      // ONLINE MODE: LLM Fuzzy Grading (handles typos, "What is...", partial matches)
      const openai = new OpenAI({
        apiKey,
        ...(baseURL && { baseURL }),
      });

      const selectedModel = model || "gpt-4o-mini";

      const userMessage = JSON.stringify({
        itemsToGrade: questions.map((q: { question: string; answer: string }, i: number) => ({
          question: q.question,
          officialAnswer: q.answer,
          userAnswer: userAnswers[i] || "",
        })),
      });

      let content: string | null;
      try {
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          response_format: { type: "json_object" },
        });
        content = completion.choices[0].message.content;
      } catch {
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
        });
        content = completion.choices[0].message.content;
      }

      results = parseResults(content);

      if (!results || results.length === 0) {
        return NextResponse.json(
          { error: "Model returned invalid grading results. Try a different model or provider." },
          { status: 500 }
        );
      }
    }

    // Update game in DB if logged in
    const score = results.filter((r) => r.isCorrect).length;
    const user = await getCurrentUser();
    if (user && gameId) {
      const db = getDb();
      db.prepare("UPDATE games SET answers = ?, results = ?, score = ? WHERE id = ? AND user_id = ?")
        .run(JSON.stringify(userAnswers), JSON.stringify(results), score, gameId, user.id);
    }

    return NextResponse.json({ results, score });
  } catch (error: unknown) {
    console.error("Grade error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to grade answers" },
      { status: 500 }
    );
  }
}
