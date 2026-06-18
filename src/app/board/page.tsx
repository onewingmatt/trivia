"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Home, Trophy, X } from "lucide-react";

interface Clue {
  value: number;
  question: string;
  answer: string;
  played: boolean;
  correct: boolean | null;
}

interface Category {
  name: string;
  clues: Clue[];
}

const STORAGE_KEY = "triviaApiConfig";

function getConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export default function BoardPage() {
  const [board, setBoard] = useState<Category[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTime, setLoadingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedClue, setSelectedClue] = useState<{ catIdx: number; clueIdx: number } | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gameId, setGameId] = useState<number | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadingTime(0);
    const startTime = Date.now();
    const timer = setInterval(() => setLoadingTime(Math.floor((Date.now() - startTime) / 1000)), 1000);
    const config = getConfig();
    try {
      const res = await fetch("/api/generate-board-pregen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: config.apiKey || "",
          baseURL: config.baseURL,
          model: config.model,
          promptStyle: config.promptStyle || "standard",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      setBoard(data.board);
      setGameId(data.gameId || null);
      setScore(0);
      setTotal(0);
      setSelectedClue(null);
      setUserAnswer("");
      setShowAnswer(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate board");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    generate();
  }, [generate]);

  const handleClueClick = (catIdx: number, clueIdx: number) => {
    if (!board) return;
    const clue = board[catIdx].clues[clueIdx];
    if (clue.played) return;
    setSelectedClue({ catIdx, clueIdx });
    setUserAnswer("");
    setShowAnswer(false);
  };

  const submitAnswer = async () => {
    if (!selectedClue || !board) return;
    const clue = board[selectedClue.catIdx].clues[selectedClue.clueIdx];
    
    // Try AI grading if API key is configured, otherwise local fuzzy match
    let isCorrect = false;
    const config = getConfig();
    if (config.apiKey) {
      try {
        setGrading(true);
        const res = await fetch("/api/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
            model: config.model,
            userAnswers: [userAnswer],
            questions: [{ question: clue.question, answer: clue.answer }],
            offlineMode: false,
          }),
        });
        const data = await res.json();
        if (data.results && data.results[0]) {
          isCorrect = data.results[0].isCorrect;
        }
      } catch {
        // Fallback to local
        const normalize = (s: string) => s.toLowerCase().replace(/^(the|a|an)\s+/i, "").replace(/[^a-z0-9\s]/g, "").trim();
        isCorrect = normalize(userAnswer) === normalize(clue.answer)
          || normalize(clue.answer).includes(normalize(userAnswer))
          || normalize(userAnswer).includes(normalize(clue.answer));
      }
    } else {
      const normalize = (s: string) => s.toLowerCase().replace(/^(the|a|an)\s+/i, "").replace(/[^a-z0-9\s]/g, "").trim();
      isCorrect = normalize(userAnswer) === normalize(clue.answer)
        || normalize(clue.answer).includes(normalize(userAnswer))
        || normalize(userAnswer).includes(normalize(clue.answer));
    }
    const updated = [...board];
    updated[selectedClue.catIdx] = {
      ...updated[selectedClue.catIdx],
      clues: updated[selectedClue.catIdx].clues.map((c, i) =>
        i === selectedClue.clueIdx ? { ...c, played: true, correct: isCorrect } : c
      ),
    };
    setBoard(updated);
    if (isCorrect) setScore(s => s + clue.value);
    setTotal(t => t + 1);
    setShowAnswer(true);
    setGrading(false);
  };

  const closeModal = () => {
    setSelectedClue(null);
    setUserAnswer("");
    setShowAnswer(false);
  };

  const canGenerate = typeof window !== "undefined" && getConfig().apiKey;

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-950 flex flex-col items-center justify-center gap-4">
        <Loader2 size={48} className="animate-spin text-yellow-400" />
        <p className="text-blue-200 text-lg">Generating your board...</p>
        <p className="text-blue-400 text-sm">6 categories, 30 clues, verifying facts</p>
        {loadingTime > 0 && <p className="text-blue-500 text-xs">{loadingTime}s — this takes 5-10 minutes</p>}
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-blue-950 flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-400 text-lg">{error}</p>
        <button onClick={generate} className="px-6 py-3 bg-yellow-500 text-blue-950 rounded-lg font-bold hover:bg-yellow-400">
          Try Again
        </button>
        <a href="/" className="text-blue-300 underline text-sm">Back to home</a>
      </div>
    );
  }

  if (!canGenerate) {
    return (
      <div className="min-h-screen bg-blue-950 flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-yellow-400 text-lg">Set up your API key in Settings first.</p>
        <a href="/" className="text-blue-300 underline">Back to home</a>
      </div>
    );
  }

  const activeClue = selectedClue && board ? board[selectedClue.catIdx]?.clues[selectedClue.clueIdx] : null;
  const totalClues = board ? board.reduce((s, c) => s + c.clues.filter(cl => cl.answer && cl.answer !== "?" && cl.question !== "[FAIL]").length, 0) : 0;
  const playedClues = board ? board.reduce((s, c) => s + c.clues.filter(cl => cl.played).length, 0) : 0;

  return (
    <div className="min-h-screen bg-blue-950 p-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-4 flex items-center justify-between">
        <a href="/" className="text-blue-300 hover:text-blue-100 flex items-center gap-2">
          <Home size={20} /> Home
        </a>
        <div className="flex items-center gap-6">
          <div className="text-yellow-400 font-bold text-xl">${score.toLocaleString()}</div>
          <div className="text-blue-300 text-sm">{playedClues}/{totalClues} played</div>
          <button onClick={generate} className="px-4 py-2 bg-yellow-500 text-blue-950 rounded-lg font-semibold text-sm hover:bg-yellow-400">
            New Board
          </button>
        </div>
      </div>

      {/* Board Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-6 gap-1.5">
          {/* Category Headers */}
          {board!.map((cat, ci) => (
            <div key={ci} className="bg-blue-900 text-white text-center p-3 rounded-t-lg font-bold text-sm leading-tight min-h-[60px] flex items-center justify-center">
              {cat.name}
            </div>
          ))}

          {/* Clue Cells */}
          {[200, 400, 600, 800, 1000].map((val, vi) =>
            board!.map((cat, ci) => {
              const clue = cat.clues[vi];
              const isPlayed = clue?.played;
              const isFailed = !clue?.answer || clue.answer === "?" || clue.question === "[FAIL]";
              if (isFailed) {
                return (
                  <div key={`${ci}-${vi}`}
                    className="p-4 text-center font-bold text-2xl rounded-sm min-h-[70px] bg-blue-900/30 text-blue-700/40"
                  >
                    —
                  </div>
                );
              }
              return (
                <button
                  key={`${ci}-${vi}`}
                  onClick={() => handleClueClick(ci, vi)}
                  disabled={isPlayed}
                  className={`
                    p-4 text-center font-bold text-2xl rounded-sm transition-all min-h-[70px]
                    ${isPlayed
                      ? clue?.correct
                        ? "bg-green-900/50 text-green-400/30 cursor-default"
                        : "bg-red-900/50 text-red-400/30 cursor-default"
                      : "bg-blue-800 hover:bg-blue-700 text-yellow-400 cursor-pointer hover:scale-[1.02] active:scale-95"
                    }
                  `}
                >
                  {isPlayed ? (clue?.correct ? "✓" : "✗") : `$${val}`}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Clue Modal */}
      {selectedClue && activeClue && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div
            className="bg-blue-900 rounded-xl max-w-2xl w-full p-8 shadow-2xl border border-blue-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-yellow-400 font-bold text-lg">{board![selectedClue.catIdx].name}</span>
                <span className="text-blue-300 ml-3">${activeClue.value}</span>
              </div>
              <button onClick={closeModal} className="text-blue-400 hover:text-blue-200">
                <X size={24} />
              </button>
            </div>

            <p className="text-white text-xl leading-relaxed mb-6">{activeClue.question}</p>

            {!showAnswer ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                  placeholder="What is..."
                  className="w-full px-4 py-3 rounded-lg bg-blue-800 border border-blue-600 text-white placeholder-blue-400 text-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  autoFocus
                />
                <button
                  onClick={submitAnswer}
                  disabled={!userAnswer.trim() || grading}
                  className="w-full py-3 bg-yellow-500 text-blue-950 rounded-lg font-bold text-lg hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {grading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Checking...
                    </>
                  ) : "Submit"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`p-4 rounded-lg ${activeClue.correct ? "bg-green-800/50 text-green-300" : "bg-red-800/50 text-red-300"}`}>
                  <p className="font-bold text-lg mb-1">
                    {activeClue.correct ? `Correct! +${activeClue.value}` : "Incorrect"}
                  </p>
                  <p className="text-sm">The answer: <span className="font-bold text-white">{activeClue.answer}</span></p>
                </div>
                <button onClick={closeModal} className="w-full py-3 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-600">
                  {playedClues < totalClues ? "Next Clue" : "Game Over"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Over */}
      {playedClues === totalClues && totalClues > 0 && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-blue-900 rounded-xl max-w-md w-full p-8 text-center shadow-2xl border border-blue-700">
            <Trophy size={64} className="mx-auto text-yellow-400 mb-4" />
            <h2 className="text-3xl font-bold text-white mb-2">Game Over!</h2>
            <p className="text-blue-300 text-lg mb-1">Final Score</p>
            <p className="text-yellow-400 text-5xl font-bold mb-6">${score.toLocaleString()}</p>
            <p className="text-blue-400 text-sm mb-6">{score > 0 ? Math.round((playedClues > 0 ? score / 30000 * 100 : 0)) + "% of perfect" : "Better luck next time"}</p>
            <div className="flex gap-3">
              <button onClick={generate} className="flex-1 py-3 bg-yellow-500 text-blue-950 rounded-lg font-bold hover:bg-yellow-400">
                New Board
              </button>
              <a href="/" className="flex-1 py-3 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-600 text-center block">
                Home
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
