import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPromptForStyle, parseQuestions } from "@/lib/prompts";

function getSmartQuestions(userId: number, maxInject: number) {
  const db = getDb();
  // Scan last 20 games for question deduplication
  const recentGames = db.prepare(`SELECT questions FROM games WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`).all(userId) as { questions: string }[];
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
    const game = db.prepare("SELECT questions, model FROM games WHERE id = ?").get(fb.game_id) as { questions: string; model: string } | undefined;
    if (!game) continue;
    try {
      const qs: any[] = JSON.parse(game.questions);
      const q = qs[fb.question_index];
      const qText = q.question.trim().toLowerCase();
      const catText = q.category.trim().toUpperCase();
      
      if (q && !seenQuestions.has(qText) && !avoidCategories.has(catText)) {
        // Stamp each injected question with its original source model and prompt style
        injected.push({ ...q, model: game.model || "unknown", promptStyle: q.promptStyle || "unknown" });
        seenQuestions.add(qText);
        avoidCategories.add(catText);
      }
    } catch {}
  }
  return { questions: injected, avoidCategories: Array.from(avoidCategories), avoidQuestions: Array.from(seenQuestions) };
}

function getSeedPoolQuestions(userId: number, maxCount: number, skipCategories: Set<string>, skipQuestions: Set<string>): any[] {
  const db = getDb();
  const seedGames = db.prepare(
    `SELECT questions, model FROM games WHERE user_id = ? AND provider = 'seed-pool' ORDER BY created_at DESC LIMIT 5`
  ).all(userId) as { questions: string; model: string }[];

  const result: any[] = [];
  for (const game of seedGames) {
    if (result.length >= maxCount) break;
    try {
      const qs: any[] = JSON.parse(game.questions);
      // Shuffle within game to get variety
      const shuffled = [...qs].sort(() => 0.5 - Math.random());
      for (const q of shuffled) {
        if (result.length >= maxCount) break;
        const qText = q.question.trim().toLowerCase();
        const catText = q.category.trim().toUpperCase();
        if (!skipCategories.has(catText) && !skipQuestions.has(qText)) {
          result.push({ ...q, model: q.model || game.model || "seed-pool", promptStyle: q.promptStyle || "seed-pool" });
          skipCategories.add(catText);
          skipQuestions.add(qText);
        }
      }
    } catch {}
  }
  return result;
}

const FALLBACK_BANK = [
  { category: "PATENT PENDING", question: "Though best known for his theories of relativity, this physicist is the only one to have a patent granted for a device he co-invented in 1926 to improve the cooling mechanisms of refrigerators.", answer: "Albert Einstein", model: "local-fallback", promptStyle: "fallback" },
  { category: "LITERARY INVESTMENTS", question: "While celebrated for his plays and sonnets, this English playwright also made a savvy real estate investment in 1613, purchasing the gatehouse of the former Blackfriars monastery in London.", answer: "William Shakespeare", model: "local-fallback", promptStyle: "fallback" },
  { category: "CULINARY CURIOSITIES", question: "Though often attributed to ancient Rome, this fermented fish sauce was the ubiquitous condiment of the Mediterranean world, produced in vast coastal factories from the intestines of mackerel or tuna, and found in ruins from Britain to North Africa.", answer: "Garum", model: "local-fallback", promptStyle: "fallback" },
  { category: "CELESTIAL BODIES", question: "Discovered in 1930 by Clyde Tombaugh, this dwarf planet was reclassified in 2006. However, in 2015, the New Horizons spacecraft revealed it has a massive, heart-shaped glacier named Tombaugh Regio, composed largely of nitrogen ice.", answer: "Pluto", model: "local-fallback", promptStyle: "fallback" },
  { category: "WORD PLAY", question: "Remove the first letter of this six-letter word meaning 'to flow swiftly', and you are left with a four-letter word meaning a small, narrow body of water. Remove another letter, and you get a common measurement of length.", answer: "Stream", model: "local-fallback", promptStyle: "fallback" },
  { category: "MUSICAL MASTERS", question: "Despite being completely deaf by the last decade of his life, this German composer continued to write music. His monumental Ninth Symphony famously features a choral finale based on a poem by Friedrich Schiller.", answer: "Ludwig van Beethoven", model: "local-fallback", promptStyle: "fallback" },
  { category: "GEOGRAPHICAL ODDITIES", question: "This landlocked country in South America is unique for having two capital cities: Sucre, which is the constitutional capital and home to the Supreme Court, and La Paz, which is the seat of government and the legislature.", answer: "Bolivia", model: "local-fallback", promptStyle: "fallback" },
  { category: "TECHNOLOGY TITANS", question: "In 1956, this IBM mainframe computer became the first commercial machine to use a hard disk drive (the RAMAC 305), storing a then-massive 5 megabytes of data across fifty 24-inch magnetic platters.", answer: "IBM 305 RAMAC", model: "local-fallback", promptStyle: "fallback" },
  { category: "CINEMATIC MILESTONES", question: "Released in 1927, this German Expressionist sci-fi film directed by Fritz Lang was the first feature-length science fiction movie and heavily influenced later works like 'Star Wars' and 'Blade Runner' with its depiction of a futuristic, dystopian city.", answer: "Metropolis", model: "local-fallback", promptStyle: "fallback" },
  { category: "NATURAL WONDERS", question: "Located on the border of Zambia and Zimbabwe, this massive waterfall is known by the indigenous Kololo name 'Mosi-oa-Tunya', which translates to 'The Smoke That Thunders', due to the immense spray it generates.", answer: "Victoria Falls", model: "local-fallback", promptStyle: "fallback" },
  { category: "ANCIENT ENIGMAS", question: "This Bronze Age civilization on the island of Crete built sprawling palace complexes with advanced plumbing, including the legendary labyrinth that supposedly housed the Minotaur.", answer: "Minoan civilization", model: "local-fallback", promptStyle: "fallback" },
  { category: "FAMOUS FAILURES", question: "Before creating the most iconic superhero of all time, this writer and artist duo's first collaboration was a 1938 newspaper strip about a detective named Slam Bradley that lasted only six months.", answer: "Jerry Siegel and Joe Shuster", model: "local-fallback", promptStyle: "fallback" },
  { category: "OCEAN DEPTHS", question: "Found at depths of 600-900 meters in the Pacific Ocean, this bizarre fish has a transparent head filled with fluid, through which you can see its actual tubular eyes rotating inside.", answer: "Barreleye fish", model: "local-fallback", promptStyle: "fallback" },
  { category: "BOTANICAL ODDITIES", question: "Native to the Namib Desert, this plant has only two leaves that grow continuously throughout its 1,000+ year lifespan, slowly splitting and fraying as they drag across the sand.", answer: "Welwitschia mirabilis", model: "local-fallback", promptStyle: "fallback" },
  { category: "BEFORE AND AFTER", question: "The King of Pop's favorite 1980 Western that went $44 million over budget and bankrupted the studio.", answer: "Michael Jackson's Heaven's Gate", model: "local-fallback", promptStyle: "fallback" },
  { category: "FORGOTTEN FIRSTS", question: "In 1958, this Swedish car manufacturer became the first automaker to introduce three-point seatbelts as standard equipment, then famously gave away the patent for free to save lives.", answer: "Volvo", model: "local-fallback", promptStyle: "fallback" },
  { category: "HISTORICAL HEAVYWEIGHTS", question: "This 12th-century Mongol leader united the nomadic tribes of the Mongolian plateau under a single banner, established a legal code called the Yassa, and created one of the largest contiguous land empires in history.", answer: "Genghis Khan", model: "local-fallback", promptStyle: "fallback" },
  { category: "PSYCHOLOGY", question: "In 1971, this Stanford psychologist conducted a controversial prison experiment in the basement of the psychology building, which was supposed to last two weeks but was terminated after only six days.", answer: "Philip Zimbardo", model: "local-fallback", promptStyle: "fallback" },
  { category: "WEIRD INVENTIONS", question: "Patented in 1975 by a Canadian professor, this device consisted of a spinning disc with a rope attached, designed to be worn on the head to keep the wearer awake by snapping them if their head nodded forward.", answer: "Drowsiness detector helmet", model: "local-fallback", promptStyle: "fallback" },
  { category: "SPACE EXPLORATION", question: "Launched in 1977, this spacecraft became the first human-made object to enter interstellar space in 2012, carrying a golden phonograph record with sounds and images of Earth.", answer: "Voyager 1", model: "local-fallback", promptStyle: "fallback" },
  { category: "ANIMAL ARCHITECTURE", question: "These Australian termites build towering wedge-shaped mounds up to 8 meters tall, all aligned precisely north-south to regulate temperature — the broad side catches morning sun, the narrow side avoids midday heat.", answer: "Compass termites", model: "local-fallback", promptStyle: "fallback" },
  { category: "STRANGE LAWS", question: "Until 2013, this Midwest U.S. state had a law making it illegal to require someone to take a lie detector test as a condition of employment — but also made it legal to ask volunteers to take one.", answer: "Michigan", model: "local-fallback", promptStyle: "fallback" },
  { category: "RHYME TIME", question: "A caped crusader's evening meal companion who helps patrol the streets of Gotham.", answer: "Batman's flat man", model: "local-fallback", promptStyle: "fallback" },
  { category: "ARTIFACTS", question: "Discovered in 1799 by French soldiers during Napoleon's Egyptian campaign, this inscribed stone slab features the same text in three scripts and became the key to deciphering ancient Egyptian hieroglyphics.", answer: "Rosetta Stone", model: "local-fallback", promptStyle: "fallback" },
  { category: "PHYSICS", question: "This 19th-century Austrian physicist is famous for his thought experiment involving a cat that is simultaneously alive and dead, designed to illustrate the counterintuitive nature of quantum superposition.", answer: "Erwin Schrodinger", model: "local-fallback", promptStyle: "fallback" },
  { category: "MOUNTAINS", question: "This active stratovolcano in southern Mexico is North America's third-highest peak. Its name comes from a Nahuatl word meaning 'smoking mountain,' and it last erupted in 1687.", answer: "Pico de Orizaba", model: "local-fallback", promptStyle: "fallback" },
  { category: "SPORTS CURIOSITIES", question: "In 1919, this MLB pitcher threw a perfect game where every single Chicago White Sox batter struck out — except one who reached first on a dropped third strike, meaning he faced the minimum of 27 batters but technically didn't pitch a perfect game.", answer: "Ernie Shore", model: "local-fallback", promptStyle: "fallback" },
  { category: "LOST CITIES", question: "Built in the 15th century and abandoned roughly 100 years later, this Incan citadel perched on a mountain ridge above the Urubamba River valley was never found by Spanish conquistadors and remained unknown to the outside world until 1911.", answer: "Machu Picchu", model: "local-fallback", promptStyle: "fallback" },
  { category: "MEDICAL MARVELS", question: "This 18th-century English country doctor discovered that cowpox infection provided immunity to smallpox by observing that milkmaids who caught cowpox from cows never caught the deadlier smallpox.", answer: "Edward Jenner", model: "local-fallback", promptStyle: "fallback" },
  { category: "OCEAN LINERS", question: "This ocean liner sank in 1956 after colliding with the Swedish ship Stockholm in heavy fog off the coast of Nantucket, killing 46 people in the worst maritime disaster since World War II.", answer: "MS Andrea Doria", model: "local-fallback", promptStyle: "fallback" },
  { category: "MATHEMATICAL CURIOSITIES", question: "This ancient Greek mathematician is known as the 'father of geometry' for his 13-volume treatise that served as the standard mathematics textbook for over 2,000 years.", answer: "Euclid", model: "local-fallback", promptStyle: "fallback" },
  { category: "RIVERS", question: "This 4,258-mile river flows through 11 countries in Southeast Asia, supporting over 60 million people. Its annual Tonle Sap flood reversal in Cambodia is a unique hydrological phenomenon where the river flows backward.", answer: "Mekong River", model: "local-fallback", promptStyle: "fallback" },
  { category: "PALEO DIET", question: "Unlike most humans today, approximately 65% of the world's population has reduced ability to digest this milk sugar after infancy, a condition most common in East Asian and African populations.", answer: "Lactose", model: "local-fallback", promptStyle: "fallback" },
  { category: "ARCHITECTURE", question: "Designed by Antoni Gaudi and still under construction since 1882, this Barcelona basilica is expected to be completed in 2026 — financed entirely by private donations and entrance fees.", answer: "Sagrada Familia", model: "local-fallback", promptStyle: "fallback" },
  { category: "COLD WAR", question: "In 1961, this Soviet nuclear test produced a 58-megaton explosion — the most powerful man-made explosion ever recorded — with a blast wave that circled the Earth three times.", answer: "Tsar Bomba", model: "local-fallback", promptStyle: "fallback" },
  { category: "ANCIENT ROME", question: "Built around 126 AD, this concrete structure in Rome has the largest unreinforced concrete dome in the world, with a central oculus that opens to the sky. It has been in continuous use for over 1,800 years.", answer: "Pantheon", model: "local-fallback", promptStyle: "fallback" },
  { category: "BUGS", question: "This insect, native to North America, lives underground for 13 or 17 years depending on the brood, emerging en masse by the billions to mate, lay eggs, and die within 4-6 weeks.", answer: "Periodical cicada", model: "local-fallback", promptStyle: "fallback" },
  { category: "ESPIONAGE", question: "This 20th-century British double agent worked as a Soviet spy while rising to become an officer in MI6. He defected to the USSR in 1963 and is believed to have been the most valuable spy in Soviet history.", answer: "Kim Philby", model: "local-fallback", promptStyle: "fallback" },
  { category: "FOSSIL RECORD", question: "Discovered in 1974 in Ethiopia, this 3.2-million-year-old Australopithecus afarensis skeleton was 40% complete and provided the first definitive evidence that early hominins walked upright before developing large brains.", answer: "Lucy", model: "local-fallback", promptStyle: "fallback" },
  { category: "RENAISSANCE", question: "Though best known as a painter, this Renaissance polymath also designed flying machines, war engines, and anatomical studies, filling thousands of pages of notebooks written in mirror-image script.", answer: "Leonardo da Vinci", model: "local-fallback", promptStyle: "fallback" },
  { category: "PHILATELY", question: "Printed in 1856, this one-cent stamp from a South American colony is the rarest and most valuable stamp in the world, with only one known copy surviving. It sold for $9.5 million in 2014.", answer: "British Guiana 1c magenta", model: "local-fallback", promptStyle: "fallback" },
  { category: "MYTHOLOGY", question: "In Norse mythology, this trickster god caused the death of the beloved god Balder by tricking the blind god Hod into throwing a mistletoe dart at him — the one thing that could harm him.", answer: "Loki", model: "local-fallback", promptStyle: "fallback" },
  { category: "FOOD HISTORY", question: "Created in 1937 by a Swiss chemist trying to find a way to make milk easier to digest for lactose-intolerant patients, this breakfast food became so popular that Switzerland had to ration it during World War II.", answer: "Muesli", model: "local-fallback", promptStyle: "fallback" },
  { category: "CIVIL ENGINEERING", question: "Completed in 1914, this 48-mile canal connecting the Atlantic and Pacific Oceans uses a system of locks to raise ships 85 feet above sea level. Its construction cost over 27,000 lives.", answer: "Panama Canal", model: "local-fallback", promptStyle: "fallback" },
  { category: "ASTRONOMY", question: "First observed by Chinese astronomers in 1054 AD, this remnant of a supernova explosion in the Taurus constellation can still be seen today as a rapidly spinning neutron star that pulses 30 times per second.", answer: "Crab Nebula", model: "local-fallback", promptStyle: "fallback" },
  { category: "VINTAGE COMPUTING", question: "Developed at Bletchley Park in 1943, this electromechanical device used 1,500 rotating drums to break the German Lorenz cipher — essentially a telephone exchange wired to perform logic operations.", answer: "Colossus computer", model: "local-fallback", promptStyle: "fallback" },
  { category: "MUSICAL INSTRUMENTS", question: "Invented in 1709 by Bartolomeo Cristofori, this keyboard instrument differs from its predecessor the harpsichord by using hammers to strike strings, allowing the player to control the volume of each note.", answer: "Piano", model: "local-fallback", promptStyle: "fallback" },
  { category: "UNSOLVED MYSTERIES", question: "In 1918, this Romanov grand duchess was believed by several impostors to have survived the execution of her family. The most famous pretender was Anna Anderson, who maintained her claim until DNA testing in 1994 proved otherwise.", answer: "Anastasia Romanov", model: "local-fallback", promptStyle: "fallback" },
  { category: "WEATHER", question: "This 1815 volcanic eruption on the Indonesian island of Sumbawa ejected so much ash into the atmosphere that it caused a 'year without a summer' in 1816, leading to crop failures and food riots across Europe and North America.", answer: "Mount Tambora", model: "local-fallback", promptStyle: "fallback" },
  { category: "CARTOGRAPHY", question: "First published in 1569, this world map projection became the standard for navigation because it preserved angles and compass bearings, despite wildly distorting the size of landmasses near the poles.", answer: "Mercator projection", model: "local-fallback", promptStyle: "fallback" },
  { category: "CRYPTOGRAPHY", question: "During World War II, this team of codebreakers at Bletchley Park, including Alan Turing, broke the German Enigma machine's encryption, a feat some historians say shortened the war by up to two years.", answer: "Ultra", model: "local-fallback", promptStyle: "fallback" },
  { category: "PALEONTOLOGY", question: "First discovered in the Gobi Desert in 1923, this dinosaur species became famous for the dramatic fossil of a Protoceratops and a this predator locked in combat, both buried alive by a collapsing sand dune.", answer: "Velociraptor", model: "local-fallback", promptStyle: "fallback" },
  { category: "POP CULTURE", question: "First broadcast in 1963, this British television series holds the Guinness World Record for the longest-running science fiction show, with over 800 episodes spanning 26 seasons and countless regenerations of its lead character.", answer: "Doctor Who", model: "local-fallback", promptStyle: "fallback" },
  { category: "EXTREME SPORTS", question: "In 1960, this U.S. Air Force captain jumped from a balloon at 102,800 feet, reaching speeds of 614 mph in freefall before opening his parachute. He was the first person to break the sound barrier without a vehicle.", answer: "Joseph Kittinger", model: "local-fallback", promptStyle: "fallback" },
  { category: "OCEANOGRAPHY", question: "First measured in 1951 by HMS Challenger II, this deep-sea trench in the Pacific Ocean reaches approximately 36,000 feet below sea level, making it the deepest known point on Earth's surface.", answer: "Mariana Trench", model: "local-fallback", promptStyle: "fallback" },
  { category: "WRITING SYSTEMS", question: "Developed around 3200 BCE in Mesopotamia, this writing system began as pictographic symbols pressed into clay tablets with a blunt reed, evolving over centuries to represent syllables rather than objects.", answer: "Cuneiform", model: "local-fallback", promptStyle: "fallback" },
  { category: "INVENTIONS", question: "Patented in 1891, this device became essential for the modern kitchen — though its original design used a manual hand-cranked mechanism, and early adopters were skeptical of its ability to seal food safely.", answer: "Can opener", model: "local-fallback", promptStyle: "fallback" },
  { category: "OLYMPICS", question: "At the 1968 Mexico City Olympics, this American athlete set a long jump world record of 29 feet 2.5 inches that stood for 23 years. His record-breaking jump was aided by Mexico City's high altitude and thin air.", answer: "Bob Beamon", model: "local-fallback", promptStyle: "fallback" },
  { category: "LANGUAGE", question: "Constructed in 1887 by a Polish ophthalmologist, this international auxiliary language was designed to be easy to learn with a fully regular grammar, no irregular verbs, and its entire vocabulary built from a few hundred root words.", answer: "Esperanto", model: "local-fallback", promptStyle: "fallback" },
  { category: "NUMISMATICS", question: "In 1933, the U.S. Mint produced 445,500 of these $20 gold coins — but nearly all were melted down before release. One that escaped sold at auction in 2021 for $18.9 million, the most valuable coin ever sold.", answer: "1933 Double Eagle", model: "local-fallback", promptStyle: "fallback" },
  { category: "ARCHAEOLOGY", question: "First discovered in a cave in the Neander Valley of Germany in 1856, this extinct human species was later found to have lived alongside Homo sapiens, interbred with them, and contributed up to 2% of modern non-African DNA.", answer: "Neanderthals", model: "local-fallback", promptStyle: "fallback" },
];

export async function POST(req: NextRequest) {
  try {
    const { apiKey, baseURL, model, count = 5, allNew = false, promptStyle = "full", offlineMode = false, roulette = false } = await req.json();
    const safeCount = Math.min(Math.max(Number(count), 1), 15); // Clamp between 1 and 15
    const user = await getCurrentUser();
    const selectedModel = model || "gpt-4o-mini";
    
    // --- ROULETTE MODE: One question per random category ---
    if (roulette && apiKey && !offlineMode) {
      const { getRoulettePrompt, pickRandomCategory } = await import("@/lib/prompts");
      const openai = new OpenAI({ apiKey, ...(baseURL && { baseURL }) });
      const usedCategories = new Set<string>();
      const questions: any[] = [];
      
      for (let i = 0; i < safeCount; i++) {
        let category = pickRandomCategory();
        while (usedCategories.has(category)) {
          category = pickRandomCategory();
        }
        usedCategories.add(category);
        
        try {
          const completion = await openai.chat.completions.create({
            model: selectedModel,
            messages: [
              { role: "system", content: "You write Jeopardy clues. Output valid JSON." },
              { role: "user", content: getRoulettePrompt(category, promptStyle) },
            ],
            response_format: { type: "json_object" } as any,
          });
          const raw = completion.choices[0].message.content || "{}";
          const parsed = JSON.parse(raw);
          questions.push({
            category: parsed.category || category,
            question: parsed.question || parsed.clue || "",
            answer: parsed.answer || "",
            model: selectedModel,
            promptStyle,
          });
        } catch {
          // If individual call fails, skip and try next category
          continue;
        }
      }
      
      if (questions.length === 0) {
        return NextResponse.json(
          { error: "Failed to generate any roulette questions. Try a different model." },
          { status: 500 }
        );
      }
      
      let gameId: number | null = null;
      if (user) {
        const db = getDb();
        const result = db
          .prepare("INSERT INTO games (user_id, provider, model, total, questions, answers) VALUES (?, ?, ?, ?, ?, ?)")
          .run(user.id, baseURL || "openai", selectedModel, questions.length, JSON.stringify(questions), JSON.stringify(Array(questions.length).fill("")));
        gameId = Number(result.lastInsertRowid);
      }
      
      return NextResponse.json({ questions, gameId });
    }
    
    // If offline mode or no API key, serve from the local bank + seed pool
    if (offlineMode || !apiKey) {
      let bankQuestions: any[] = [];
      let avoidQuestionSet = new Set<string>();
      
      if (user && !allNew) {
        const smartData = await getSmartQuestions(user.id, Math.floor(safeCount / 3));
        bankQuestions = smartData.questions;
        avoidQuestionSet = new Set(smartData.avoidQuestions.map((q: string) => q.toLowerCase()));
      }
      
      // Fill remaining slots from seed pool first, then fallback bank
      const remaining = safeCount - bankQuestions.length;
      if (remaining > 0) {
        const existingCats = new Set(bankQuestions.map((q: any) => q.category.toUpperCase()));

        // Try seed pool first (questions generated via "Generate Seed Questions" button)
        let seedQuestions: any[] = [];
        if (user) {
          seedQuestions = getSeedPoolQuestions(user.id, remaining, existingCats, avoidQuestionSet);
          if (seedQuestions.length > 0) {
            bankQuestions = [...bankQuestions, ...seedQuestions.slice(0, remaining)];
            // Update avoid set with seed questions
            for (const q of seedQuestions.slice(0, remaining)) {
              avoidQuestionSet.add(q.question.trim().toLowerCase());
              existingCats.add(q.category.toUpperCase());
            }
          }
        }

        const stillNeeded = safeCount - bankQuestions.length;
        if (stillNeeded > 0) {
          const shuffledFallback = [...FALLBACK_BANK].sort(() => 0.5 - Math.random());
          // Filter out categories we already have AND exact question text we've already used
          const existingCats2 = new Set(bankQuestions.map((q: any) => q.category.toUpperCase()));
          const newQuestions = shuffledFallback.filter((q: any) => {
            const qText = q.question ? q.question.trim().toLowerCase() : '';
            return !existingCats2.has(q.category.toUpperCase()) && !avoidQuestionSet.has(qText);
          }).slice(0, stillNeeded);
          bankQuestions = [...bankQuestions, ...newQuestions];
        }
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
    let smartData = { questions: [] as any[], avoidCategories: [] as string[], avoidQuestions: [] as string[] };
    if (user && !allNew) {
      smartData = await getSmartQuestions(user.id, Math.floor(safeCount / 3)); // Inject proportional to size
    }
    const avoidQuestionSet = new Set(smartData.avoidQuestions.map((q: string) => q.toLowerCase()));

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
          messages: [{ role: "system", content: getPromptForStyle(promptStyle, remainingCount, smartData.avoidCategories, smartData.avoidQuestions) }],
          response_format: { type: "json_object" },
        });
        content = completion.choices[0].message.content;
      } catch {
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [{ role: "system", content: getPromptForStyle(promptStyle, remainingCount, smartData.avoidCategories, smartData.avoidQuestions) }],
        });
        content = completion.choices[0].message.content;
      }

      generatedQuestions = parseQuestions(content);

      // Stamp each generated question with the model and prompt style that produced it
      generatedQuestions = generatedQuestions.map((q: any) => ({ ...q, model: selectedModel, promptStyle }));

      // Filter out any generated questions whose text was already used
      generatedQuestions = generatedQuestions.filter((q: any) => {
        const qText = q.question ? q.question.trim().toLowerCase() : '';
        return !avoidQuestionSet.has(qText);
      });

      if (!generatedQuestions || generatedQuestions.length < remainingCount) {
        const fb = await openai.chat.completions.create({
          model: selectedModel,
          messages: [{ role: "system", content: getPromptForStyle(promptStyle, remainingCount, smartData.avoidCategories, smartData.avoidQuestions) }],
        });
        const fallbackQuestions = parseQuestions(fb.choices[0].message.content) as any[];
        // Stamp fallback questions too
        for (const q of fallbackQuestions) {
          q.model = selectedModel;
          q.promptStyle = promptStyle;
          const qText = q.question ? q.question.trim().toLowerCase() : '';
          if (generatedQuestions.length < remainingCount && !avoidQuestionSet.has(qText)) {
            generatedQuestions.push(q);
          }
        }
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
