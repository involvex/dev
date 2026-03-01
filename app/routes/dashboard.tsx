import { useState } from "react";
import { useNavigate } from "react-router";
import { LogOut, ImagePlus, Wand2, Download } from "lucide-react";
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

  const env = context.cloudflare.env as Cloudflare.Env & {
    ADMIN_USERNAME?: string;
  };
  return {
    username: env.ADMIN_USERNAME || "Admin",
  };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

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
    setError("");

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
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
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

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls Column */}
        <div className="col-span-1 border border-term-border-light dark:border-term-border-dark rounded-xl bg-term-bg-light dark:bg-term-bg-dark shadow-xl p-6 h-fit">
          <h2 className="text-lg font-bold mb-4 text-term-fg-light dark:text-term-fg-dark flex items-center gap-2">
            <ImagePlus className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
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

            {error && <div className="text-red-500 text-sm mt-2">{error}</div>}

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
        </div>

        {/* Preview Column */}
        <div className="col-span-1 lg:col-span-2">
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

            {/* Background Glow */}
            {!imageUrl && !isGenerating && (
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-pink-500/5 -z-10 rounded-xl"></div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
