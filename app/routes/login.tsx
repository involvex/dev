import { useState } from "react";
import { useNavigate } from "react-router";
import { Turnstile } from "@marsidev/react-turnstile";
import { Lock, User, KeyRound, AlertCircle, Github } from "lucide-react";
import type { Route } from "./+types/login";

export function meta() {
  return [
    { title: "Admin Login | dev.involvex" },
    { name: "description", content: "Secure admin login gate" },
  ];
}

// Helper for type-safe environment detection
const getIsDev = () => {
  const global = globalThis as unknown as {
    process?: { env?: { NODE_ENV?: string } };
  };
  return (
    import.meta.env.DEV ||
    import.meta.env.MODE === "development" ||
    global.process?.env?.NODE_ENV === "development"
  );
};

export function loader({ context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Cloudflare.Env & {
    TURNSTILE_SITE_KEY?: string;
  };
  const isDev = getIsDev();

  return {
    siteKey: env.TURNSTILE_SITE_KEY || "",
    isDev,
  };
}

export default function Login({ loaderData }: Route.ComponentProps) {
  const isDev = loaderData.isDev || getIsDev();

  console.log(
    "Login component mode:",
    import.meta.env.MODE,
    "isDev:",
    isDev,
    "loaderIsDev:",
    loaderData.isDev,
  );

  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState(
    isDev ? "dev-token" : "",
  );
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) {
      setError("Please complete the Turnstile challenge");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, turnstileToken }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (data.success) {
        navigate("/dashboard");
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 min-h-screen">
      <div className="w-full max-w-md relative">
        {/* Glow effect */}
        <div className="absolute -inset-1 bg-linear-to-r from-cyan-500/20 to-pink-500/20 blur-xl rounded-2xl opacity-50 dark:opacity-30"></div>

        <div className="relative border border-term-border-light dark:border-term-border-dark rounded-xl overflow-hidden bg-term-bg-light dark:bg-term-bg-dark shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="mx-auto w-12 h-12 bg-term-bar-light dark:bg-term-bar-dark rounded-full flex items-center justify-center mb-4 border border-term-border-light dark:border-term-border-dark">
              <Lock className="w-6 h-6 text-term-accent-light dark:text-term-accent-dark" />
            </div>
            <h1 className="text-2xl font-bold text-term-fg-light dark:text-term-fg-dark">
              Admin Access
            </h1>
            <p className="text-sm text-term-muted-light dark:text-term-muted-dark mt-2">
              Secure dev environment gateway
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-600 dark:text-red-400 text-sm animate-pulse-fade">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-term-muted-light dark:text-term-muted-dark">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Username"
                  aria-label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark placeholder:text-term-muted-light dark:placeholder:text-term-muted-dark focus:outline-none focus:ring-2 focus:ring-term-accent-light dark:focus:ring-term-accent-dark transition-all duration-200"
                />
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-term-muted-light dark:text-term-muted-dark">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="Password"
                  aria-label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-black/5 dark:bg-white/5 border border-term-border-light dark:border-term-border-dark rounded-lg text-term-fg-light dark:text-term-fg-dark placeholder:text-term-muted-light dark:placeholder:text-term-muted-dark focus:outline-none focus:ring-2 focus:ring-term-accent-light dark:focus:ring-term-accent-dark transition-all duration-200"
                />
              </div>

              <div className="flex justify-center pt-2">
                {!isDev ? (
                  <Turnstile
                    siteKey={loaderData.siteKey}
                    onSuccess={(token) => setTurnstileToken(token)}
                    onError={() => setError("Turnstile error occurred")}
                    options={{ theme: "auto" }}
                  />
                ) : (
                  <div className="text-xs text-term-muted-light bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full border border-term-border-light">
                    Turnstile disabled in DEV mode
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !turnstileToken}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-term-accent-light dark:bg-term-accent-dark text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-term-accent-light/20 dark:shadow-term-accent-dark/20"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                "Authenticate"
              )}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-term-border-light dark:border-term-border-dark"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-term-bg-light dark:bg-term-bg-dark px-2 text-term-muted-light dark:text-term-muted-dark">
                Or continue with
              </span>
            </div>
          </div>

          <a
            href="/api/auth/github"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-term-border-light dark:border-term-border-dark bg-black/5 dark:bg-white/5 text-term-fg-light dark:text-term-fg-dark font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <Github className="w-5 h-5" />
            Sign in with GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
