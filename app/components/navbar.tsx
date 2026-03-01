import { Moon, Sun, Terminal } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "../lib/utils";
import { Link } from "react-router";

export function Navbar() {
  const { theme, setTheme } = useTheme();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-term-border-light dark:border-term-border-dark bg-term-bar-light/95 dark:bg-term-bar-dark/95 backdrop-blur supports-[backdrop-filter]:bg-term-bar-light/60 dark:supports-[backdrop-filter]:bg-term-bar-dark/60">
      <div className="container flex h-14 max-w-screen-2xl items-center mx-auto px-4 sm:px-8">
        <div className="mr-4 flex">
          <Link to="/" className="mr-6 flex items-center space-x-2">
            <Terminal className="h-5 w-5 opacity-80" />
            <span className="hidden font-bold sm:inline-block">
              dev.involvex
            </span>
          </Link>
          <nav className="flex items-center space-x-4 sm:space-x-6 text-sm font-medium">
            <Link
              to="/github"
              className="transition-colors hover:text-term-accent-light dark:hover:text-term-accent-dark opacity-80 hover:opacity-100"
            >
              GitHub
            </Link>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
          <nav className="flex items-center">
            <button
              onClick={() =>
                setTheme(
                  theme === "dark" ||
                    (theme === "system" &&
                      window.matchMedia("(prefers-color-scheme: dark)").matches)
                    ? "light"
                    : "dark",
                )
              }
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                "h-9 w-9 hover:bg-black/10 dark:hover:bg-white/10",
              )}
            >
              <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </button>
          </nav>
        </div>
      </div>
    </nav>
  );
}
