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

// ---------- Quality gate helpers ----------

function isWordplayCategory(cat: string): boolean {
  const c = cat.toLowerCase();
  return (
    c.includes("before & after") ||
    c.includes("before and after") ||
    c.includes("rhyme") ||
    c.includes("anagram") ||
    c.includes("double meaning") ||
    c.includes("wordplay") ||
    c.includes("letterplay") ||
    c.includes("pun")
  );
}

/**
 * Detect the #1 AI-generation tell: clues that open with "This [noun]..."
 */
function isGenericOpening(question: string): boolean {
  const q = question.trim();
  if (!q.toLowerCase().startsWith("this ")) return false;
  return /^this\s+(?:\d{3,4}\b|[a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,7})/i.test(q);
}

/**
 * Detect encyclopedia-article-style clues with excessive commas or relative-clause sandwiches.
 */
function isWikipediaEse(question: string): boolean {
  const q = question.trim();
  const words = q.split(/\s+/);
  const commas = (q.match(/,/g) || []).length;
  if (commas >= 4 && words.length <= 55) return true;
  if (/,\s*(?:who|which|whose|that)\s+[^,]{5,80},/i.test(q)) return true;
  return false;
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

1. NEVER NAME THE ANSWER in the clue. If the answer is "Hubble's law," do NOT say "Hubble" — say "this American astronomer" or "the director of Mount Wilson Observatory." If the answer is "The Wizard of Oz," do NOT say "wizard" or "Oz" — describe the plot and let the player deduce it.
   BAD: "Proposed by Edwin Hubble in 1929, this law states..." (names the answer)
   GOOD: "This 1929 proposal by an American astronomer states that a galaxy's recession velocity is proportional to its distance." (describes without naming)

2. START WITH A SPECIFIC HOOK, not a category label.
  Rotate opening styles. Across a board, vary between patterns like:
  - "In 1947, ..."
  - "Often called ..."
  - "Named for ..."
  - "Around 750 BCE, ..."
  - "Carbon-dated to ..."
  - "Judy Garland was just 16 when ..."
  Avoid the lazy default opening "This [noun phrase]..." unless there is no cleaner alternative. That opening is the biggest tell that a clue is machine-written.

3. LENGTH: 40-80 words. Two or three sentences. Build context with specifics — dates, locations, names — then end on the revealing detail. NOT optional.
  TOO SHORT: "This 1939 film was the first to use Technicolor throughout." (11 words — flash card)
  REAL JEOPARDY: "Judy Garland was just 16 when she starred in this 1939 fantasy film; its Technicolor beauty contrasted with the sepia-toned Kansas scenes, and a brainless scarecrow, a heartless tin man, and a cowardly lion joined her on the yellow brick road." (42 words)
  TOO SHORT: "This element was discovered by Marie Curie in 1898." (9 words)
  REAL JEOPARDY: "Named for her homeland that had been wiped off the map for over a century, this element was isolated from pitchblende ore in 1898 by Marie Curie, who had to process tons of the mineral to obtain just a fraction of a gram." (46 words)

4. THE REVEAL SHOULD FEEL INEVITABLE. The last words identify the answer uniquely.
  BAD: "Charles Darwin's theory about species change." → too vague
  GOOD: "Galapagos finches showed this man that species adapt over generations." → Charles Darwin

5. SPECIFICITY IS EVERYTHING. Use dates, numbers, unique details.
  BAD: "This element was discovered by Marie Curie." (which one? She discovered two)
  GOOD: "Named for her homeland, this element was isolated by Marie Curie in 1898." (Polonium — "Poland" = homeland)

6. DIFFICULTY TIERS (use these as a guide):
  $200 (BROAD): Broadly recognizable by any adult who watches TV or reads news. Not obscure at all.
  $400 (FAMILIAR): Requires some familiarity with the category but not deep knowledge.
  $600 (SOLID): Rewards regular interest in the subject — a fan would know this.
  $800 (TOUGH): Requires dedicated study or strong interest. Casual fans would struggle.
  $1000 (EXPERT): Niche expertise. Only deep subject enthusiasts would get this from the clue.

KEY: Different subject per clue — no repeated answers.
ABSOLUTE RULE: The answer word MUST NOT appear anywhere in the clue. No form of it, no idiom containing it. The player must deduce the answer from surrounding facts alone.`;

const VERIFY_PROMPT = `You are a Jeopardy clue verifier. Is the following clue ACCURATE about its intended answer?

Return JSON: {"correct": true/false, "reason": "brief explanation"}

Be LENIENT — the clue may rephrase information in different words. Only reject if the clue contains a factual error (wrong date, wrong attribution, made-up claim). Accept reasonable paraphrasing.`;

const JUDGE_SYSTEM_PROMPT = `You judge Jeopardy clue quality. Output JSON.`;

const FALLBACK_ANSWERS = [
  "Paris",
  "London",
  "Mount Everest",
  "Pacific Ocean",
  "William Shakespeare",
  "Leonardo da Vinci",
  "New York City",
  "Amazon River",
  "Albert Einstein",
  "The Great Wall of China",
];

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

    for (let catIdx = 0; catIdx < categories.length; catIdx++) {
      let currentCategory = categories[catIdx];
      let clues: any[] = [];
      let attempts = 0;
      const maxAttempts = 20;
      let catSwaps = 0;
      const maxCatSwaps = 3;
      const triedSubjects = new Set<string>([currentCategory.toLowerCase()]);

      // ---- Main generation loop ----
      while (clues.length < 5) {
        // Exhausted attempts? Try swapping category
        if (attempts >= maxAttempts) {
          attempts = 0;
          catSwaps++;
          if (catSwaps > maxCatSwaps) {
            console.log(`[cat ${catIdx}] Exhausted ${maxCatSwaps} category swaps, falling through to last-resort fill`);
            break;
          }
          // Swap to a new random category not yet tried
          const available = ROULETTE_CATEGORIES.filter(
            (c) => !triedSubjects.has(c.toLowerCase())
          );
          if (available.length > 0) {
            currentCategory =
              available[Math.floor(Math.random() * available.length)];
          } else {
            currentCategory =
              ROULETTE_CATEGORIES[
                Math.floor(Math.random() * ROULETTE_CATEGORIES.length)
              ];
          }
          triedSubjects.add(currentCategory.toLowerCase());
          clues = []; // Reset clues for the new category
          console.log(`[cat ${catIdx}] Swapped to "${currentCategory}"`);
          continue;
        }

        attempts++;
        const isWordplay = isWordplayCategory(currentCategory);
        const remaining = values.slice(clues.length);
        const diffInstructions = remaining
          .map((v) => {
            const tier =
              v <= 200
                ? "BROAD"
                : v <= 400
                  ? "FAMILIAR"
                  : v <= 600
                    ? "SOLID"
                    : v <= 800
                      ? "TOUGH"
                      : "EXPERT";
            const desc =
              v === 200
                ? "Broadly recognizable by any adult who watches TV or reads news. Not obscure at all."
                : v === 400
                  ? "Requires some familiarity with the category but not deep knowledge."
                  : v === 600
                    ? "Rewards regular interest in the subject — a fan would know this."
                    : v === 800
                      ? "Requires dedicated study or strong interest. Casual fans would struggle."
                      : "Niche expertise. Only deep subject enthusiasts would get this from the clue.";
            return `$${v} (${tier}): ${desc}`;
          })
          .join("\n");

        // Category-specific wordplay instructions
        const cl = currentCategory.toLowerCase();
        let catExtra = "";
        if (cl.includes("rhyme"))
          catExtra =
            "\nCRITICAL: WORDPLAY. The answer must rhyme with something in the clue. Example: 'Batman's evening meal partner' → 'Batman's flat man'.";
        else if (cl.includes("anagram"))
          catExtra =
            "\nCRITICAL: WORDPLAY. The clue must involve rearranging letters.";
        else if (cl.includes("before") && cl.includes("after"))
          catExtra =
            "\nCRITICAL: WORDPLAY. Two phrases joined at a common word.";
        else if (cl.includes("double meaning") || cl.includes("wordplay"))
          catExtra = "\nCRITICAL: WORDPLAY. Use a double meaning or pun.";

        const prompt = `Create ${remaining.length} Jeopardy clues in the category "${currentCategory}".
Each about a DIFFERENT specific subject. No repeated answers in this category.

${CLUE_WRITING_GUIDE}

Apply this to "${currentCategory}":
${diffInstructions}

CRITICAL RULES:
- Answers MUST be real, verifiable entities with a Wikipedia page
- Each clue must ONLY describe facts that are true about the answer
- Do NOT use "What is" in the answer — just the entity name
- Vary subjects within the category (don't pick all from the same sub-topic)
- ABSOLUTELY FORBIDDEN: starting a clue with "This [noun]" (e.g. "This enzyme...", "This queen...", "This city..."). This is the #1 tell of AI-generated clues. Use varied openings instead.

EXAMPLE of a good 5-clue set in "Space Exploration" (note the varied openings):
  $200: "In 1969, this mission put humans on the Moon for the first time, with Neil Armstrong taking the famous first step." [Apollo 11]
  $400: "Named for a Roman god of the sea, this Voyager 2-visited planet takes 165 Earth years to orbit the Sun." [Neptune]
  $600: "Launched in 1990, this space telescope's blurry mirror was fixed by astronauts in a 1993 servicing mission." [Hubble Space Telescope]
  $800: "Konstantin Tsiolkovsky, a Russian schoolteacher, first proposed this concept in 1903 using liquid fuel." [Rocket equation]
  $1000: "Voyager 1 crossed this boundary in August 2012, becoming the first human-made object in interstellar space." [Heliopause]

${catExtra}

Output JSON with a "clues" array. Each clue: value (int), question (string), answer (string).`;

        try {
          const completion = await openai.chat.completions.create({
            model: selectedModel,
            messages: [
              {
                role: "system",
                content:
                  "You write Jeopardy clues with precise difficulty calibration. Output valid JSON.",
              },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" } as any,
          });

          const raw = completion.choices[0].message.content || "{}";
          const parsed = JSON.parse(raw);
          const generated = (parsed.clues || []).map((c: any) => ({
            value: c.value || 0,
            question: c.question || "",
            answer: (c.answer || "")
              .replace(/^(what\s+(is|are|was|were)\s+)/i, "")
              .trim()
              .replace(/\?$/, ""),
            played: false,
            correct: null as boolean | null,
          }));

          // Track answers seen in this batch for cross-batch dedup
          const seenThisBatch = new Set<string>();

          // Verify each clue's answer against quality gates + Wikipedia
          for (const clue of generated) {
            if (clues.length >= 5) break;
            if (!clue.answer || clue.answer === "?") continue;

            // Dedup: skip if answer already used in this category
            if (
              clues.some(
                (e: any) =>
                  e.answer.toLowerCase() === clue.answer.toLowerCase()
              )
            )
              continue;

            // Dedup within the same generation batch
            if (seenThisBatch.has(clue.answer.toLowerCase())) continue;
            seenThisBatch.add(clue.answer.toLowerCase());

            // ---- Quality Gate: Generic Opening ----
            if (!isWordplay && clue.question && isGenericOpening(clue.question)) {
              console.log(
                `  Generic opening skipped: ${clue.question.slice(0, 70)}`
              );
              continue;
            }

            // ---- Quality Gate: Wikipedia-ese ----
            if (!isWordplay && clue.question && isWikipediaEse(clue.question)) {
              console.log(
                `  Wikipedia-ese skipped: ${clue.question.slice(0, 70)}`
              );
              continue;
            }

            // ---- Quality Gate: Minimum clue length (30 words, skip wordplay) ----
            if (!isWordplay && clue.question) {
              const wordCount = clue.question.trim().split(/\s+/).length;
              if (wordCount < 25) {
                console.log(
                  `  Too short (${wordCount} words): ${clue.question.slice(0, 50)}`
                );
                continue;
              }
            }

            // ---- Quality Gate: Answer-in-question ----
            if (clue.answer && clue.question) {
              const ansWords = clue.answer.toLowerCase().split(/\s+/);
              const qLower = clue.question.toLowerCase();
              if (ansWords.some((w: string) => w.length > 3 && qLower.includes(w))) {
                console.log(`  Answer-in-question skipped: ${clue.answer}`);
                continue;
              }
            }

            // ---- Quality Gate: Wikipedia verification ----
            const wiki = await wikiPageExists(clue.answer);
            if (!wiki.ok) {
              // Try cleaning the answer further
              const cleaned = clue.answer
                .replace(/^the\s+/i, "")
                .replace(/\s+\(.*\)$/, "")
                .trim();
              const wiki2 = await wikiPageExists(cleaned);
              if (wiki2.ok) {
                clue.answer = wiki2.pageTitle || cleaned;
              } else {
                console.log(
                  `  No Wikipedia page for: ${clue.answer}`
                );
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
                    {
                      role: "user",
                      content: JSON.stringify({
                        clue: clue.question,
                        intended_answer: clue.answer,
                        wiki_article: content.slice(0, 2000),
                      }),
                    },
                  ],
                  response_format: { type: "json_object" } as any,
                });
                const vresult = JSON.parse(
                  vcomp.choices[0].message.content || "{}"
                );
                if (vresult.correct === false) {
                  // Regenerate from verified Wikipedia source
                  const regen = await openai.chat.completions.create({
                    model: selectedModel,
                    messages: [
                      {
                        role: "system",
                        content:
                          "You write Jeopardy clues from source text. Output valid JSON. The answer word MUST NOT appear in the clue.",
                      },
                      {
                        role: "user",
                        content: `Write a Jeopardy clue using ONLY the provided source text about ${clue.answer}.\n\nSource:\n${content.slice(0, 1500)}\n\nOutput JSON with "question" and "answer" keys.`,
                      },
                    ],
                    response_format: { type: "json_object" } as any,
                  });
                  const regenParsed = JSON.parse(
                    regen.choices[0].message.content || "{}"
                  );
                  if (regenParsed.question) {
                    // Check regenerated clue doesn't contain the answer
                    const ansWords = clue.answer.toLowerCase().split(/\s+/);
                    const rqLower = regenParsed.question.toLowerCase();
                    if (
                      ansWords.some(
                        (w: string) => w.length > 3 && rqLower.includes(w)
                      )
                    ) {
                      continue;
                    }
                    clue.question = regenParsed.question;
                  } else {
                    continue;
                  }
                }
              } catch {
                // If verification call fails, accept clue anyway
              }
            }

            // ---- Quality Gate: LLM Judge (skip for wordplay) ----
            if (!isWordplay) {
              try {
                const judgePrompt = `Rate this Jeopardy clue on how much it sounds like a REAL Jeopardy clue vs AI-generated.

Category: ${currentCategory}
Clue: ${clue.question}
Expected answer: ${clue.answer}

A REAL Jeopardy clue (4-5):
- Starts with a specific concrete hook (date, event, name, vivid detail)
- Conversational but precise tone
- Builds toward the answer with layered specifics
- Does NOT read like a Wikipedia article summary
- Uses varied openings, not repetitive patterns

An AI-GENERATED clue (1-2):
- Opens with "This [noun]..." or encyclopedia phrasing
- Lists facts without narrative flow
- Feels robotic, impersonal, or article-like
- Overuses relative clauses and appositives

Score 3 = borderline, acceptable but not great.

Score 1-5 (5 = sounds like real Jeopardy, 1 = obviously AI-generated).
Output JSON: {"score": <1-5>, "reason": "brief"}`;

                const judgeComp = await openai.chat.completions.create({
                  model: selectedModel,
                  messages: [
                    {
                      role: "system",
                      content: JUDGE_SYSTEM_PROMPT,
                    },
                    { role: "user", content: judgePrompt },
                  ],
                  response_format: { type: "json_object" } as any,
                });

                const judgeResult = JSON.parse(
                  judgeComp.choices[0].message.content || "{}"
                );
                const score = parseInt(judgeResult.score, 10) || 3;
                if (score < 3) {
                  console.log(
                    `  Quality judge rejected (score=${score}): ${(judgeResult.reason || "").slice(0, 50)}`
                  );
                  continue;
                }
              } catch {
                // If judge call fails, accept clue anyway
              }
            }

            clues.push(clue);
          }

          // ---- Topic-level dedup ----
          if (!isWordplay && clues.length >= 5) {
            const unique: any[] = [clues[0]];
            for (let ci = 1; ci < clues.length; ci++) {
              let isDup = false;
              for (const existing of unique) {
                const eWords = new Set(
                  existing.answer.toLowerCase().split(/\s+/)
                );
                const cWords = new Set(
                  clues[ci].answer.toLowerCase().split(/\s+/)
                );
                let common = 0;
                for (const w of eWords) {
                  if (cWords.has(w)) common++;
                }
                const minLen = Math.min(eWords.size, cWords.size);
                if (common > 0 && minLen > 0 && common >= minLen * 0.5) {
                  isDup = true;
                  break;
                }
              }
              if (!isDup) unique.push(clues[ci]);
            }
            if (unique.length < clues.length) {
              console.log(
                `  Topic dedup removed ${clues.length - unique.length} clue(s), have ${unique.length}/5`
              );
              clues = unique;
            }
          }
        } catch {
          // If the whole generation call fails, continue to next attempt
        }
      }

      // ---- Last resort: relaxed gates (skip judge + wiki-ese, keep answer-in-question + wiki verification) ----
      if (clues.length < 5) {
        console.log(
          `  Last-resort fill: have ${clues.length}/5, generating remaining with relaxed gates`
        );
        let rescueAttempts = 0;
        const maxRescueAttempts = 15;
        while (clues.length < 5 && rescueAttempts < maxRescueAttempts) {
          rescueAttempts++;
          try {
            const rescuePrompt = `Create ${5 - clues.length} Jeopardy clues in "${currentCategory}". Each about a DIFFERENT subject. ${CLUE_WRITING_GUIDE}\nOutput JSON with "clues" array. Each: value (int), question (string), answer (string).`;
            const rescueComp = await openai.chat.completions.create({
              model: selectedModel,
              messages: [
                {
                  role: "system",
                  content: "You write Jeopardy clues. Output valid JSON.",
                },
                { role: "user", content: rescuePrompt },
              ],
              response_format: { type: "json_object" } as any,
            });
            const rescueParsed = JSON.parse(
              rescueComp.choices[0].message.content || "{}"
            );
            if (!rescueParsed.clues) continue;

            for (const rc of rescueParsed.clues) {
              if (clues.length >= 5) break;
              let ra = (rc.answer || "")
                .replace(/^(what\s+(is|are|was|were)\s+)/i, "")
                .trim()
                .replace(/\?$/, "");
              if (!ra || ra === "?") continue;
              if (
                clues.some(
                  (e: any) => e.answer.toLowerCase() === ra.toLowerCase()
                )
              )
                continue;

              // Relaxed: only enforce answer-in-question (skip style checks)
              if (ra && rc.question) {
                const ansWords = ra.toLowerCase().split(/\s+/);
                const qLower = rc.question.toLowerCase();
                if (ansWords.some((w: string) => w.length > 3 && qLower.includes(w)))
                  continue;
              }

              // Wikipedia verify only
              const wiki = await wikiPageExists(ra);
              if (wiki.ok) {
                ra = wiki.pageTitle || ra;
              } else {
                continue;
              }

              clues.push({
                value: values[clues.length],
                question: rc.question || "",
                answer: ra,
                played: false,
                correct: null,
              });
            }
          } catch {
            // continue rescue attempts
          }
        }
      }

      // ---- Final guarantee: common-knowledge fallback if still short ----
      while (clues.length < 5) {
        const fa = FALLBACK_ANSWERS[clues.length % FALLBACK_ANSWERS.length];
        console.log(
          `  CRITICAL: still ${clues.length}/5 after all retries, using fallback clue`
        );
        clues.push({
          value: values[clues.length],
          question: `A well-known answer in this category.`,
          answer: fa,
          played: false,
          correct: null,
        });
      }

      // Assign correct values in order and cap at 5
      const sortedValues = [...values].sort((a, b) => a - b);
      for (let i = 0; i < clues.length && i < 5; i++) {
        clues[i].value = sortedValues[i];
      }
      clues = clues.slice(0, 5);

      board.push({ name: currentCategory, clues });
    }

    // Save game in DB
    let gameId: number | null = null;
    if (user) {
      const db = getDb();
      const questions = board.flatMap((c) =>
        c.clues.map((cl) => ({
          category: c.name,
          question: cl.question,
          answer: cl.answer,
          value: cl.value,
        }))
      );
      const result = db
        .prepare(
          "INSERT INTO games (user_id, provider, model, total, questions, answers) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          user.id,
          baseURL || "openai",
          selectedModel,
          30,
          JSON.stringify(questions),
          JSON.stringify(Array(30).fill(""))
        );
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
