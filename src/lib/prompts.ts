// Shared prompt functions for trivia question generation.
// Used by both /api/generate and /api/generate-seed.

// ============================================================
// 8 tested prompt styles — all benchmarked at 100% pass rate
// on deepseek-v4-flash with 10 diverse test facts.
// ============================================================

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

export const STRICT_PAYOFF_BASE = `You write Jeopardy-style clues where the clue text itself must uniquely identify the answer WITHOUT ending with a "What is..." phrase. Each clue reads as a complete standalone description that leads to exactly one answer.

RULES:
- The clue text IS the identifier. No question format needed.
- Start with a specific, surprising detail
- End with the identifying information
- 20-30 words per clue
- Vary categories across history, science, pop culture, geography, wordplay
- One correct answer per clue

EXAMPLES:
{"category":"ANCIENT INVENTIONS","question":"Recovered from a 1901 shipwreck, this ancient device uses bronze gears to track celestial cycles.","answer":"Antikythera mechanism"}
{"category":"CULINARY HISTORY","question":"This fermented fish sauce, produced in coastal factories from mackerel or tuna intestines, was the ubiquitous condiment of the ancient Mediterranean.","answer":"Garum"}`;

export const CONVERSATIONAL_BASE = `You write trivia questions with a warm, conversational tone — like telling a story to friends. Each clue should feel like the start of a fun conversation.

RULES:
- Start with a hook phrase ("Here's a good one:", "Did you know", "Fun fact:")
- End with a "What/Who/Where" question
- Write 25-35 words per clue
- Vary categories across history, science, pop culture, geography, wordplay
- One correct answer per clue

EXAMPLES:
{"category":"HISTORICAL BATTLES","question":"Here's a good one: in 1932 Australia deployed troops with machine guns against emus and somehow lost. What was this conflict called?","answer":"The Great Emu War"}
{"category":"OCEAN MYSTERIES","question":"Fun fact: an ultra-low-frequency underwater sound detected by NOAA in 1997 was thought to be a sea creature but turned out to be an icequake. What was it called?","answer":"The Bloop"}`;

export const NARRATIVE_BASE = `You write trivia questions in the form of short 2-3 sentence anecdotes. Each clue builds a mini-story that ends with a question.

RULES:
- Start with a scene or interesting setup that builds context
- Build suspense or curiosity through the story
- End with "What/Who/Where..."
- 30-40 words per clue
- Vary categories across history, science, pop culture, geography, wordplay
- One correct answer per clue

EXAMPLES:
{"category":"PALEONTOLOGY","question":"At just 12 years old, this self-taught fossil collector from Lyme Regis made a groundbreaking discovery in 1811 — the first complete ichthyosaur skeleton. Who is she?","answer":"Mary Anning"}
{"category":"ASTRONOMY","question":"Jerry R. Ehman was reviewing data from Ohio State's Big Ear radio telescope when he spotted a 72-second narrowband signal from space. It remains the most promising candidate for alien contact. What is it called?","answer":"The Wow! Signal"}`;

export const QUESTION_FORMAT_BASE = `You write trivia questions that always start with "What", "Who", "Where", or "Which". Each clue follows a clear question structure.

RULES:
- Always begin with "What", "Who", "Where", or "Which"
- Follow with a descriptive noun phrase and specific details
- End naturally — the question word at the start frames the clue
- 25-35 words per clue
- Vary categories across history, science, pop culture, geography, wordplay
- One correct answer per clue
- Do NOT repeat the answer words in the first 5 words

EXAMPLES:
{"category":"OCEAN MYSTERIES","question":"This mysterious ultra-low-frequency underwater sound, detected by NOAA in 1997, was initially thought to be a sea creature. What was it?","answer":"The Bloop"}
{"category":"AUTOMOTIVE HISTORY","question":"Which Swedish car manufacturer in 1958 became the first to introduce three-point seatbelts as standard equipment and gave away the patent for free?","answer":"Volvo"}`;

export const COMPARATIVE_BASE = `You write trivia clues that use a "While" or "Although" contrast structure to highlight surprising facts. The twist makes the clue memorable.

RULES:
- Open with "While", "Although", or "Unlike"
- Set up a common assumption, then reveal the surprising truth
- 25-35 words per clue
- Vary categories across history, science, pop culture, geography, wordplay
- One correct answer per clue
- If a fact has no natural comparison, write a standard clue instead

EXAMPLES:
{"category":"ANCIENT TECHNOLOGY","question":"While often thought to be from the Middle Ages, this device was actually recovered from a 1901 shipwreck and uses bronze gears to track celestial cycles.","answer":"Antikythera mechanism"}
{"category":"HISTORICAL CONFLICTS","question":"While often thought to be a myth, this 1932 conflict in Western Australia actually involved Australian troops with machine guns fighting emus, and the emus won.","answer":"The Great Emu War"}`;

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

  const jsonFormat = `\n\nOutput ONLY valid JSON — no markdown, no backticks:\n{"questions":[{"category":"...","question":"...","answer":"..."}]}`;

  switch (style) {
    case "full":
    case "standard":
      return `${BASE_PROMPT}\nGenerate exactly ${count} clues from ${count} completely different categories.${avoidCatText}${avoidQText}\n\nYou MUST respond with valid JSON. Output ONLY a JSON object with a "questions" array. No markdown, no backticks, no extra text.\nFormat:\n{\n  "questions": [\n    {"category": "CREATIVE CATEGORY NAME IN CAPS", "question": "The clue text", "answer": "Just the answer entity"},\n    ...\n  ]\n}`;
    case "lite":
      return `${LITE_BASE}\nGenerate exactly ${count} clues from different categories.${avoidCatText}${avoidQText}${jsonFormat}`;
    case "casual":
      return `${CASUAL_BASE}\nGenerate exactly ${count} trivia questions.${avoidCatText}${avoidQText}${jsonFormat}`;
    case "strict_payoff":
      return `${STRICT_PAYOFF_BASE}\nGenerate exactly ${count} clues from different categories.${avoidCatText}${avoidQText}${jsonFormat}`;
    case "conversational":
      return `${CONVERSATIONAL_BASE}\nGenerate exactly ${count} clues from different categories.${avoidCatText}${avoidQText}${jsonFormat}`;
    case "narrative":
      return `${NARRATIVE_BASE}\nGenerate exactly ${count} clues from different categories.${avoidCatText}${avoidQText}${jsonFormat}`;
    case "question_format":
      return `${QUESTION_FORMAT_BASE}\nGenerate exactly ${count} clues from different categories.${avoidCatText}${avoidQText}${jsonFormat}`;
    case "comparative":
      return `${COMPARATIVE_BASE}\nGenerate exactly ${count} clues from different categories.${avoidCatText}${avoidQText}${jsonFormat}`;
    default:
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

// --- Category Roulette ---

export const ROULETTE_CATEGORIES = [
  // Wordplay (Jeopardy staples)
  "Before & After",
  "Rhyme Time",
  "Double Meaning",
  "Anagrams & Wordplay",
  "Famous Quotations",

  // History
  "Ancient Civilizations",
  "Weird History",
  "Forgotten Wars & Conflicts",
  "Cold War History",
  "WWII History",
  "US History & Presidents",
  "World Leaders & Diplomacy",
  "The Roman Empire",
  "Medieval Europe",
  "Pirates & Privateers",

  // Science
  "Space & Astronomy",
  "Biology & Evolution",
  "Chemistry & Elements",
  "Physics & Quantum Mechanics",
  "Medicine & Diseases",
  "Genetics & DNA",
  "Neuroscience & the Brain",
  "Geology & Natural Wonders",
  "Weather & Climate",
  "Ocean & Marine Life",

  // Arts & Culture
  "Movies & Film History",
  "Television & Streaming",
  "World Literature & Authors",
  "Art History & Movements",
  "Classical Music & Composers",
  "Pop Music & Chart Hits",
  "Broadway & Musicals",
  "Mythology & Folklore",

  // Geography & Places
  "World Geography",
  "Flags & Capitals",
  "Archaeology & Discoveries",
  "Architecture & Structures",

  // Technology & Innovation
  "Inventions & Patents",
  "Robotics & AI",
  "The Internet & Tech History",
  "Cryptography & Codes",
  "Engineering Failures",

  // Society & Culture
  "Sports Oddities & Records",
  "Olympic Games & History",
  "Food Origins & Culinary History",
  "Fashion & Design",
  "Organized Crime & Heists",
  "Unsolved Mysteries",
  "Religion & Philosophy",
  "Cartoons & Animation",
  "Video Games & Gaming History",

  // Language
  "Languages & Linguistics",
  "Etymology & Word Origins",
];

const ROULETTE_STYLE_RULES: Record<string, string> = {
  standard: "Start with a specific detail. End with a question. 25-35 words.",
  lite: "Concise. Lead with detail, end with question. 10-25 words.",
  casual: "Fun and surprising tone. 10-25 words.",
  narrative: "2-3 sentence anecdote. Build suspense, end with question.",
  conversational: 'Hook phrase at start ("Did you know...", "Fun fact:").',
  strict_payoff: "Clue-only text. No question format. 20-30 words.",
  question_format: 'Start with "What/Who/Where/Which". 25-35 words.',
  comparative: 'Use "While/Although" contrast structure.',
};

export function getRoulettePrompt(category: string, style: string): string {
  const rule = ROULETTE_STYLE_RULES[style] || ROULETTE_STYLE_RULES.standard;
  return `Pick a specific, real, non-obvious subject related to "${category}".
Write one Jeopardy clue about it. ${rule}
DO NOT use placeholder text like "the clue" or "the answer".
Output JSON with question and answer keys.`;
}

export function pickRandomCategory(): string {
  return ROULETTE_CATEGORIES[Math.floor(Math.random() * ROULETTE_CATEGORIES.length)];
}
