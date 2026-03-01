import type { Route } from "./+types/home";
import { TerminalSquare, Github, HandHeart, Code2 } from "lucide-react";

export function meta() {
  return [
    { title: "dev.involvex | Terminal Activity" },
    {
      name: "description",
      content: "Developer playground and redirect worker for InvolveX.",
    },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return {
    message: context.cloudflare.env.VALUE_FROM_CLOUDFLARE,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const currentPath = "~/dev.involvex";

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-8 max-w-5xl mx-auto w-full">
      <div className="flex flex-col flex-1 border border-term-border-light dark:border-term-border-dark rounded-lg overflow-hidden bg-term-bg-light dark:bg-term-bg-dark shadow-xl">
        {/* Fake Terminal Header */}
        <div className="flex items-center px-4 py-2 bg-term-bar-light/50 dark:bg-term-bar-dark/50 border-b border-term-border-light dark:border-term-border-dark">
          <div className="flex space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
          </div>
          <div className="mx-auto flex items-center space-x-2 text-xs font-semibold text-term-muted-light dark:text-term-muted-dark">
            <TerminalSquare className="w-3 h-3" />
            <span>bash - {currentPath}</span>
          </div>
        </div>

        {/* Terminal Body */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto font-mono text-sm leading-relaxed">
          {/* Welcome Message */}
          <div className="mb-6 animate-pulse-fade">
            <div className="text-term-accent-light dark:text-term-accent-dark font-bold mb-1">
              Welcome to InvolveX Developer Worker!
            </div>
            <div className="text-term-muted-light dark:text-term-muted-dark italic">
              System running React Router on Cloudflare Workers.
            </div>
            {loaderData?.message && (
              <div className="mt-2 pl-4 border-l-2 border-term-accent-light dark:border-term-accent-dark">
                Message from bindings: {loaderData.message}
              </div>
            )}
          </div>

          {/* Prompt 1 */}
          <div className="mb-4">
            <div className="flex items-center text-term-accent-light dark:text-term-accent-dark font-bold mb-2">
              <span className="text-pink-600 dark:text-pink-400">involvex</span>
              <span className="text-zinc-400 mx-1">@</span>
              <span className="text-cyan-600 dark:text-cyan-400">worker</span>
              <span className="text-term-fg-light dark:text-term-fg-dark mx-2">
                {" "}
                {currentPath} %{" "}
              </span>
              <span className="text-term-fg-light dark:text-term-fg-dark font-normal">
                ls -la --color=auto
              </span>
            </div>

            <div className="pl-4 grid gap-1 text-term-muted-light dark:text-term-muted-dark hover:[&>div]:text-term-fg-light dark:hover:[&>div]:text-term-fg-dark transition-colors">
              <div className="flex items-center group">
                <span className="w-24 opacity-50">drwxr-xr-x</span>
                <span className="w-16">staff</span>
                <a
                  href="/login"
                  className="text-term-accent-light dark:text-term-accent-dark hover:underline flex items-center gap-2"
                >
                  <TerminalSquare className="w-4 h-4" /> admin-login
                </a>
              </div>
              <div className="flex items-center group">
                <span className="w-24 opacity-50">drwxr-xr-x</span>
                <span className="w-16">staff</span>
                <a
                  href="/dashboard"
                  className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-2"
                >
                  <Code2 className="w-4 h-4" /> dashboard
                </a>
              </div>
              <div className="flex items-center group">
                <span className="w-24 opacity-50">drwxr-xr-x</span>
                <span className="w-16">staff</span>
                <a
                  href="/github"
                  className="text-term-muted-light dark:text-term-muted-dark hover:underline flex items-center gap-2"
                >
                  <Github className="w-4 h-4" /> .github
                </a>
              </div>
              <div className="flex items-center group">
                <span className="w-24 opacity-50">-rw-r--r--</span>
                <span className="w-16">staff</span>
                <a
                  href="https://github.com/involvex"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-2"
                >
                  <Code2 className="w-4 h-4" /> repositories
                </a>
              </div>
              <div className="flex items-center group">
                <span className="w-24 opacity-50">-rw-r--r--</span>
                <span className="w-16">staff</span>
                <a
                  href="https://github.com/sponsors/involvex"
                  target="_blank"
                  rel="noreferrer"
                  className="text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-2"
                >
                  <HandHeart className="w-4 h-4" /> funding.yml
                </a>
              </div>
            </div>
          </div>

          {/* Prompt 2 */}
          <div className="mb-4">
            <div className="flex items-center text-term-accent-light dark:text-term-accent-dark font-bold mb-2">
              <span className="text-pink-600 dark:text-pink-400">involvex</span>
              <span className="text-zinc-400 mx-1">@</span>
              <span className="text-cyan-600 dark:text-cyan-400">worker</span>
              <span className="text-term-fg-light dark:text-term-fg-dark mx-2">
                {" "}
                {currentPath} %{" "}
              </span>
              <span className="text-term-fg-light dark:text-term-fg-dark font-normal flex items-center">
                cat{" "}
                <span className="ml-2 px-1 bg-black/10 dark:bg-white/10 rounded animate-pulse cursor-text">
                  _
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
