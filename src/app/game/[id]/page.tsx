import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { CheckCircle2, XCircle, Share2, ChevronLeft } from "lucide-react";
import Link from "next/link";

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
  username: string;
  score: number | null;
  total: number;
  questions: string;
  answers: string;
  results: string | null;
  created_at: string;
}

export default async function SharedGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = parseInt(id, 10);
  if (isNaN(gameId)) notFound();

  const db = getDb();
  const game = db
    .prepare(
      `SELECT g.id, u.username, g.score, g.total, g.questions, g.answers, g.results, g.created_at
       FROM games g
       JOIN users u ON u.id = g.user_id
       WHERE g.id = ?`
    )
    .get(gameId) as Game | undefined;

  if (!game) notFound();

  const questions: Question[] = JSON.parse(game.questions);
  const answers: string[] = JSON.parse(game.answers);
  const results: GradeResult[] | null = game.results ? JSON.parse(game.results) : null;
  const correctCount = results?.filter((r) => r.isCorrect).length ?? 0;

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition text-sm font-medium">
          <ChevronLeft size={16} />
          Back to Trivia
        </Link>
        {typeof window !== "undefined" && (
          <button
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
          >
            <Share2 size={16} />
            Copy Link
          </button>
        )}
      </div>

      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100 mb-2">
          Shared Trivia Game
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Played by <span className="font-semibold text-gray-700 dark:text-gray-200">{game.username}</span> on{" "}
          {new Date(game.created_at + "Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {results && (
        <div className="bg-blue-900 text-white rounded-2xl p-6 text-center mb-8 shadow-lg">
          <p className="text-blue-200 text-sm font-medium uppercase tracking-wider mb-1">Final Score</p>
          <div className="text-4xl font-extrabold">
            {correctCount} <span className="text-2xl text-blue-300">/ {game.total}</span>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {questions.map((q, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 md:p-6">
            <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">
              {q.category}
            </div>
            <p className="text-lg md:text-xl font-medium text-gray-900 dark:text-gray-100 mb-4">
              &quot;{q.question}&quot;
            </p>

            <div className={`w-full px-4 py-3 text-base border rounded-lg ${
              results
                ? results[i]?.isCorrect
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-900 dark:text-green-300"
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-900 dark:text-red-300"
                : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            }`}>
              {answers[i] || <span className="text-gray-400 italic">No answer provided</span>}
            </div>

            {results && results[i] && (
              <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 text-sm ${
                results[i].isCorrect ? "bg-green-100/50 dark:bg-green-900/30" : "bg-red-100/50 dark:bg-red-900/30"
              }`}>
                {results[i].isCorrect ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-semibold ${results[i].isCorrect ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}>
                    {results[i].isCorrect ? "Correct" : "Incorrect"}
                  </p>
                  <p className="text-gray-700 dark:text-gray-300 mt-0.5">{results[i].feedback}</p>
                  {!results[i].isCorrect && (
                    <p className="text-gray-800 dark:text-gray-200 mt-1.5 font-medium">
                      Correct Answer: <span className="font-bold">{q.answer}</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
