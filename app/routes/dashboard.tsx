import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  LogOut,
  ImagePlus,
  Wand2,
  Download,
  UserCog,
  ShieldCheck,
  MessageSquare,
  Languages,
  FileText,
  Github,
  ExternalLink,
  TrendingUp,
  Compass,
  Link as LinkIcon,
  Copy,
} from "lucide-react";
import type { Route } from "./+types/dashboard";
import { redirect } from "react-router";

export function meta() {
  return [
    { title: "Admin Dashboard | dev.involvex" },
    { name: "description", content: "Secure admin dashboard" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const cookieHeader = request.headers.get("Cookie");
  const match = cookieHeader?.match(/session_id=([^;]+)/);

  if (!match) {
    return redirect("/login");
  }

  const sessionId = match[1];
  const session = await context.cloudflare.env.DB.prepare(
    "SELECT * FROM sessions WHERE id = ? AND expires_at > ?",
  )
    .bind(sessionId, Math.floor(Date.now() / 1000))
    .first();

  if (!session) {
    return redirect("/login");
  }

  // Get current username from API or fallback
  const user = await context.cloudflare.env.DB.prepare(
    "SELECT username FROM users LIMIT 1",
  ).first<{ username: string }>();

  const env = context.cloudflare.env as Cloudflare.Env & {
    ADMIN_USERNAME?: string;
  };

  return {
    username: user ? user.username : env.ADMIN_USERNAME || "Admin",
  };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "generator" | "ai-tools" | "github" | "profile" | "shortener"
  >("generator");

  // Generator State
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [genError, setGenError] = useState("");

  // AI Tools State
  const [aiTool, setAiTool] = useState<"chat" | "translate" | "summarize">(
    "chat",
  );
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { role: string; content: string }[]
  >([]);
  const [translateText, setTranslateText] = useState("");
  const [targetLang, setTargetLang] = useState("French");
  const [translateResult, setTranslateResult] = useState("");
  const [summarizeText, setSummarizeText] = useState("");
  const [summarizeResult, setSummarizeResult] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // URL Shortener State
  interface ShortUrlHistory {
    id: string;
    long_url: string;
    short_code: string;
    created_at: number;
  }

  const [longUrl, setLongUrl] = useState("");
  const [shortUrlResult, setShortUrlResult] = useState("");
  const [shortenerError, setShortenerError] = useState("");
  const [isShortening, setIsShortening] = useState(false);
  const [shortenerHistory, setShortenerHistory] = useState<ShortUrlHistory[]>(
    [],
  );

  // Profile State
  const [newUsername, setNewUsername] = useState(loaderData.username);
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
      navigate("/login");
    } catch (err) {
      console.error("Failed to logout", err);
    }
  };

  const generateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setGenError("");

    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Failed to generate image");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An error occurred";
      setGenError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAiChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const newMsg = { role: "user", content: chatInput };
    const updatedHistory = [...chatHistory, newMsg];
    setChatHistory(updatedHistory);
    setChatInput("");
    setIsAiLoading(true);
    setAiError("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedHistory }),
      });
      const data = (await res.json()) as { response?: string; error?: string };
      if (data.error) throw new Error(data.error);
      setChatHistory([
        ...updatedHistory,
        { role: "assistant", content: data.response || "" },
      ]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleTranslate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAiLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: translateText, target_lang: targetLang }),
      });
      const data = (await res.json()) as {
        translated_text?: string;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setTranslateResult(data.translated_text || "");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSummarize = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAiLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summarizeText }),
      });
      const data = (await res.json()) as { summary?: string; error?: string };
      if (data.error) throw new Error(data.error);
      setSummarizeResult(data.summary || "");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Summarization failed");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!longUrl.trim()) return;
    setIsShortening(true);
    setShortenerError("");
    setShortUrlResult("");

    try {
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ longUrl }),
      });
      const data = (await res.json()) as {
        shortUrl?: string;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setShortUrlResult(data.shortUrl || "");
      fetchHistory(); // Refresh history
      setLongUrl("");
    } catch (err) {
      setShortenerError(
        err instanceof Error ? err.message : "Failed to shorten URL",
      );
    } finally {
      setIsShortening(false);
    }
  };

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/history");
      const data = (await res.json()) as { history: ShortUrlHistory[] };
      setShortenerHistory(data.history || []);
    } catch (err) {
      console.error("Failed to fetch history", err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "shortener") {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileMessage("");
    setProfileError("");

    try {
      const res = await fetch("/api/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUsername, newPassword }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (data.success) {
        setProfileMessage(
          "Profile updated successfully! Use new credentials next time.",
        );
        setNewPassword("");
      } else {
        setProfileError(data.error || "Failed to update profile");
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-8 max-w-6xl mx-auto w-full min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between py-4 mb-8 border-b border-term-border-light dark:border-term-border-dark">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-term-fg-light dark:text-term-fg-dark">
            <Wand2 className="w-6 h-6 text-term-accent-light dark:text-term-accent-dark" />
            InvolveX Dashboard
          </h1>
          <p className="text-term-muted-light dark:text-term-muted-dark text-sm mt-1">
            Logged in as{" "}
            <span className="font-semibold text-pink-600 dark:text-pink-400">
              {loaderData.username}
            </span>
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 hover:bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg transition-colors text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </header>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 mb-6 p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-term-border-light dark:border-term-border-dark overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button
          onClick={() => setActiveTab("generator")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            activeTab === "generator"
              ? "bg-term-bg-light dark:bg-term-bg-dark text-term-accent-light dark:text-term-accent-dark shadow-sm"
              : "text-term-muted-light dark:text-term-muted-dark hover:text-term-fg-light dark:hover:text-term-fg-dark"
          }`}
        >
          <ImagePlus className="w-4 h-4" />
          AI Generator
        </button>
        <button
          onClick={() => setActiveTab("ai-tools")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            activeTab === "ai-tools"
              ? "bg-term-bg-light dark:bg-term-bg-dark text-term-accent-light dark:text-term-accent-dark shadow-sm"
              : "text-term-muted-light dark:text-term-muted-dark hover:text-term-fg-light dark:hover:text-term-fg-dark"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          AI Tools
        </button>
        <button
          onClick={() => setActiveTab("shortener")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            activeTab === "shortener"
              ? "bg-term-bg-light dark:bg-term-bg-dark text-term-accent-light dark:text-term-accent-dark shadow-sm"
              : "text-term-muted-light dark:text-term-muted-dark hover:text-term-fg-light dark:hover:text-term-fg-dark"
          }`}
        >
          <LinkIcon className="w-4 h-4" />
          URL Shortener
        </button>
        <button
          onClick={() => setActiveTab("github")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            activeTab === "github"
              ? "bg-term-bg-light dark:bg-term-bg-dark text-term-accent-light dark:text-term-accent-dark shadow-sm"
              : "text-term-muted-light dark:text-term-muted-dark hover:text-term-fg-light dark:hover:text-term-fg-dark"
          }`}
        >
          <Github className="w-4 h-4" />
          GitHub Explorer
        </button>
        <button
          onClick={() => setActiveTab("profile")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            activeTab === "profile"
              ? "bg-term-bg-light dark:bg-term-bg-dark text-term-accent-light dark:text-term-accent-dark shadow-sm"
              : "text-term-muted-light dark:text-term-muted-dark hover:text-term-fg-light dark:hover:text-term-fg-dark"
          }`}
        >
          <UserCog className="w-4 h-4" />
          Profile Settings
        </button>
      </div>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls Column */}
        <div className="col-span-1 border border-term-border-light dark:border-term-border-dark rounded-xl bg-term-bg-light dark:bg-term-bg-dark shadow-xl p-6 h-fit">
          {activeTab === "generator" && (
            <>
              <h2 className="text-lg font-bold mb-4 text-term-fg-light dark:text-term-fg-dark flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                AI Generator
              </h2>

              <form onSubmit={generateImage} className="space-y-4">
                <div>
                  <label
                    htmlFor="prompt"
                    className="block text-sm font-medium text-term-muted-light dark:text-term-muted-dark mb-2"
                  >
                    Image Prompt
                  </label>
                  <textarea
                    id="prompt"
                    rows={4}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="A futuristic cyber city with neon lights..."
                    className="w-full p-3 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark placeholder:text-term-muted-light dark:placeholder:text-term-muted-dark focus:outline-none focus:ring-2 focus:ring-term-accent-light dark:focus:ring-term-accent-dark transition-all duration-200 resize-none"
                  />
                </div>

                {genError && (
                  <div className="text-red-500 text-sm mt-2">{genError}</div>
                )}

                <button
                  type="submit"
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-term-accent-light dark:bg-term-accent-dark text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-term-accent-light/20 dark:shadow-term-accent-dark/20 gap-2"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Generate Image
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {activeTab === "ai-tools" && (
            <div className="space-y-6">
              <div className="flex gap-2 p-1 bg-black/5 dark:bg-white/5 rounded-lg">
                {(["chat", "translate", "summarize"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAiTool(t)}
                    className={`flex-1 py-2 text-xs font-bold rounded capitalize transition-all ${
                      aiTool === t
                        ? "bg-term-bg-light dark:bg-term-bg-dark text-term-accent-light"
                        : "text-term-muted-light hover:text-term-fg-light"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {aiTool === "chat" && (
                <form onSubmit={handleAiChat} className="space-y-4">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Llama 3 anything..."
                    className="w-full p-3 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark h-32 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isAiLoading || !chatInput.trim()}
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
                  >
                    {isAiLoading ? "Processing..." : "Send Message"}
                  </button>
                </form>
              )}

              {aiTool === "translate" && (
                <form onSubmit={handleTranslate} className="space-y-4">
                  <textarea
                    value={translateText}
                    onChange={(e) => setTranslateText(e.target.value)}
                    placeholder="Enter text to translate..."
                    className="w-full p-3 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark h-24"
                  />
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full p-2 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark"
                  >
                    <option>French</option>
                    <option>Spanish</option>
                    <option>German</option>
                    <option>Chinese</option>
                  </select>
                  <button
                    type="submit"
                    disabled={isAiLoading || !translateText.trim()}
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
                  >
                    Translate
                  </button>
                </form>
              )}

              {aiTool === "summarize" && (
                <form onSubmit={handleSummarize} className="space-y-4">
                  <textarea
                    value={summarizeText}
                    onChange={(e) => setSummarizeText(e.target.value)}
                    placeholder="Enter long text to summarize..."
                    className="w-full p-3 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark h-32"
                  />
                  <button
                    type="submit"
                    disabled={isAiLoading || !summarizeText.trim()}
                    className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
                  >
                    Summarize
                  </button>
                </form>
              )}
              {aiError && <div className="text-red-500 text-xs">{aiError}</div>}
            </div>
          )}

          {activeTab === "shortener" && (
            <>
              <h2 className="text-lg font-bold mb-4 text-term-fg-light dark:text-term-fg-dark flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                URL Shortener
              </h2>
              <form onSubmit={handleShorten} className="space-y-4">
                <div>
                  <label
                    htmlFor="longUrl"
                    className="block text-sm font-medium text-term-muted-light dark:text-term-muted-dark mb-2"
                  >
                    Long URL
                  </label>
                  <input
                    id="longUrl"
                    type="url"
                    required
                    value={longUrl}
                    onChange={(e) => setLongUrl(e.target.value)}
                    placeholder="https://example.com/very-long-url..."
                    className="w-full p-3 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark placeholder:text-term-muted-light dark:placeholder:text-term-muted-dark focus:outline-none focus:ring-2 focus:ring-term-accent-light dark:focus:ring-term-accent-dark transition-all duration-200"
                  />
                </div>
                {shortenerError && (
                  <div className="text-red-500 text-sm">{shortenerError}</div>
                )}
                <button
                  type="submit"
                  disabled={isShortening || !longUrl.trim()}
                  className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-purple-600 dark:bg-purple-500 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-600/20 gap-2"
                >
                  {isShortening ? "Shortening..." : "Shorten URL"}
                </button>
              </form>
            </>
          )}

          {activeTab === "github" && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-term-fg-light dark:text-term-fg-dark flex items-center gap-2">
                <Github className="w-5 h-5" />
                GitHub Explorer
              </h2>
              <p className="text-sm text-term-muted-light dark:text-term-muted-dark">
                Explore what the community is building on GitHub.
              </p>

              <div className="space-y-3">
                <a
                  href="https://github.com/explore"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full p-4 rounded-xl border border-term-border-light dark:border-term-border-dark bg-black/5 dark:bg-white/5 hover:bg-term-accent-light/5 flex items-center justify-between group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Compass className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="font-bold text-sm">Explore GitHub</p>
                      <p className="text-xs text-term-muted-light">
                        Discover new projects
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>

                <a
                  href="https://github.com/trending"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full p-4 rounded-xl border border-term-border-light dark:border-term-border-dark bg-black/5 dark:bg-white/5 hover:bg-term-accent-light/5 flex items-center justify-between group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="font-bold text-sm">Trending Now</p>
                      <p className="text-xs text-term-muted-light">
                        What's hot today
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <>
              <h2 className="text-lg font-bold mb-4 text-term-fg-light dark:text-term-fg-dark flex items-center gap-2">
                <UserCog className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                Manage Profile
              </h2>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label
                    htmlFor="username"
                    className="block text-sm font-medium text-term-muted-light dark:text-term-muted-dark mb-2"
                  >
                    New Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full p-2.5 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark focus:outline-none focus:ring-2 focus:ring-term-accent-light dark:focus:ring-term-accent-dark transition-all duration-200"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-term-muted-light dark:text-term-muted-dark mb-2"
                  >
                    New Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-2.5 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark focus:outline-none focus:ring-2 focus:ring-term-accent-light dark:focus:ring-term-accent-dark transition-all duration-200"
                  />
                </div>

                {profileMessage && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-green-600 dark:text-green-400 text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>{profileMessage}</span>
                  </div>
                )}

                {profileError && (
                  <div className="text-red-500 text-xs">{profileError}</div>
                )}

                <button
                  type="submit"
                  disabled={isUpdatingProfile}
                  className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-pink-600 dark:bg-pink-500 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-600/20 gap-2"
                >
                  {isUpdatingProfile ? "Updating..." : "Update Credentials"}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Preview Column */}
        <div className="col-span-1 lg:col-span-2">
          {activeTab === "generator" && (
            <div className="h-full min-h-[400px] border border-term-border-light dark:border-term-border-dark rounded-xl bg-term-bg-light/50 dark:bg-term-bg-dark/50 flex flex-col items-center justify-center relative overflow-hidden group">
              {imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt={prompt}
                    className="w-full h-full object-contain p-4"
                  />

                  {/* Download Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    <a
                      href={imageUrl}
                      download={`involvex-ai-${Date.now()}.png`}
                      className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-semibold hover:scale-105 transition-transform shadow-2xl"
                    >
                      <Download className="w-5 h-5" />
                      Download Image
                    </a>
                  </div>
                </>
              ) : isGenerating ? (
                <div className="flex flex-col items-center justify-center text-term-muted-light dark:text-term-muted-dark animate-pulse">
                  <Wand2 className="w-12 h-12 mb-4 animate-bounce text-term-accent-light dark:text-term-accent-dark" />
                  <p>Molding pixels with AI magic...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-term-muted-light dark:text-term-muted-dark opacity-50">
                  <ImagePlus className="w-12 h-12 mb-4" />
                  <p>Your generated image will appear here</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "ai-tools" && (
            <div className="h-full flex flex-col border border-term-border-light dark:border-term-border-dark rounded-xl bg-term-bg-light/30 dark:bg-term-bg-dark/30 p-6 overflow-hidden">
              {aiTool === "chat" && (
                <div className="flex-1 flex flex-col">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-indigo-500">
                    <MessageSquare className="w-5 h-5" /> Chat with Llama
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin scrollbar-thumb-indigo-500/20">
                    {chatHistory.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center opacity-30">
                        <MessageSquare className="w-12 h-12 mb-2" />
                        <p>No messages yet. Ask me something!</p>
                      </div>
                    )}
                    {chatHistory.map((m, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-lg max-w-[80%] ${m.role === "user" ? "bg-indigo-600 text-white self-end ml-auto" : "bg-black/10 dark:bg-white/10 text-term-fg-light dark:text-term-fg-dark"}`}
                      >
                        <p className="text-xs font-bold mb-1 opacity-50 uppercase">
                          {m.role}
                        </p>
                        <p className="text-sm">{m.content}</p>
                      </div>
                    ))}
                    {isAiLoading && aiTool === "chat" && (
                      <div className="bg-black/10 dark:bg-white/10 p-3 rounded-lg w-24 animate-pulse">
                        <div className="h-2 w-full bg-indigo-500/30 rounded mb-2"></div>
                        <div className="h-2 w-2/3 bg-indigo-500/30 rounded"></div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {aiTool === "translate" && (
                <div className="h-full flex flex-col">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-indigo-500">
                    <Languages className="w-5 h-5" /> Translation Result
                  </h3>
                  <div className="flex-1 p-6 rounded-xl bg-black/5 dark:bg-white/5 border border-dashed border-term-border-light flex items-center justify-center text-center">
                    {translateResult ? (
                      <p className="text-xl font-medium italic">
                        "{translateResult}"
                      </p>
                    ) : (
                      <p className="text-term-muted-light">
                        Translation will appear here...
                      </p>
                    )}
                  </div>
                </div>
              )}

              {aiTool === "summarize" && (
                <div className="h-full flex flex-col">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-indigo-500">
                    <FileText className="w-5 h-5" /> Summary
                  </h3>
                  <div className="flex-1 p-6 rounded-xl bg-black/5 dark:bg-white/5 border border-term-border-light overflow-y-auto">
                    {summarizeResult ? (
                      <div className="space-y-4">
                        <p className="text-sm leading-relaxed">
                          {summarizeResult}
                        </p>
                        <div className="h-px bg-term-border-light w-full"></div>
                        <p className="text-xs text-term-muted-light italic">
                          Summarized by bart-large-cnn
                        </p>
                      </div>
                    ) : (
                      <p className="text-term-muted-light text-center">
                        Summary will appear here...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "shortener" && (
            <div className="h-full flex flex-col border border-term-border-light dark:border-term-border-dark rounded-xl bg-term-bg-light/30 dark:bg-term-bg-dark/30 p-6 overflow-hidden">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-purple-600 dark:text-purple-400">
                <LinkIcon className="w-5 h-5" /> Your Shortened URLs
              </h3>

              {shortUrlResult && (
                <div className="mb-6 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-between">
                  <div className="truncate mr-4">
                    <p className="text-xs text-purple-600 dark:text-purple-400 font-bold uppercase mb-1">
                      Success! Here's your link:
                    </p>
                    <a
                      href={shortUrlResult}
                      target="_blank"
                      rel="noreferrer"
                      className="text-lg font-mono font-medium truncate hover:underline"
                    >
                      {shortUrlResult}
                    </a>
                  </div>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(shortUrlResult)
                    }
                    className="p-2 hover:bg-purple-500/10 rounded-lg text-purple-600 dark:text-purple-400 transition-colors"
                    title="Copy to clipboard"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-500/20">
                {shortenerHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30">
                    <LinkIcon className="w-12 h-12 mb-2" />
                    <p>No shortened URLs yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {shortenerHistory.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark hover:border-purple-500/30 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <a
                            href={`/url=${item.short_code}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-purple-600 dark:text-purple-400 font-bold hover:underline"
                          >
                            dev.involvex.workers.dev/url={item.short_code}
                          </a>
                          <span className="text-xs text-term-muted-light dark:text-term-muted-dark">
                            {new Date(
                              item.created_at * 1000,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-term-muted-light dark:text-term-muted-dark truncate">
                          {item.long_url}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "github" && (
            <div className="h-full flex flex-col space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                <div className="border border-term-border-light dark:border-term-border-dark rounded-xl bg-gradient-to-br from-blue-500/5 to-transparent p-6 flex flex-col">
                  <Compass className="w-8 h-8 text-blue-500 mb-4" />
                  <h3 className="text-xl font-bold mb-2">Discovery</h3>
                  <p className="text-sm text-term-muted-light flex-1">
                    GitHub Explore lets you browse collections, topics, and
                    high-quality projects recommended based on your interests.
                  </p>
                  <a
                    href="https://github.com/explore"
                    target="_blank"
                    className="mt-4 inline-flex items-center gap-2 text-blue-500 text-sm font-bold hover:underline"
                  >
                    Go to Explore <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="border border-term-border-light dark:border-term-border-dark rounded-xl bg-gradient-to-br from-green-500/5 to-transparent p-6 flex flex-col">
                  <TrendingUp className="w-8 h-8 text-green-500 mb-4" />
                  <h3 className="text-xl font-bold mb-2">Trends</h3>
                  <p className="text-sm text-term-muted-light flex-1">
                    See what the most popular repositories are today. Filter by
                    language or time period to stay ahead of the curve.
                  </p>
                  <a
                    href="https://github.com/trending"
                    target="_blank"
                    className="mt-4 inline-flex items-center gap-2 text-green-500 text-sm font-bold hover:underline"
                  >
                    View Trending <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="p-8 rounded-xl border border-term-border-light dark:border-term-border-dark bg-black/5 dark:bg-white/5 relative overflow-hidden">
                <Github className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 opacity-[0.03] -rotate-12" />
                <div className="relative z-10 text-center space-y-4">
                  <h4 className="text-2xl font-bold">Ready to build?</h4>
                  <p className="text-sm text-term-muted-light max-w-md mx-auto">
                    InvolveX is built with the latest Cloudflare tech. Use these
                    resources to find inspiration for your next feature or open
                    source contribution.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="h-full space-y-8">
              <div className="border border-term-border-light dark:border-term-border-dark rounded-xl bg-term-bg-light/30 dark:bg-term-bg-dark/30 p-8">
                <h3 className="text-xl font-bold mb-4 text-term-fg-light dark:text-term-fg-dark">
                  Security Overview
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark">
                    <p className="text-xs text-term-muted-light dark:text-term-muted-dark mb-1 uppercase tracking-wider">
                      Session Status
                    </p>
                    <p className="text-green-600 dark:text-green-400 font-mono text-sm flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      Active & Encrypted
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark">
                    <p className="text-xs text-term-muted-light dark:text-term-muted-dark mb-1 uppercase tracking-wider">
                      Storage Binding
                    </p>
                    <p className="text-cyan-600 dark:text-cyan-400 font-mono text-sm">
                      Cloudflare D1 SQL
                    </p>
                  </div>
                </div>

                <div className="mt-8 p-6 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
                  <h4 className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 font-bold mb-2">
                    <ShieldCheck className="w-4 h-4" />
                    Admin Responsibility
                  </h4>
                  <p className="text-sm text-term-muted-light dark:text-term-muted-dark leading-relaxed">
                    Changing your credentials updates the primary admin account
                    stored in the database. If you lose these credentials, you
                    will need to reset them manually via the wrangler CLI.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
