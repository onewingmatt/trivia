// Increase timeout for board generation (5-10 min with verification)
export const maxDuration = 600; // 10 minutes

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ROULETTE_CATEGORIES } from "@/lib/prompts";

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- Wikipedia verification ----------

async function wikiPageExists(title: string): Promise<{ ok: boolean; pageTitle?: string }> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?format=json&action=query&titles=${encodeURIComponent(title)}&redirects=1`;
    const res = await fetch(url, { headers: { "User-Agent": "TriviaBoard/1.0" }, signal: AbortSignal.timeout(8000) });
    const data: any = await res.json();
    const pages = data?.query?.pages || {};
    for (const pid of Object.keys(pages)) {
      if (pid !== "-1" && pages[pid]?.title) {
        return { ok: true, pageTitle: pages[pid].title };
      }
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

async function fetchWikiContent(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?format=json&action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro&explaintext&redirects=1`;
    const res = await fetch(url, { headers: { "User-Agent": "TriviaBoard/1.0" }, signal: AbortSignal.timeout(10000) });
    const data: any = await res.json();
    const pages = data?.query?.pages || {};
    for (const pid of Object.keys(pages)) {
      if (pid !== "-1" && pages[pid]?.extract) {
        return pages[pid].extract;
      }
    }
    return null;
  } catch {
    return null;
  }
}

const CLUE_WRITING_GUIDE = `JEOPARDY CLUE WRITING RULES:

1. START WITH A SPECIFIC HOOK, not a category label.
  BAD: "This Roman emperor ruled from 27 BC..." (starts with "This Roman emperor")
  GOOD: "The month of Sextilis was renamed to honor this emperor."

2. LENGTH: 40-80 words. Two or three sentences. Build context with specifics — dates, locations, names — then end on the revealing detail. NOT optional.
  TOO SHORT: "This 1939 film was the first to use Technicolor throughout." (11 words — flash card)
  REAL JEOPARDY: "Judy Garland was just 16 when she starred in this 1939 fantasy film; its Technicolor beauty contrasted with the sepia-toned Kansas scenes, and a brainless scarecrow, a heartless tin man, and a cowardly lion joined her on the yellow brick road." (42 words)

3. THE REVEAL SHOULD FEEL INEVITABLE. The last words identify the answer uniquely.
  BAD: "Charles Darwin's theory about species change." → too vague
  GOOD: "Galapagos finches showed this man that species adapt over generations." → Charles Darwin

4. SPECIFICITY IS EVERYTHING. Use dates, numbers, unique details.
  BAD: "This element was discovered by Marie Curie." (which one?)
  GOOD: "Named for her homeland, this element was isolated by Marie Curie in 1898." (Polonium)

5. DIFFICULTY TIERS (use these as a guide):
  $200: Most accessible in this category. "Red planet in our solar system." [Mars]
  $400: Familiar. "Mariner 9 reached this planet in 1971." [Mars]
  $600: Moderate. "This mineral on Mars proved it once had water." [Jarosite]
  $800: Tough. "Phobos and Deimos are the moons of this planet." [Mars]
  $1000: Expert. "The Tharsis region contains Olympus Mons on this planet." [Mars]

KEY: Different subject per clue — no repeated answers.
ABSOLUTE RULE: The answer word MUST NOT appear anywhere in the clue. No form of it, no idiom containing it. The player must deduce the answer from surrounding facts alone.`;

const VERIFY_PROMPT = `You are a Jeopardy clue verifier. Is the following clue ACCURATE about its intended answer?

Return JSON: {"correct": true/false, "reason": "brief explanation"}

Be LENIENT — the clue may rephrase information in different words. Only reject if the clue contains a factual error (wrong date, wrong attribution, made-up claim). Accept reasonable paraphrasing.`;

// ---------- Main endpoint ----------

export async function POST(req: NextRequest) {
  try {
    const { apiKey, baseURL, model } = await req.json();
    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 400 });
    }

    const user = await getCurrentUser();
    const selectedModel = model || "gpt-4o-mini";
    const openai = new OpenAI({ apiKey, ...(baseURL && { baseURL }) });

    const categories = shuffle(ROULETTE_CATEGORIES).slice(0, 6);
    const values = [200, 400, 600, 800, 1000];
    const board: { name: string; clues: any[] }[] = [];

    for (const cat of categories) {
      let clues: any[] = [];
      let attempts = 0;
      const maxAttempts = 3;

      while (clues.length < 5 && attempts < maxAttempts) {
        attempts++;
        const remaining = values.slice(clues.length);
        const diffInstructions = remaining.map(v => {
          const tier = v <= 200 ? "ACCESSIBLE" : v <= 400 ? "MODERATE" : v <= 600 ? "SOLID" : v <= 800 ? "TOUGH" : "EXPERT";
          return `$${v} (${tier}): The ${["most accessible", "second-easiest", "mid-level", "challenging", "deepest-cut"][Math.floor((v-200)/200)]} question in this category.`;
        }).join("\n");

        // Category-specific wordplay instructions
        const cl = cat.toLowerCase();
        let catExtra = "";
        if (cl.includes("rhyme")) catExtra = "\nCRITICAL: WORDPLAY. The answer must rhyme with something in the clue. Example: 'Batman's evening meal partner' → 'Batman's flat man'.";
        else if (cl.includes("anagram")) catExtra = "\nCRITICAL: WORDPLAY. The clue must involve rearranging letters.";
        else if (cl.includes("before") && cl.includes("after")) catExtra = "\nCRITICAL: WORDPLAY. Two phrases joined at a common word.";
        else if (cl.includes("double meaning") || cl.includes("wordplay")) catExtra = "\nCRITICAL: WORDPLAY. Use a double meaning or pun.";

        const prompt = `Create ${remaining.length} Jeopardy clues in the category "${cat}".\nEach about a DIFFERENT specific subject. No repeated answers in this category.\n\n${CLUE_WRITING_GUIDE}\n\nApply this to "${cat}":\n${diffInstructions}\n\nCRITICAL RULES:
|- Answers MUST be real, verifiable entities with a Wikipedia page
|- Each clue must ONLY describe facts that are true about the answer
|- Do NOT use "What is" in the answer — just the entity name
|- Vary subjects within the category (don't pick all from the same sub-topic)
|${catExtra}
|
|Output JSON with a "clues" array. Each clue: value (int), question (string), answer (string).`;

        try {
          const completion = await openai.chat.completions.create({
            model: selectedModel,
            messages: [
              { role: "system", content: "You write Jeopardy clues with precise difficulty calibration. Output valid JSON." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" } as any,
          });

          const raw = completion.choices[0].message.content || "{}";
          const parsed = JSON.parse(raw);
          const generated = (parsed.clues || []).map((c: any) => ({
            value: c.value || 0,
            question: c.question || "",
            answer: (c.answer || "").replace(/^(what\s+(is|are|was|were)\s+)/i, "").trim().replace(/\?$/, ""),
            played: false,
            correct: null as boolean | null,
          }));

          // Verify each clue's answer against Wikipedia
          for (const clue of generated) {
            if (clues.length >= 5) break;
            if (!clue.answer || clue.answer === "?") continue;
            
            // Dedup: skip if answer already used in this category
            if (clues.some((e: any) => e.answer.toLowerCase() === clue.answer.toLowerCase())) continue;

            // Skip if answer word appears in the question (spoils the clue)
            if (clue.answer && clue.question) {
              const ansWords = clue.answer.toLowerCase().split(/\s+/);
              const qLower = clue.question.toLowerCase();
              if (ansWords.some(w => w.length > 3 && qLower.includes(w))) {
                continue;
              }
            }

            const wiki = await wikiPageExists(clue.answer);
            if (!wiki.ok) {
              // Try cleaning the answer further
              const cleaned = clue.answer.replace(/^the\s+/i, "").replace(/\s+\(.*\)$/, "").trim();
              const wiki2 = await wikiPageExists(cleaned);
              if (wiki2.ok) {
                clue.answer = wiki2.pageTitle || cleaned;
              } else {
                continue; // Skip this clue, regenerate below
              }
            } else {
              clue.answer = wiki.pageTitle || clue.answer;
            }

            // Fetch article content and verify clue facts
            const content = await fetchWikiContent(clue.answer);
            if (content) {
              try {
                const vcomp = await openai.chat.completions.create({
                  model: selectedModel,
                  messages: [
                    { role: "system", content: VERIFY_PROMPT },
                    { role: "user", content: JSON.stringify({
                      clue: clue.question,
                      intended_answer: clue.answer,
                      wiki_article: content.slice(0, 2000),
                    })},
                  ],
                  response_format: { type: "json_object" } as any,
                });
                const vresult = JSON.parse(vcomp.choices[0].message.content || "{}");
                if (vresult.correct === false) {
                  // Regenerate from verified Wikipedia source
                  const regen = await openai.chat.completions.create({
                    model: selectedModel,
                    messages: [
                      { role: "system", content: "You write Jeopardy clues from source text. Output valid JSON. The answer word MUST NOT appear in the clue." },
                      { role: "user", content: `Write a Jeopardy clue using ONLY the provided source text about ${clue.answer}.\n\nSource:\n${content.slice(0, 1500)}\n\nOutput JSON with "question" and "answer" keys.` },
                    ],
                    response_format: { type: "json_object" } as any,
                  });
                  const regenParsed = JSON.parse(regen.choices[0].message.content || "{}");
                  if (regenParsed.question) {
                    // Check regenerated clue doesn't contain the answer
                    const ansWords = clue.answer.toLowerCase().split(/\s+/);
                    const rqLower = regenParsed.question.toLowerCase();
                    if (ansWords.some(w => w.length > 3 && rqLower.includes(w))) {
                      continue;
                    }
                    clue.question = regenParsed.question;
                  } else {
                    continue;
                  }
                }
              } catch {} // If verification call fails, accept clue anyway
            }

            clues.push(clue);
          }
        } catch {}
      }

      // Pad any remaining with FAIL
      while (clues.length < 5) {
        const val = values[clues.length];
        clues.push({ value: val, question: "[FAIL]", answer: "?", played: false, correct: null });
      }

      board.push({ name: cat, clues: clues.slice(0, 5) });
    }

    // Save game in DB
    let gameId: number | null = null;
    if (user) {
      const db = getDb();
      const questions = board.flatMap(c => c.clues.map(cl => ({
        category: c.name,
        question: cl.question,
        answer: cl.answer,
        value: cl.value,
      })));
      const result = db
        .prepare("INSERT INTO games (user_id, provider, model, total, questions, answers) VALUES (?, ?, ?, ?, ?, ?)")
        .run(user.id, baseURL || "openai", selectedModel, 30, JSON.stringify(questions), JSON.stringify(Array(30).fill("")));
      gameId = Number(result.lastInsertRowid);
    }

    return NextResponse.json({ board, gameId });
  } catch (error: unknown) {
    console.error("Board generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate board" },
      { status: 500 }
    );
  }
}
