import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { apiKey } = await req.json();

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert trivia question writer in the style of the game show Jeopardy.
          Generate exactly 5 distinct, high-quality, and challenging Jeopardy-style clues.
          Each clue must come from a completely different category.
          
          Respond ONLY with a raw JSON array of objects. Do not include markdown formatting or backticks.
          
          Format each object exactly like this:
          {
            "category": "THE CATEGORY IN ALL CAPS",
            "question": "The Jeopardy style clue",
            "answer": "The concise answer (just the entity, no 'What is' prefix needed)"
          }`
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    
    // Sometimes the model wraps the array in a parent object even when we ask for an array, 
    // due to json_object requirements in some versions, so we need to parse defensively.
    let questions;
    try {
      const parsed = JSON.parse(content || "{}");
      if (Array.isArray(parsed)) {
        questions = parsed;
      } else if (parsed.questions && Array.isArray(parsed.questions)) {
        questions = parsed.questions;
      } else {
        // Fallback if it's an object with keys containing arrays
        const values = Object.values(parsed);
        const arrayVal = values.find(v => Array.isArray(v));
        questions = arrayVal || [];
      }
    } catch {
      questions = [];
    }

    if (!questions || questions.length !== 5) {
      // One more try requesting specifically an object with a "questions" array
      const fallbackCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Generate exactly 5 distinct, high-quality Jeopardy-style clues.
            Respond strictly in this JSON format:
            {
              "questions": [
                {
                  "category": "CATEGORY",
                  "question": "Clue",
                  "answer": "Answer"
                }
              ]
            }`
          }
        ],
        response_format: { type: "json_object" }
      });
      const fbContent = fallbackCompletion.choices[0].message.content;
      const fbParsed = JSON.parse(fbContent || "{}");
      questions = fbParsed.questions || [];
    }

    return NextResponse.json({ questions });
  } catch (error: unknown) {
    console.error("Generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate questions" },
      { status: 500 }
    );
  }
}
