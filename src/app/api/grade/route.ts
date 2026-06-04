import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { apiKey, userAnswers, questions } = await req.json();

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    if (!userAnswers || !questions) {
      return NextResponse.json(
        { error: "Missing required data" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    // We send all 5 questions to be graded in one shot to save time
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert trivia judge. You will be given a list of questions, the correct answers, and a user's answers.
          You need to determine if the user's answer is correct or close enough to be considered correct (ignoring typos, minor spelling errors, missing 'the/a', or missing first names if the last name is highly distinguishing).
          
          Respond strictly in this JSON format:
          {
            "results": [
              {
                "isCorrect": boolean,
                "feedback": "Short, encouraging feedback explaining the right answer if they got it wrong."
              }
            ]
          }`
        },
        {
          role: "user",
          content: JSON.stringify({
            itemsToGrade: questions.map((q: { question: string, answer: string }, i: number) => ({
              question: q.question,
              officialAnswer: q.answer,
              userAnswer: userAnswers[i] || ""
            }))
          })
        }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content || "{}");

    return NextResponse.json({ results: parsed.results || [] });
  } catch (error: unknown) {
    console.error("Grade error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to grade answers" },
      { status: 500 }
    );
  }
}
