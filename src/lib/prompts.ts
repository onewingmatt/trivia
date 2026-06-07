// Shared prompt functions for trivia question generation.
// Used by both /api/generate and /api/generate-seed.

export const BASE_PROMPT = `You write Jeopardy!-style trivia clues. A great clue makes the player think "Darn, I should have known that!" — the subject is recognizable, but the clue uses a specific, surprising detail they probably don't know.

FIVE RULES:
1. OBSCURE. BANNED: Wikipedia intro paragraph facts. If a friend knows it, it's too famous. Find facts from deep in the Wikipedia page.

2. PINNING. Exactly one correct answer, proven by the last sentence. The final detail must be so specific it eliminates all other possible answers.

3. PAYOFF. STRICT: The first 5 words of your clue must NOT contain the person's name, job, time period, or the answer's type. SURPRISE DETAIL first. Subject only appears in the final 3 words.

4. PRECISION. Use verifiable specifics — dates, numbers, places, full names. "In 1849" beats "In the 19th century." "U.S. Patent 6,469" beats "he invented something."

5. NO SPOILERS. The answer itself cannot appear in the clue NOR can its category word. If the answer is "The Mona Lisa," do NOT use "painting," "portrait," or "da Vinci" anywhere. If the answer is "Einstein," do not use "physicist" or "scientist." The specific facts alone must identify the answer.

CATEGORIES: Vary across history, science, literature, pop culture, geography, wordplay, food, sports, music. Name categories creatively: "HISTORICAL HEAVYWEIGHTS" not "HISTORY."

LENGTH: 25-35 words. Tight and precise, not padded.

VOICE: Write the way you'd tell a fascinating secret at a bar — a hint of mischief, never lecture-y. The player should smile when the answer clicks.

6. WORDPLAY. Every batch must include at least 1 wordplay clue (BEFORE & AFTER, RHYME TIME, ANAGRAM, or double-meaning). The answer IS the joke — connecting two ideas through wordplay, not just a fact.

EXAMPLES:
{"category":"PRESIDENTIAL PATENTS","question":"In 1849 this future U.S. President received Patent 6,469 for adjustable buoyant chambers to lift boats over shoals, inspired by running aground on the Great Lakes.","answer":"Abraham Lincoln"}
{"category":"BEFORE & AFTER","question":"The King of Pop's favorite 1980 Western that went $44 million over budget and bankrupted the studio.","answer":"Michael Jackson's Heaven's Gate"}
{"category":"ANCIENT INVENTIONS","question":"Discovered in a 1901 shipwreck, this Greek device used bronze gears to predict astronomical positions and is considered the first known analog computer.","answer":"Antikythera mechanism"}
{"category":"RHYME TIME","question":"A caped crusader's evening meal companion who helps patrol the streets of Gotham.","answer":"Batman's flat man"}`;

export const LITE_BASE = `You write trivia questions. Follow these rules:
1. OBSCURE. BANNED: Wikipedia intro paragraph facts. If a friend knows it, it's too famous. Find facts from deep in the Wikipedia page.
2. NEVER use the most famous fact about the subject. If the answer is Lincoln, don't mention the Civil War. Rule of thumb: if it's in the intro paragraph of their Wikipedia page, dig deeper — use something from further down.
3. PAYOFF. STRICT: The first 5 words of your clue must NOT contain the person's name, job, time period, or the answer's type. SURPRISE DETAIL first. Subject only appears in the final 3 words.
4. Only one correct answer per clue.
5. Vary categories: mix history, science, pop culture, wordplay, geography.

EXAMPLES:
{"category":"PRESIDENTIAL PATENTS","question":"In 1849, this future U.S. President became the only commander-in-chief to hold a U.S. patent, for a device to lift boats over shoals.","answer":"Abraham Lincoln"}
{"category":"LITERARY INVESTMENTS","question":"This English playwright made a savvy real estate investment in 1613, buying the gatehouse of the former Blackfriars monastery in London.","answer":"William Shakespeare"}
{"category":"CULINARY HISTORY","question":"This fermented fish sauce was the ubiquitous condiment of the ancient Mediterranean, produced in coastal factories from mackerel intestines, found in ruins from Britain to North Africa.","answer":"Garum"}`;

export const CASUAL_BASE = `You write interesting trivia questions. Make them fun and surprising.
- Each question should teach something the player probably doesn't know
- Mix easy and hard questions
- Keep clues to 10-25 words
- One correct answer per question

EXAMPLES:
{"category":"SPACE","question":"Discovered in 1930 and reclassified as a dwarf planet in 2006, it has a heart-shaped glacier named Tombaugh Regio.","answer":"Pluto"}
{"category":"ANIMALS","question":"This mammal's heart beats over 1,000 times per minute and it can fly backwards.","answer":"Hummingbird"}
{"category":"GEOGRAPHY","question":"This South American country has two capital cities: Sucre and La Paz.","answer":"Bolivia"}`;

export function getSystemPrompt(count: number) {
  return `${BASE_PROMPT}\nGenerate exactly ${count} clues from ${count} completely different categories.\n\nYou MUST respond with valid JSON. Output ONLY a JSON object with a "questions" array. No markdown, no backticks, no extra text.\nFormat:\n{\n  "questions": [\n    {"category": "CREATIVE CATEGORY NAME IN CAPS", "question": "The clue text", "answer": "Just the answer entity"},\n    ...\n  ]\n}`;
}

export function getFallbackPrompt(count: number) {
  return `You write Jeopardy!-style trivia clues. Follow these rules:
- Use famous people/subjects but focus on an obscure, surprising detail — never the most famous achievement.
- Exactly one correct answer per clue, proven by a specific verifiable fact.
- Write 25-35 word clues. Use specific dates, numbers, names.
- Never use words from the answer in the clue.
- Vary categories: history, science, pop culture, geography, wordplay, sports, music.

Output ONLY valid JSON, no markdown:
{"questions":[{"category":"CREATIVE CATEGORY IN CAPS","question":"The clue","answer":"The answer entity"}]}`;
}

export function getPromptForStyle(
  style: string,
  count: number,
  avoidCats: string[] = [],
  avoidQuestions: string[] = []
): string {
  const avoidCatText = avoidCats.length > 0 ? `\nDO NOT use these categories: ${avoidCats.join(", ")}.` : "";
  const avoidQText = avoidQuestions.length > 0
    ? `\nDO NOT repeat these clues:\n${avoidQuestions.map((q, i) => `  ${i + 1}. "${q}"`).join("\n")}`
    : "";

  switch (style) {
    case "lite":
      return `${LITE_BASE}\nGenerate exactly ${count} clues from different categories.${avoidCatText}${avoidQText}\n\nOutput ONLY valid JSON — no markdown, no backticks:\n{"questions":[{"category":"...","question":"...","answer":"..."}]}`;
    case "casual":
      return `${CASUAL_BASE}\nGenerate exactly ${count} trivia questions.${avoidCatText}${avoidQText}\n\nOutput ONLY valid JSON — no markdown, no backticks:\n{"questions":[{"category":"...","question":"...","answer":"..."}]}`;
    default: // "full"
      return `${BASE_PROMPT}\nGenerate exactly ${count} clues from ${count} completely different categories.${avoidCatText}${avoidQText}\n\nYou MUST respond with valid JSON. Output ONLY a JSON object with a "questions" array. No markdown, no backticks, no extra text.\nFormat:\n{\n  "questions": [\n    {"category": "CREATIVE CATEGORY NAME IN CAPS", "question": "The clue text", "answer": "Just the answer entity"},\n    ...\n  ]\n}`;
  }
}

export function parseQuestions(raw: string | null): unknown[] {
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
