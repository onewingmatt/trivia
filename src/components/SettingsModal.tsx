"use client";

import { useState, useEffect } from "react";
import { Settings, X, CheckCircle2, AlertCircle, Loader2, ChevronDown, Eye, EyeOff } from "lucide-react";

interface ProviderPreset {
  id: string;
  name: string;
  baseURL: string;
  models: string[];
  defaultModel: string;
  keyPlaceholder: string;
  keyHint: string;
}

const PROVIDERS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o3-mini", "o4-mini"],
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-...",
    keyHint: "Your OpenAI API key from platform.openai.com",
  },
  {
    id: "github",
    name: "GitHub Models",
    baseURL: "https://models.inference.ai.azure.com",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o3-mini", "o4-mini"],
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "ghp_... or github_pat_...",
    keyHint: "GitHub Personal Access Token with 'models' scope",
  },
  {
    id: "nous",
    name: "Nous / Zai",
    baseURL: "https://api.zai.chat/v1",
    models: ["hermes-4", "hermes-4-mini", "hermes-3-llama-3.1-405b"],
    defaultModel: "hermes-4",
    keyPlaceholder: "zai-...",
    keyHint: "Your Zai API key from nousresearch.com",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-4o-mini", "openai/gpt-4.1-mini", "google/gemini-2.5-flash", "anthropic/claude-sonnet-4"],
    defaultModel: "openai/gpt-4o-mini",
    keyPlaceholder: "sk-or-...",
    keyHint: "OpenRouter API key from openrouter.ai",
  },
  {
    id: "groq",
    name: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
    defaultModel: "llama-3.3-70b-versatile",
    keyPlaceholder: "gsk_...",
    keyHint: "Groq API key from console.groq.com",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    baseURL: "https://opencode.ai/zen/go/v1",
    models: ["glm-5.1", "glm-5", "kimi-k2.5", "kimi-k2.6", "deepseek-v4-pro", "deepseek-v4-flash", "mimo-v2.5", "mimo-v2.5-pro"],
    defaultModel: "deepseek-v4-flash",
    keyPlaceholder: "oc-... or Zen API key",
    keyHint: "API key from opencode.ai/auth (Zen dashboard). OpenAI-compatible models only.",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    baseURL: "",
    models: [],
    defaultModel: "",
    keyPlaceholder: "API key...",
    keyHint: "Any OpenAI-compatible endpoint. Provide base URL and model name.",
  },
];

interface ApiConfig {
  providerId: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

function loadConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem("triviaApiConfig");
    if (raw) return JSON.parse(raw);
  } catch {}
  // migrate old key
  const oldKey = localStorage.getItem("openaiApiKey");
  if (oldKey) {
    return { providerId: "openai", apiKey: oldKey, baseURL: PROVIDERS[0].baseURL, model: PROVIDERS[0].defaultModel };
  }
  return { providerId: "openai", apiKey: "", baseURL: PROVIDERS[0].baseURL, model: PROVIDERS[0].defaultModel };
}

function saveConfig(config: ApiConfig) {
  localStorage.setItem("triviaApiConfig", JSON.stringify(config));
  // clean up old key
  localStorage.removeItem("openaiApiKey");
}

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ApiConfig>({ providerId: "openai", apiKey: "", baseURL: "", model: "" });
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfig(loadConfig());
      setTestResult(null);
    }
  }, [isOpen]);

  const currentProvider = PROVIDERS.find((p) => p.id === config.providerId) || PROVIDERS[0];

  const handleProviderChange = (id: string) => {
    const p = PROVIDERS.find((pr) => pr.id === id) || PROVIDERS[0];
    setConfig({
      ...config,
      providerId: id,
      baseURL: p.baseURL,
      model: p.defaultModel,
    });
    setTestResult(null);
  };

  const handleSave = () => {
    saveConfig(config);
    setIsOpen(false);
  };

  const handleTest = async () => {
    if (!config.apiKey) {
      setTestResult({ ok: false, message: "Enter an API key first." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: config.apiKey, baseURL: config.baseURL, model: config.model }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestResult({ ok: true, message: data.message || "Connection successful!" });
      } else {
        setTestResult({ ok: false, message: data.error || "Connection failed." });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition z-40"
        title="Settings"
      >
        <Settings size={24} />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <X size={20} />
            </button>

            <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">API Settings</h2>

            {/* Provider Selection */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
              <div className="relative">
                <select
                  value={config.providerId}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg appearance-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* API Key */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={config.apiKey}
                  onChange={(e) => { setConfig({ ...config, apiKey: e.target.value }); setTestResult(null); }}
                  placeholder={currentProvider.keyPlaceholder}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{currentProvider.keyHint}</p>
            </div>

            {/* Base URL */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Base URL
                {config.providerId !== "custom" && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">(auto-filled by provider)</span>
                )}
              </label>
              <input
                type="text"
                value={config.baseURL}
                onChange={(e) => { setConfig({ ...config, baseURL: e.target.value }); setTestResult(null); }}
                placeholder="https://api.openai.com/v1"
                readOnly={config.providerId !== "custom"}
                className={`w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  config.providerId !== "custom"
                    ? "bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300"
                    : "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                }`}
              />
            </div>

            {/* Model */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
              {currentProvider.models.length > 0 ? (
                <div className="relative">
                  <select
                    value={config.model}
                    onChange={(e) => { setConfig({ ...config, model: e.target.value }); setTestResult(null); }}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg appearance-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  >
                    {currentProvider.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              ) : (
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => { setConfig({ ...config, model: e.target.value }); setTestResult(null); }}
                  placeholder="e.g. gpt-4o-mini, llama-3.3-70b"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            {/* Test Connection */}
            <div className="mb-6">
              <button
                onClick={handleTest}
                disabled={testing || !config.apiKey}
                className="w-full py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </button>
              {testResult && (
                <div
                  className={`mt-3 p-3 rounded-lg flex items-start gap-2 text-sm ${
                    testResult.ok ? "bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                  }`}
                >
                  {testResult.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={!config.apiKey}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Settings
            </button>

            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-3">
              Settings stored in your browser only. Never sent anywhere except your chosen API provider.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export function getApiConfig(): ApiConfig {
  return loadConfig();
}
