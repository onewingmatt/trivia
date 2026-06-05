"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, LogOut, ThumbsUp, ThumbsDown, Flag, Share2 } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";
import { GameHistory } from "@/components/GameHistory";

interface Question {
  category: string;
  question: string;
  answer: string;
}

interface GradeResult {
  isCorrect: boolean;
  feedback: string;
}

interface AuthUser {
  id: number;
  username: string;
}

function getApiConfig(): { apiKey?: string; baseURL?: string; model?: string } {
  try {
    const raw = localStorage.getItem("triviaApiConfig");
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export default function Home() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>(Array(5).fill(""));
  const [results, setResults] = useState<GradeResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameId, setGameId] = useState<number | null>(null);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, "like" | "dislike">>({});
  const [difficulty, setDifficulty] = useState<Record<number, "too_easy" | "just_right" | "too_hard">>({});
  const [reportingIndex, setReportingIndex] = useState<number | null>(null);
  const [reportText, setReportText] = useState("");
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const handleAuth = (u: AuthUser) => setUser(u);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  const handleLoadGame = (game: {
    questions: Question[];
    answers: string[];
    results: GradeResult[] | null;
    score: number | null;
  }) => {
    setQuestions(game.questions);
    setUserAnswers(game.answers);
    setResults(game.results);
    setGameId(null); // loaded game, not a new one
    setError(null);
  };

  const startGame = async () => {
    const config = getApiConfig();
    const apiKey = config.apiKey || localStorage.getItem("openaiApiKey");
    
    setIsLoading(true);
    setError(null);
    setResults(null);
    setUserAnswers(Array(5).fill(""));
    setGameId(null);
    setFeedback({});
    setDifficulty({});
    setShowShare(false);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey || "", baseURL: config.baseURL, model: config.model }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate questions");

      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setGameId(data.gameId || null);
        if (!apiKey) {
          setError("Playing in Offline Mode (using built-in question bank). Add an API key in Settings for AI-generated questions.");
        }
      } else {
        throw new Error("Invalid response from API");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const gradeAnswers = async () => {
    const config = getApiConfig();
    const apiKey = config.apiKey || localStorage.getItem("openaiApiKey");

    setIsGrading(true);
    setError(null);

    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey || "",
          baseURL: config.baseURL,
          model: config.model,
          userAnswers,
          questions,
          gameId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to grade answers");

      setResults(data.results);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsGrading(false);
    }
  };

  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...userAnswers];
    newAnswers[index] = value;
    setUserAnswers(newAnswers);
  };

  const handleFeedback = async (questionIndex: number, rating: "like" | "dislike") => {
    if (!gameId || !user) return;
    const newRating = feedback[questionIndex] === rating ? undefined : rating;
    try {
      if (newRating) {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId, questionIndex, rating: newRating }),
        });
        setFeedback((prev) => ({ ...prev, [questionIndex]: newRating }));
      } else {
        await fetch("/api/feedback", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId, questionIndex }),
        });
        setFeedback((prev) => {
          const next = { ...prev };
          delete next[questionIndex];
          return next;
        });
      }
    } catch {}
  };

  const handleReport = async () => {
    if (reportingIndex === null || !gameId || !user) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, questionIndex: reportingIndex, rating: "dislike", report: reportText }),
    });
    setFeedback((prev) => ({ ...prev, [reportingIndex]: "dislike" }));
    setReportingIndex(null);
    setReportText("");
  };

  const handleDifficulty = async (questionIndex: number, level: "too_easy" | "just_right" | "too_hard") => {
    if (!gameId || !user) return;
    const newLevel = difficulty[questionIndex] === level ? undefined : level;
    try {
      if (newLevel) {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId, questionIndex, difficulty: newLevel }),
        });
        setDifficulty((prev) => ({ ...prev, [questionIndex]: newLevel }));
      } else {
        setDifficulty((prev) => {
          const next = { ...prev };
          delete next[questionIndex];
          return next;
        });
      }
    } catch {}
  };

  const correctCount = results?.filter((r) => r.isCorrect).length ?? 0;

  if (!authChecked) return null;

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {user.username}
                </span>
                <button
                  onClick={handleLogout}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition"
                  title="Log out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <AuthModal onAuth={handleAuth} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <GameHistory userId={user.id} onLoadGame={handleLoadGame} />
            )}
          </div>
        </div>
      </div>

      {/* Push content below fixed bar */}
      <div className="pt-10">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-blue-900 dark:text-blue-300 mb-4">
            AI Trivia Challenge
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Test your knowledge with 5 freshly generated, Jeopardy-style questions.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-4 mb-8 rounded-md">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {questions.length === 0 && !isLoading ? (
          <div className="flex justify-center">
            <button
              onClick={startGame}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-full text-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1"
            >
              Generate Questions & Play
            </button>
          </div>
        ) : null}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">Generating high-quality clues...</p>
          </div>
        )}

        {questions.length > 0 && !isLoading && (
          <div className="space-y-8">
            {questions.map((q, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 md:p-8 transition-all hover:shadow-md">
                <div className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">
                  {q.category}
                </div>
                <p className="text-xl md:text-2xl font-medium text-gray-900 dark:text-gray-100 mb-6 leading-relaxed">
                  &quot;{q.question}&quot;
                </p>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Your answer..."
                    value={userAnswers[i]}
                    onChange={(e) => handleAnswerChange(i, e.target.value)}
                    disabled={results !== null}
                    className={`w-full px-4 py-3 text-lg border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                      results
                        ? results[i]?.isCorrect
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-900 dark:text-green-300"
                          : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-900 dark:text-red-300"
                        : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                    }`}
                  />
                </div>

                {results && results[i] && (
                  <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 ${
                    results[i].isCorrect ? "bg-green-100/50 dark:bg-green-900/30" : "bg-red-100/50 dark:bg-red-900/30"
                  }`}>
                    {results[i].isCorrect ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`font-semibold ${results[i].isCorrect ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}>
                        {results[i].isCorrect ? "Correct!" : "Incorrect"}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{results[i].feedback}</p>
                      {!results[i].isCorrect && (
                        <p className="text-sm font-medium mt-2 text-gray-800 dark:text-gray-200">
                          Official Answer: <span className="font-bold">{q.answer}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Feedback section — shows after grading */}
                {results && (
                  <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                    {!user ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                        <span>Log in to rate this question and save your game history.</span>
                      </div>
                    ) : (
                      <>
                        {/* Quality */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Quality</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleFeedback(i, "like")}
                              className={`p-1.5 rounded-lg transition text-sm flex items-center gap-1 ${
                                feedback[i] === "like"
                                  ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                                  : "text-gray-400 hover:text-green-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                              }`}
                              title="Good clue"
                            >
                              <ThumbsUp size={14} />
                            </button>
                            <button
                              onClick={() => handleFeedback(i, "dislike")}
                              className={`p-1.5 rounded-lg transition text-sm flex items-center gap-1 ${
                                feedback[i] === "dislike"
                                  ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                                  : "text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                              }`}
                              title="Bad clue"
                            >
                              <ThumbsDown size={14} />
                            </button>
                          </div>
                          <button
                            onClick={() => setReportingIndex(i)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition ml-auto"
                            title="Report this question"
                          >
                            <Flag size={14} />
                          </button>
                        </div>
                        {/* Difficulty */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Difficulty</span>
                          <div className="flex items-center gap-1">
                            {(["too_easy", "just_right", "too_hard"] as const).map((level) => {
                              const labels: Record<string, string> = { too_easy: "Too easy", just_right: "Just right", too_hard: "Too hard" };
                              const activeColors: Record<string, string> = {
                                too_easy: "bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400",
                                just_right: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400",
                                too_hard: "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400",
                              };
                              return (
                                <button
                                  key={level}
                                  onClick={() => handleDifficulty(i, level)}
                                  className={`px-2 py-1 rounded-md text-xs font-medium transition ${
                                    difficulty[i] === level
                                      ? activeColors[level]
                                      : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  }`}
                                >
                                  {labels[level]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {!results && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={gradeAnswers}
                  disabled={isGrading}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-4 px-12 rounded-full text-lg shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                >
                  {isGrading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      Grading...
                    </>
                  ) : (
                    "Submit All Answers"
                  )}
                </button>
              </div>
            )}

            {results && (
              <div className="bg-blue-900 text-white rounded-3xl p-8 text-center mt-12 shadow-xl">
                <h2 className="text-3xl font-bold mb-2">Final Score</h2>
                <div className="text-6xl font-extrabold text-blue-300 mb-6">
                  {correctCount} <span className="text-3xl text-blue-200">/ 5</span>
                </div>
                <p className="text-blue-100 mb-8 text-lg">
                  {correctCount === 5 ? "Perfect score! You're a trivia master!" : 
                   correctCount >= 3 ? "Great job! You know your stuff." : 
                   "Good effort! Keep practicing."}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={startGame}
                    className="bg-white text-blue-900 hover:bg-gray-100 font-bold py-3 px-8 rounded-full text-lg shadow transition-colors"
                  >
                    Play Again
                  </button>
                  {gameId && (
                    <button
                      onClick={() => setShowShare(true)}
                      className="bg-blue-700 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-full text-lg shadow transition-colors flex items-center gap-2"
                    >
                      <Share2 size={20} />
                      Share
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Report question modal */}
      {reportingIndex !== null && (
        <div className="fixed top-12 left-0 right-0 bottom-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md relative">
            <h2 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">Report Question</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              What's wrong with this clue? Your feedback helps improve question quality.
            </p>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="e.g. Wrong answer, misleading clue, factually incorrect..."
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleReport}
                disabled={!reportText.trim()}
                className="flex-1 bg-orange-500 text-white py-2 rounded-lg font-medium hover:bg-orange-600 transition disabled:opacity-50"
              >
                Submit Report
              </button>
              <button
                onClick={() => { setReportingIndex(null); setReportText(""); }}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {showShare && gameId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md relative">
            <h2 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">Share This Game</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Anyone with this link can view your questions, answers, and results.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/game/${gameId}`}
                className="flex-1 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : ''}/game/${gameId}`);
                  setShowShare(false);
                }}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition text-sm"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setShowShare(false)}
              className="w-full mt-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
