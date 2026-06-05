import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const BASE_PROMPT = `You are a veteran Jeopardy! clue writer with decades of experience on the show's writing staff. You follow the same craft principles used in the actual Jeopardy! writers room.

CORE PHILOSOPHY — a good clue must get one of three reactions: "I knew that," "Darn, I should have known that," or "I didn't know that, but now I'm glad I do." The goal is NEVER to stump — it's to give the solver a satisfying "aha" moment.

BOARD COMPOSITION:
- ACADEMIC: Science, History, Literature, Geography, Art
- POP CULTURE: Film, TV, Music, Sports, Gaming, Celebrities
- LIFESTYLE: Food & Drink, Fashion, Travel, Business, Cars, Health, Religion
- WORD PLAY: Rhymes, anagrams, letter patterns, double meanings, puns
- INTERDISCIPLINARY: Categories where all answers share a thread but span different domains

CATEGORY NAMING: Specific and creative with wordplay where possible. Not "HISTORY" but "HISTORICAL HEAVYWEIGHTS".

STRUCTURAL RULES:
1. PINNING. Exactly ONE correct answer.
2. LENGTH & DENSITY. 30-50 WORDS minimum. Real Jeopardy clues take a full breath to read aloud.
3. THREE-FACT LAYERING. Opener (broad), Middle (narrowing), Closer (pinning detail near the END).
4. TWO-STEP REASONING. Require connecting two pieces of information, not just recalling one fact.
5. MISDIRECTION. Set up an expectation in the opener that the closer subverts.
6. VOICE & TONE. Wry, confident, never robotic. A subtle wink to the reader.
7. NEVER reveal words from the answer in the clue itself.

EXAMPLES:
BAD (too short, single fact): "This physicist developed the theory of relativity."
GOOD (three facts, two-step reasoning, 40+ words, pinned): "In 1905, while working as a third-class examiner at the Swiss patent office in Bern, this future Nobel laureate published four groundbreaking papers in a single year — though the prize he eventually won was for the photoelectric effect, not the equation E=mc² for which he is best known today."
`;

function getSystemPrompt(count: number, avoidCats: string[] = []) {
  const avoidText = avoidCats.length > 0 
    ? `\nCRITICAL: DO NOT use these categories as they are already in the game: ${avoidCats.join(", ")}.` 
    : "";
  return `${BASE_PROMPT}\nGenerate exactly ${count} clues from ${count} completely different categories.${avoidText}\n\nYou MUST respond with valid JSON. Output ONLY a JSON object with a "questions" array. No markdown, no backticks, no extra text.\nFormat:\n{\n  "questions": [\n    {"category": "CREATIVE CATEGORY NAME IN CAPS", "question": "The clue text", "answer": "Just the answer entity"},\n    ...\n  ]\n}`;
}

function getFallbackPrompt(count: number, avoidCats: string[] = []) {
  const avoidText = avoidCats.length > 0 ? `\nDO NOT use these categories: ${avoidCats.join(", ")}.` : "";
  return `You are a veteran Jeopardy! clue writer. Write exactly ${count} clues from different categories.${avoidText}\n\nCRITICAL RULES:\n- Each clue must be 30-50 words.\n- Each clue must contain at least 3 distinct facts layered progressively.\n- Clues must be PINNED: only one possible correct answer.\n- Write as statements. Wry, confident tone.\n- Never use words from the answer in the clue.\n\nOutput ONLY valid JSON, no markdown:\n{"questions":[{"category":"CREATIVE CATEGORY IN CAPS","question":"The clue","answer":"The answer entity"}]}`;
}

function parseQuestions(raw: string | null): unknown[] {
  if (!raw) return [];
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.questions && Array.isArray(parsed.questions)) return parsed.questions;
    const arrayVal = Object.values(parsed).find(v => Array.isArray(v));
    return (arrayVal || []) as unknown[];
  } catch {
    return [];
  }
}

async function getSmartQuestions(userId: number, maxInject: number) {
  const db = getDb();
  const recentGames = db.prepare(`SELECT questions FROM games WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`).all(userId) as { questions: string }[];
  const seenQuestions = new Set<string>();
  const avoidCategories = new Set<string>();
  
  for (const game of recentGames) {
    try {
      const qs: any[] = JSON.parse(game.questions);
      for (const q of qs) {
        seenQuestions.add(q.question.trim().toLowerCase());
        avoidCategories.add(q.category.trim().toUpperCase());
      }
    } catch {}
  }

  const likedFeedback = db.prepare(`
    SELECT gf.game_id, gf.question_index
    FROM question_feedback gf
    WHERE gf.user_id = ? AND gf.rating = 'like'
    ORDER BY RANDOM()
    LIMIT 20
  `).all(userId) as { game_id: number; question_index: number }[];

  const injected: any[] = [];
  for (const fb of likedFeedback) {
    if (injected.length >= maxInject) break;
    const game = db.prepare("SELECT questions FROM games WHERE id = ?").get(fb.game_id) as { questions: string } | undefined;
    if (!game) continue;
    try {
      const qs: any[] = JSON.parse(game.questions);
      const q = qs[fb.question_index];
      const qText = q.question.trim().toLowerCase();
      const catText = q.category.trim().toUpperCase();
      
      if (q && !seenQuestions.has(qText) && !avoidCategories.has(catText)) {
        injected.push(q);
        seenQuestions.add(qText);
        avoidCategories.add(catText);
      }
    } catch {}
  }
  return { questions: injected, avoidCategories: Array.from(avoidCategories) };
}
const FALLBACK_BANK = [
  { category: "HISTORICAL HEAVYWEIGHTS", question: "In 1905, while working as a third-class examiner at the Swiss patent office in Bern, this future Nobel laureate published four groundbreaking papers in a single year, though the prize he eventually won was for the photoelectric effect, not the equation for which he is best known today.", answer: "Albert Einstein" },
  { category: "LITERARY FIRSTS", question: "Published in 1851, this novel by Herman Melville was initially a commercial failure and a critical disappointment, only to be rediscovered and hailed as a masterpiece of American literature a century later.", answer: "Moby-Dick" },
  { category: "CULINARY CURIOSITIES", question: "Originally created in the 1920s by an Italian-American chef in New York who wanted to recreate a dish his grandmother made, this pasta features a creamy sauce made from egg yolks, hard cheese, cured pork, and black pepper.", answer: "Spaghetti alla Carbonara" },
  { category: "CELESTIAL BODIES", question: "Discovered in 1930 by Clyde Tombaugh, this dwarf planet was reclassified by the International Astronomical Union in 2006, sparking a debate that continues to this day among planetary scientists.", answer: "Pluto" },
  { category: "WORD PLAY", question: "Remove the first letter of this word meaning 'to flow swiftly', and you are left with a word meaning a small, narrow body of water.", answer: "Stream" },
  { category: "MUSICAL MASTERS", question: "Despite being completely deaf by the last decade of his life, this German composer continued to write music, including his monumental Ninth Symphony, which famously features a choral finale.", answer: "Ludwig van Beethoven" },
  { category: "GEOGRAPHICAL ODDITIES", question: "This landlocked country in South America is unique for having two capital cities: Sucre, which is the constitutional capital, and La Paz, which is the seat of government.", answer: "Bolivia" },
  { category: "TECHNOLOGY TITANS", question: "Founded in a garage in 1976, this company's first product was the Apple I, a computer kit that was assembled by hand and sold for $666.66.", answer: "Apple" },
  { category: "CINEMATIC MILESTONES", question: "Released in 1977, this science fiction film revolutionized the use of special effects in cinema and spawned a vast multimedia franchise that includes sequels, prequels, TV series, and theme parks.", answer: "Star Wars" },
  { category: "NATURAL WONDERS", question: "Located on the border of Zambia and Zimbabwe, this massive waterfall is known by the indigenous name 'Mosi-oa-Tunya', which translates to 'The Smoke That Thunders'.", answer: "Victoria Falls" }
];

export async function POST(req: NextRequest) {
  try {
    const { apiKey, baseURL, model, count = 5 } = await req.json();
    const safeCount = Math.min(Math.max(Number(count), 1), 15); // Clamp between 1 and 15
    const user = await getCurrentUser();
    const selectedModel = model || "gpt-4o-mini";
    
    // If no API key, serve from the local bank
    if (!apiKey) {
      let bankQuestions: any[] = [];
      
      if (user) {
        const smartData = await getSmartQuestions(user.id, Math.floor(safeCount / 3));
        bankQuestions = smartData.questions;
      }
      
      // Fill remaining slots from the fallback bank
      const remaining = safeCount - bankQuestions.length;
      if (remaining > 0) {
        const shuffledFallback = [...FALLBACK_BANK].sort(() => 0.5 - Math.random());
        // Filter out any categories we already have to maintain diversity
        const existingCats = new Set(bankQuestions.map((q: any) => q.category.toUpperCase()));
        const newQuestions = shuffledFallback.filter((q: any) => !existingCats.has(q.category.toUpperCase())).slice(0, remaining);
        bankQuestions = [...bankQuestions, ...newQuestions];
      }

      // Ensure we have exactly safeCount, shuffle them
      const finalQuestions = bankQuestions.slice(0, safeCount).sort(() => 0.5 - Math.random());

      let gameId: number | null = null;
      if (user) {
        const db = getDb();
        const result = db
          .prepare("INSERT INTO games (user_id, provider, model, total, questions, answers) VALUES (?, ?, ?, ?, ?, ?)")
          .run(user.id, "offline-bank", "local", safeCount, JSON.stringify(finalQuestions), JSON.stringify(Array(safeCount).fill("")));
        gameId = Number(result.lastInsertRowid);
      }

      return NextResponse.json({ questions: finalQuestions, gameId });
    }

    // --- API KEY PROVIDED: Use LLM ---
    let smartData = { questions: [] as any[], avoidCategories: [] as string[] };
    if (user) {
      smartData = await getSmartQuestions(user.id, Math.floor(safeCount / 3)); // Inject proportional to size
    }

    const remainingCount = safeCount - smartData.questions.length;
    let generatedQuestions: any[] = [];

    if (remainingCount > 0) {
      const openai = new OpenAI({
        apiKey,
        ...(baseURL && { baseURL }),
      });

      let content: string | null;
      try {
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [{ role: "system", content: getSystemPrompt(remainingCount, smartData.avoidCategories) }],
          response_format: { type: "json_object" },
        });
        content = completion.choices[0].message.content;
      } catch {
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [{ role: "system", content: getSystemPrompt(remainingCount, smartData.avoidCategories) }],
        });
        content = completion.choices[0].message.content;
      }

      generatedQuestions = parseQuestions(content);

      if (!generatedQuestions || generatedQuestions.length !== remainingCount) {
        const fb = await openai.chat.completions.create({
          model: selectedModel,
          messages: [{ role: "system", content: getFallbackPrompt(remainingCount, smartData.avoidCategories) }],
        });
        generatedQuestions = parseQuestions(fb.choices[0].message.content);
      }
    }

    const allQuestions = [...smartData.questions, ...generatedQuestions];
    
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }

    if (!allQuestions || allQuestions.length !== safeCount) {
      return NextResponse.json(
        { error: "Model returned invalid or incomplete questions. Try a different model or provider." },
        { status: 500 }
      );
    }

    let gameId: number | null = null;
    if (user) {
      const db = getDb();
      const result = db
        .prepare("INSERT INTO games (user_id, provider, model, total, questions, answers) VALUES (?, ?, ?, ?, ?, ?)")
        .run(user.id, baseURL || "openai", selectedModel, safeCount, JSON.stringify(allQuestions), JSON.stringify(Array(safeCount).fill("")));
      gameId = Number(result.lastInsertRowid);
    }

    return NextResponse.json({ questions: allQuestions, gameId });
  } catch (error: unknown) {
    console.error("Generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate questions" },
      { status: 500 }
    );
  }
}
