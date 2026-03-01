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
  // First check D1
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE username = ?")
    .bind(username)
    .first<{ password: string }>();

  const isValid = user
    ? user.password === password
    : username === c.env.ADMIN_USERNAME && password === c.env.ADMIN_PASSWORD;

  if (!isValid) {
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

  // Get username from D1 or fallback
  const user = await c.env.DB.prepare(
    "SELECT username FROM users LIMIT 1",
  ).first<{ username: string }>();
  const username = user ? user.username : c.env.ADMIN_USERNAME;

  return c.json({ authenticated: true, username });
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

// -----------------------------------------------------------------------------
// Profile API
// -----------------------------------------------------------------------------

app.post("/api/update-profile", requireAuth, async (c) => {
  const body = (await c.req.json()) as {
    newUsername?: string;
    newPassword?: string;
  };
  const { newUsername, newPassword } = body;

  if (!newUsername || !newPassword) {
    return c.json({ error: "Username and password are required" }, 400);
  }

  // Upsert user (assuming one admin for now)
  const existingUser = await c.env.DB.prepare(
    "SELECT username FROM users LIMIT 1",
  ).first();

  if (existingUser) {
    await c.env.DB.prepare(
      "UPDATE users SET username = ?, password = ? WHERE username = ?",
    )
      .bind(
        newUsername,
        newPassword,
        (existingUser as { username: string }).username,
      )
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO users (username, password) VALUES (?, ?)",
    )
      .bind(newUsername, newPassword)
      .run();
  }

  return c.json({ success: true });
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

// -----------------------------------------------------------------------------
// Image Generation API
// -----------------------------------------------------------------------------

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

interface RoleMessage {
  role: string;
  content: string;
}

app.post("/api/ai/chat", requireAuth, async (c) => {
  const body = (await c.req.json()) as { messages?: RoleMessage[] };
  if (!body.messages) return c.json({ error: "Messages are required" }, 400);

  try {
    const response = await c.env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: body.messages,
    });
    return c.json(response);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "AI Error" },
      500,
    );
  }
});

app.post("/api/ai/translate", requireAuth, async (c) => {
  const body = (await c.req.json()) as { text?: string; target_lang?: string };
  if (!body.text || !body.target_lang)
    return c.json({ error: "Text and target language are required" }, 400);

  try {
    const response = await c.env.AI.run("@cf/meta/m2m100-1.2b", {
      text: body.text,
      target_lang: body.target_lang,
    });
    return c.json(response);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "AI Error" },
      500,
    );
  }
});

app.post("/api/ai/summarize", requireAuth, async (c) => {
  const body = (await c.req.json()) as { text?: string };
  if (!body.text) return c.json({ error: "Text is required" }, 400);

  try {
    const response = await c.env.AI.run("@cf/facebook/bart-large-cnn", {
      input_text: body.text,
    });
    return c.json(response);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "AI Error" },
      500,
    );
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
