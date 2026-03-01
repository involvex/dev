import { Hono, type Context, type Next } from "hono";
import { createRequestHandler } from "react-router";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";

type AppEnv = {
  Bindings: Cloudflare.Env & {
    TURNSTILE_SECRET_KEY: string;
    ADMIN_USERNAME: string;
    ADMIN_PASSWORD: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_OAUTH_REDIRECT: string;
  };
};

const app = new Hono<AppEnv>();

// Turnstile verification middleware/helper
async function verifyTurnstile(token: string, secret: string) {
  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: formData,
    },
  );

  const data = (await res.json()) as { success: boolean };
  return data.success;
}

// -----------------------------------------------------------------------------
// Auth API
// -----------------------------------------------------------------------------

app.post("/api/login", async (c) => {
  const body = (await c.req.json()) as {
    username?: string;
    password?: string;
    turnstileToken?: string;
  };
  const { username, password, turnstileToken } = body;

  if (!username || !password || !turnstileToken) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  // 1. Verify Turnstile
  const isValidTurnstile = await verifyTurnstile(
    turnstileToken,
    c.env.TURNSTILE_SECRET_KEY,
  );
  if (!isValidTurnstile) {
    return c.json({ error: "Turnstile verification failed" }, 400);
  }

  // 2. Verify Credentials
  if (username !== c.env.ADMIN_USERNAME || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // 3. Create Session in D1
  const sessionId = crypto.randomUUID();
  // 24 hours expiry
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

  await c.env.DB.prepare("INSERT INTO sessions (id, expires_at) VALUES (?, ?)")
    .bind(sessionId, expiresAt)
    .run();

  // 4. Set Cookie
  setCookie(c, "session_id", sessionId, {
    path: "/",
    secure: true,
    httpOnly: true,
    maxAge: 60 * 60 * 24, // 24 hours
    sameSite: "Strict",
  });

  return c.json({ success: true });
});

app.post("/api/logout", async (c) => {
  const sessionId = getCookie(c, "session_id");

  if (sessionId) {
    // Delete from DB
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind(sessionId)
      .run();
  }

  deleteCookie(c, "session_id", { path: "/" });
  return c.json({ success: true });
});

app.get("/api/me", async (c) => {
  const sessionId = getCookie(c, "session_id");

  if (!sessionId) {
    return c.json({ authenticated: false });
  }

  const session = await c.env.DB.prepare(
    "SELECT * FROM sessions WHERE id = ? AND expires_at > ?",
  )
    .bind(sessionId, Math.floor(Date.now() / 1000))
    .first();

  if (!session) {
    // Session doesn't exist or expired
    deleteCookie(c, "session_id", { path: "/" });
    return c.json({ authenticated: false });
  }

  return c.json({ authenticated: true, username: c.env.ADMIN_USERNAME });
});

// -----------------------------------------------------------------------------
// GitHub OAuth
// -----------------------------------------------------------------------------

app.get("/api/auth/github", (c) => {
  const url = `https://github.com/login/oauth/authorize?client_id=${c.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(c.env.GITHUB_OAUTH_REDIRECT)}&scope=user:email`;
  return c.redirect(url);
});

app.get("/oauth/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.text("Missing code", 400);

  // 1. Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: c.env.GITHUB_OAUTH_REDIRECT,
    }),
  });

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    return c.text("Failed to get access token", 400);
  }

  // 2. Get user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `token ${tokenData.access_token}`,
      "User-Agent": "involvex-dev-worker",
    },
  });

  const userData = (await userRes.json()) as { login?: string };
  if (!userData.login) {
    return c.text("Failed to get user info", 400);
  }

  // 3. Create Session in D1
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

  await c.env.DB.prepare("INSERT INTO sessions (id, expires_at) VALUES (?, ?)")
    .bind(sessionId, expiresAt)
    .run();

  // 4. Set Cookie & Redirect
  setCookie(c, "session_id", sessionId, {
    path: "/",
    secure: true,
    httpOnly: true,
    maxAge: 60 * 60 * 24,
    sameSite: "Strict",
  });

  return c.redirect("/dashboard");
});

// Middleware to protect certain routes
const requireAuth = async (c: Context<AppEnv>, next: Next) => {
  const sessionId = getCookie(c, "session_id");
  if (!sessionId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await c.env.DB.prepare(
    "SELECT * FROM sessions WHERE id = ? AND expires_at > ?",
  )
    .bind(sessionId, Math.floor(Date.now() / 1000))
    .first();

  if (!session) {
    deleteCookie(c, "session_id", { path: "/" });
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};

app.post("/api/generate-image", requireAuth, async (c) => {
  const body = (await c.req.json()) as { prompt?: string };
  const { prompt } = body;

  if (!prompt) {
    return c.json({ error: "Prompt is required" }, 400);
  }

  try {
    const inputs = { prompt };
    const response = await c.env.AI.run(
      "@cf/stabilityai/stable-diffusion-xl-base-1.0",
      inputs,
    );

    return new Response(response as ReadableStream | ArrayBuffer, {
      headers: {
        "content-type": "image/png",
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: errorMessage }, 500);
  }
});

// SSR react-router
app.get("*", (c) => {
  const requestHandler = createRequestHandler(
    () => import("virtual:react-router/server-build"),
    import.meta.env.MODE,
  );

  return requestHandler(c.req.raw, {
    cloudflare: { env: c.env, ctx: c.executionCtx },
  });
});

export default app;
