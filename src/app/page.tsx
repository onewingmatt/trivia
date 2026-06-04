"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Question {
  category: string;
  question: string;
  answer: string;
}

interface GradeResult {
  isCorrect: boolean;
  feedback: string;
}

export default function Home() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>(Array(5).fill(""));
  const [results, setResults] = useState<GradeResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startGame = async () => {
    const apiKey = localStorage.getItem("openaiApiKey");
    if (!apiKey) {
      setError("Please add your OpenAI API key in the settings first (top right).");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults(null);
    setUserAnswers(Array(5).fill(""));

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate questions");

      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
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
    const apiKey = localStorage.getItem("openaiApiKey");
    if (!apiKey) return;

    setIsGrading(true);
    setError(null);

    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, userAnswers, questions }),
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

  const correctCount = results?.filter((r) => r.isCorrect).length ?? 0;

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-blue-900 mb-4">
          AI Trivia Challenge
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Test your knowledge with 5 freshly generated, Jeopardy-style questions.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-md">
          <p className="text-red-700">{error}</p>
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
          <p className="text-gray-600 font-medium">Generating high-quality clues...</p>
        </div>
      )}

      {questions.length > 0 && !isLoading && (
        <div className="space-y-8">
          {questions.map((q, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 transition-all hover:shadow-md">
              <div className="text-sm font-bold text-blue-600 uppercase tracking-wider mb-2">
                {q.category}
              </div>
              <p className="text-xl md:text-2xl font-medium text-gray-900 mb-6 leading-relaxed">
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
                        ? "bg-green-50 border-green-200 text-green-900"
                        : "bg-red-50 border-red-200 text-red-900"
                      : "bg-gray-50 border-gray-200"
                  }`}
                />
              </div>

              {results && results[i] && (
                <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 ${
                  results[i].isCorrect ? "bg-green-100/50" : "bg-red-100/50"
                }`}>
                  {results[i].isCorrect ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={`font-semibold ${results[i].isCorrect ? "text-green-800" : "text-red-800"}`}>
                      {results[i].isCorrect ? "Correct!" : "Incorrect"}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">{results[i].feedback}</p>
                    {!results[i].isCorrect && (
                      <p className="text-sm font-medium mt-2">
                        Official Answer: <span className="text-gray-900 font-bold">{q.answer}</span>
                      </p>
                    )}
                  </div>
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
              <button
                onClick={startGame}
                className="bg-white text-blue-900 hover:bg-gray-100 font-bold py-3 px-8 rounded-full text-lg shadow transition-colors"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
