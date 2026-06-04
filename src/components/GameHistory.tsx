"use client";

import { useState, useEffect } from "react";
import { History, X, Trash2, ChevronRight, Trophy } from "lucide-react";

interface Question {
  category: string;
  question: string;
  answer: string;
}

interface GradeResult {
  isCorrect: boolean;
  feedback: string;
}

interface Game {
  id: number;
  provider: string;
  model: string;
  score: number | null;
  total: number;
  questions: string;
  answers: string;
  results: string | null;
  created_at: string;
}

interface GameHistoryProps {
  userId: number | null;
  onLoadGame: (game: { questions: Question[]; answers: string[]; results: GradeResult[] | null; score: number | null }) => void;
}

export function GameHistory({ userId, onLoadGame }: GameHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      loadGames();
    }
  }, [isOpen, userId]);

  const loadGames = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/games");
      const data = await res.json();
      if (res.ok) setGames(data.games || []);
    } catch {}
    setLoading(false);
  };

  const deleteGame = async (gameId: number) => {
    await fetch("/api/games", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId }),
    });
    setGames((g) => g.filter((game) => game.id !== gameId));
  };

  const handleLoad = (game: Game) => {
    const questions: Question[] = JSON.parse(game.questions);
    const answers: string[] = JSON.parse(game.answers);
    const results: GradeResult[] | null = game.results ? JSON.parse(game.results) : null;
    onLoadGame({ questions, answers, results, score: game.score });
    setIsOpen(false);
  };

  if (!userId) return null;

  const formatDate = (d: string) => {
    return new Date(d + "Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full shadow hover:bg-gray-200 dark:hover:bg-gray-600 transition text-sm font-medium flex items-center gap-1.5"
      >
        <History size={16} />
        History
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-lg relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Game History</h2>

            {loading ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Loading...</p>
            ) : games.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No games played yet. Start a game to build your history!</p>
            ) : (
              <div className="overflow-y-auto space-y-2 flex-1">
                {games.map((game) => (
                  <div
                    key={game.id}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {game.score !== null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            game.score >= 4
                              ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                              : game.score >= 2
                              ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300"
                              : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                          }`}>
                            <Trophy size={10} className="inline mr-1" />
                            {game.score}/{game.total}
                          </span>
                        )}
                        {game.score === null && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400">
                            In progress
                          </span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(game.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleLoad(game)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
                          title="Load this game"
                        >
                          <ChevronRight size={16} />
                        </button>
                        <button
                          onClick={() => deleteGame(game.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(JSON.parse(game.questions) as Question[]).map((q, i) => (
                        <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                          {q.category}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {game.model || "unknown model"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
