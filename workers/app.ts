import { Hono, type Context, type Next } from "hono";
import { createRequestHandler } from "react-router";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { nanoid } from "nanoid";

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
  if (!getIsDev()) {
    const isValidTurnstile = await verifyTurnstile(
      turnstileToken,
      c.env.TURNSTILE_SECRET_KEY,
    );
    if (!isValidTurnstile) {
      return c.json({ error: "Turnstile verification failed" }, 400);
    }
  } else {
    console.log("Skipping Turnstile verification in DEV mode");
  }

  // 2. Verify Credentials
  // First check D1
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE username = ?")
    .bind(username)
    .first<{ password_hash: string }>();

  // Fallback to admin credentials if user doesn't exist in DB
  const isValid = user
    ? user.password_hash === password
    : username === c.env.ADMIN_USERNAME && password === c.env.ADMIN_PASSWORD;

  if (!isValid) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // 3. Create Session in D1
  const sessionId = crypto.randomUUID();
  // 24 hours expiry
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

  await c.env.DB.prepare(
    "INSERT INTO sessions (id, username, expires_at) VALUES (?, ?, ?)",
  )
    .bind(sessionId, username, expiresAt)
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
    .first<{ username: string }>();

  if (!session) {
    // Session doesn't exist or expired
    deleteCookie(c, "session_id", { path: "/" });
    return c.json({ authenticated: false });
  }

  return c.json({ authenticated: true, username: session.username });
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
      "UPDATE users SET username = ?, password_hash = ? WHERE username = ?",
    )
      .bind(
        newUsername,
        newPassword,
        (existingUser as { username: string }).username,
      )
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)",
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

  await c.env.DB.prepare(
    "INSERT INTO sessions (id, username, expires_at) VALUES (?, ?, ?)",
  )
    .bind(sessionId, userData.login, expiresAt)
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

// -----------------------------------------------------------------------------
// URL Shortener API
// -----------------------------------------------------------------------------

// A list of commonly used short url providers to prevent redirection loops
const BLOCKED_DOMAINS = new Set([
  "0rz.tw",
  "0x.co",
  "1-url.net",
  "126.am",
  "1b.yt",
  "1link.in",
  "1tk.us",
  "1un.fr",
  "1url.com",
  "1url.cz",
  "1wb2.net",
  "2.gp",
  "2.ht",
  "207.net",
  "23o.net",
  "2ad.in",
  "2big.at",
  "2doc.net",
  "2fear.com",
  "2o7.net",
  "2pl.us",
  "2tu.us",
  "2ty.in",
  "2u.xf.cz",
  "2ya.com",
  "3ra.be",
  "3x.si",
  "4i.ae",
  "4url.cc",
  "4view.me",
  "5em.cz",
  "5url.net",
  "5z8.info",
  "6fr.ru",
  "6g6.eu",
  "6url.com",
  "7.ly",
  "76.gd",
  "77.ai",
  "7fth.cc",
  "7li.in",
  "7vd.cn",
  "8u.cz",
  "944.la",
  "98.to",
  "9nl.com",
  "a.co",
  "a.gg",
  "a.nf",
  "a0.fr",
  "a2a.me",
  "aaa.tl",
  "abbr.sk",
  "abbrr.com",
  "ad-med.cz",
  "ad5.eu",
  "ad7.biz",
  "adb.ug",
  "adbe.ly",
  "adf.ly",
  "adfa.st",
  "adfly.fr",
  "adfoc.us",
  "adjix.com",
  "adli.pw",
  "admy.link",
  "adv.li",
  "ajn.me",
  "aka.gr",
  "aka.ms",
  "al.ly",
  "alil.in",
  "alturl.com",
  "an.to",
  "ancstry.me",
  "any.gs",
  "apple.co",
  "aqva.pl",
  "aqx.es",
  "ares.tl",
  "asso.in",
  "atu.ca",
  "au.ms",
  "ayt.fr",
  "azali.fr",
  "b-ex.it",
  "b00.fr",
  "b23.ru",
  "b54.in",
  "bacn.me",
  "baid.us",
  "bam.bz",
  "baw.com",
  "bc.vc",
  "bee4.biz",
  "benchurl.com",
  "bim.im",
  "bit.do",
  "bit.ly",
  "bitly.com",
  "bitly.net",
  "bitw.in",
  "bkite.com",
  "blap.net",
  "ble.pl",
  "blip.tv",
  "bloat.me",
  "boi.re",
  "bote.me",
  "bougn.at",
  "bpl.kr",
  "br4.in",
  "brk.to",
  "brzu.net",
  "bu.lk",
  "bucks.as",
  "budurl.com",
  "buff.ly",
  "buk.me",
  "bul.lu",
  "burnurl.com",
  "bxl.me",
  "by2.io",
  "bzh.me",
  "c-o.in",
  "c23.biz",
  "cachor.ro",
  "captur.in",
  "carmarket.jp",
  "catchylink.com",
  "cbrogan.me",
  "cbs.so",
  "cbug.cc",
  "cc.cc",
  "ccj.im",
  "ce.do",
  "cf.ly",
  "cf2.me",
  "cf6.co",
  "checkd.info",
  "checkthe.info",
  "chilp.it",
  "cjb.net",
  "cl.ly",
  "clck.ru",
  "cli.gs",
  "clickmeter.com",
  "clikk.in",
  "cn86.org",
  "coinurl.com",
  "con.mk",
  "cort.as",
  "couic.fr",
  "cr.tl",
  "crg.ng",
  "crwl.it",
  "ctx.li",
  "ctx.ly",
  "cudder.it",
  "cur.lv",
  "curl.im",
  "cut.do",
  "cut.pe",
  "cut.sk",
  "cutit.org",
  "cutt.eu",
  "cutt.us",
  "cutu.me",
  "cuturl.co",
  "cuturl.com",
  "cybr.fr",
  "cyonix.to",
  "d.pr",
  "d75.eu",
  "da.gd",
  "daa.pl",
  "dai.ly",
  "db.tt",
  "dd.ma",
  "ddp.net",
  "decenturl.com",
  "dfl8.me",
  "dft.ba",
  "di.do",
  "digbig.com",
  "digg.com",
  "disq.us",
  "doiop.com",
  "dolp.cc",
  "dopice.sk",
  "droid.ws",
  "drw.sh",
  "dv.gd",
  "dwarfurl.com",
  "dy.fi",
  "dyo.gs",
  "e37.eu",
  "easyuri.com",
  "easyurl.net",
  "ecra.se",
  "eepurl.com",
  "ely.re",
  "er.cz",
  "erax.cz",
  "erw.cz",
  "esp.to",
  "esyurl.com",
  "ewerl.com",
  "ex9.co",
  "ezurl.cc",
  "fa.do",
  "ff.im",
  "fff.re",
  "fff.to",
  "fff.wf",
  "fhurl.com",
  "filz.fr",
  "fire.to",
  "firsturl.de",
  "flic.kr",
  "flip.it",
  "flpbd.it",
  "fly2.ws",
  "flyt.it",
  "fnk.es",
  "foe.hn",
  "folu.me",
  "fon.gs",
  "freze.it",
  "fur.ly",
  "fwd4.me",
  "g00.me",
  "gddy.co",
  "gdl.ink",
  "gg.gg",
  "git.io",
  "gl.am",
  "go.me",
  "go2.me",
  "go2cut.com",
  "go2l.ink",
  "godaddy.co",
  "goo.gl",
  "goo.lu",
  "good.ly",
  "goshrink.com",
  "gowat.ch",
  "grabify.link",
  "grem.io",
  "gri.ms",
  "grin.to",
  "guiama.is",
  "gurl.es",
  "ha.do",
  "hadej.co",
  "hec.su",
  "hellotxt.com",
  "hex.io",
  "hide.my",
  "hjkl.fr",
  "ho.do",
  "hops.me",
  "hover.com",
  "href.in",
  "href.li",
  "ht.ly",
  "htl.li",
  "htxt.it",
  "hugeurl.com",
  "huit.re",
  "hurl.it",
  "hurl.me",
  "hurl.ws",
  "i-2.co",
  "i.cl",
  "i99.cz",
  "icanhaz.com",
  "icit.fr",
  "ick.li",
  "icks.ro",
  "idek.net",
  "iiiii.in",
  "iky.fr",
  "ilix.in",
  "imgur.com",
  "info.ms",
  "inreply.to",
  "inx.lv",
  "is.gd",
  "iscool.net",
  "isra.li",
  "iterasi.net",
  "itm.im",
  "itnues.net",
  "ito.mx",
  "ity.im",
  "iu.tn",
  "iwantth.is",
  "ix.sk",
  "j.gs",
  "j.mp",
  "jab.la",
  "jdem.cz",
  "jieb.be",
  "jijr.com",
  "jmp2.net",
  "jp22.net",
  "jqw.de",
  "just.as",
  "k6.re",
  "ka.do",
  "kask.us",
  "kbit.co",
  "kd2.org",
  "keep.re",
  "kfd.pl",
  "kissa.be",
  "kks.me",
  "kl.am",
  "klck.me",
  "korta.nu",
  "kr3w.de",
  "krat.si",
  "kratsi.cz",
  "krod.cz",
  "krunchd.com",
  "kuc.cz",
  "kutt.it",
  "kwhit.com",
  "kxb.me",
  "l-k.be",
  "l.ead.me",
  "l.gg",
  "l.ly",
  "l9.fr",
  "lc-s.co",
  "lc.cx",
  "lcut.in",
  "libero.it",
  "lick.my",
  "lien.li",
  "lien.pl",
  "lihi.cc",
  "liip.to",
  "liltext.com",
  "lin.cr",
  "lin.io",
  "link.do",
  "link.tl",
  "linkbee.com",
  "linkbun.ch",
  "linke.bid",
  "linkn.co",
  "liurl.cn",
  "llk.dk",
  "llu.ch",
  "ln-s.net",
  "ln-s.ru",
  "lnk.co",
  "lnk.direct",
  "lnk.gd",
  "lnk.in",
  "lnk.ly",
  "lnk.sk",
  "lnkd.in",
  "lnked.in",
  "lnks.fr",
  "lnky.fr",
  "lnp.sn",
  "lolthis.me",
  "loopt.us",
  "lp25.fr",
  "lru.jp",
  "lt.tl",
  "lurl.no",
  "lvvk.com",
  "lynk.my",
  "m1p.fr",
  "m3mi.com",
  "make.my",
  "mavrev.com",
  "mby.me",
  "mcaf.ee",
  "mdl29.net",
  "metamark.net",
  "meteor.link",
  "mic.fr",
  "migre.me",
  "minilien.com",
  "miniurl.com",
  "minu.me",
  "minurl.fr",
  "moc.ac",
  "moourl.com",
  "more.sh",
  "mrw.so",
  "mut.lu",
  "muz.so",
  "mysp.ac",
  "myurl.in",
  "ne1.net",
  "nearwez.com",
  "net.ms",
  "net46.net",
  "nicou.ch",
  "nig.gr",
  "njx.me",
  "nn.nf",
  "notlong.com",
  "nov.io",
  "nq.st",
  "nsfw.in",
  "nurl.ng",
  "nxy.in",
  "o-x.fr",
  "okok.fr",
  "om.ly",
  "oma.io",
  "once.ly",
  "onelink.me",
  "opn.to",
  "ou.af",
  "ou.gd",
  "oua.be",
  "ouo.io",
  "ow.ly",
  "owl.li",
  "oyushold.com",
  "p.pw",
  "para.pt",
  "parky.tv",
  "past.is",
  "pd.am",
  "pdh.co",
  "ph.dog",
  "ph.ly",
  "pic.gd",
  "pich.in",
  "pin.st",
  "ping.fm",
  "piurl.com",
  "plots.fr",
  "plu.sh",
  "pnt.me",
  "po.do",
  "po.st",
  "poprl.com",
  "post.ly",
  "posted.at",
  "ppfr.it",
  "ppst.me",
  "ppt.cc",
  "ppt.li",
  "prejit.cz",
  "pretty.link",
  "profile.to",
  "pros.ee",
  "ptab.it",
  "ptm.ro",
  "pw2.ro",
  "pxlme.me",
  "py6.ru",
  "q.gs",
  "qbn.ru",
  "qicute.com",
  "qlnk.net",
  "qqc.co",
  "qr.ae",
  "qr.net",
  "qr2.info",
  "qr2.mobi",
  "qrbridge.co",
  "qrbridge.me",
  "qrly.me",
  "qrs.ly",
  "qrtag.fr",
  "qrto.co",
  "qrto.info",
  "qrto.mobi",
  "quip-art.com",
  "qxp.cz",
  "qxp.sk",
  "rb6.co",
  "rb6.me",
  "rcknr.io",
  "rdz.me",
  "rebrand.ly",
  "redir.ec",
  "redir.fr",
  "redirx.com",
  "redu.it",
  "ref.so",
  "reise.lc",
  "relink.fr",
  "ri.ms",
  "rickroll.it",
  "riz.cz",
  "riz.gd",
  "rod.gs",
  "roflc.at",
  "rsmonkey.com",
  "rt.se",
  "rt.tc",
  "ru.ly",
  "rubyurl.com",
  "s-url.fr",
  "s.id",
  "s7y.us",
  "safe.mn",
  "sagyap.tk",
  "sdu.sk",
  "seeme.at",
  "segue.se",
  "sh.st",
  "shar.as",
  "sharein.com",
  "sharetabs.com",
  "shorl.com",
  "short.cc",
  "short.cm",
  "short.ie",
  "short.ly",
  "short.nr",
  "short.pk",
  "short.to",
  "shortcm.li",
  "shorte.st",
  "shortlinks.co.uk",
  "shortna.me",
  "shorturl.com",
  "shoturl.us",
  "shrinkee.com",
  "shrinkify.com",
  "shrinkster.com",
  "shrinkurl.in",
  "shrt.in",
  "shrt.st",
  "shrten.com",
  "shrtm.nu",
  "shrunkin.com",
  "shw.me",
  "shy.si",
  "sicax.net",
  "simurl.com",
  "sina.lt",
  "sk.gy",
  "skr.sk",
  "skroc.pl",
  "sku.su",
  "smarturl.it",
  "smll.co",
  "sn.im",
  "sn.vc",
  "snip.ly",
  "snipr.com",
  "snipurl.com",
  "snsw.us",
  "snurl.com",
  "soo.gd",
  "sp2.ro",
  "spedr.com",
  "splt.cc",
  "spn.sr",
  "sptfy.com",
  "sqiz.me",
  "sq6.ru",
  "sqrl.it",
  "srtz.co",
  "ss.st",
  "ssl.gs",
  "starturl.com",
  "sturly.com",
  "su.pr",
  "suo.im",
  "surl.me",
  "sux.cz",
  "sy.pe",
  "t.cn",
  "t.co",
  "t2m.io",
  "ta.gd",
  "tabzi.com",
  "tau.pe",
  "tcrn.ch",
  "tdjt.cz",
  "thesa.us",
  "thinfi.com",
  "thrdl.es",
  "tighturl.com",
  "tin.li",
  "tini.cc",
  "tiny.cc",
  "tiny.ie",
  "tiny.io",
  "tiny.lt",
  "tiny.ms",
  "tiny.pl",
  "tiny123.com",
  "tinyarro.ws",
  "tinypic.com",
  "tinytw.it",
  "tinyuri.ca",
  "tinyurl.com",
  "tinyurl.hu",
  "tinyvid.io",
  "tixsu.com",
  "tldr.sk",
  "tldrify.com",
  "tllg.net",
  "tnij.org",
  "tny.cz",
  "tny.im",
  "to.ly",
  "to8.cc",
  "togoto.us",
  "tpmr.com",
  "tr.im",
  "tr.my",
  "tr5.in",
  "traceurl.com",
  "trakqr.com",
  "trck.me",
  "tri.ps",
  "trick.ly",
  "trkr.ws",
  "trunc.it",
  "turo.us",
  "tweetburner.com",
  "twet.fr",
  "twi.im",
  "twirl.at",
  "twit.ac",
  "twitterpan.com",
  "twitthis.com",
  "twiturl.de",
  "twlr.me",
  "twurl.cc",
  "twurl.nl",
  "u.nu",
  "u.to",
  "u6e.de",
  "ub0.cc",
  "uby.es",
  "ucam.me",
  "ug.cz",
  "ulmt.in",
  "unlc.us",
  "updating.me",
  "upzat.com",
  "uqr.me",
  "uqr.to",
  "ur1.ca",
  "url.co.uk",
  "url.ie",
  "url2.fr",
  "url2it.com",
  "url4.eu",
  "url5.org",
  "urlao.com",
  "urlbrief.com",
  "urlcover.com",
  "urlcut.com",
  "urlenco.de",
  "urlhawk.com",
  "urlin.it",
  "urlkiss.com",
  "urlkr.com",
  "urlot.com",
  "urlpire.com",
  "urls.fr",
  "urlshortbot.com",
  "urlx.ie",
  "urlx.org",
  "urlz.fr",
  "urlzen.com",
  "urnic.com",
  "urub.us",
  "utfg.sk",
  "utm.io",
  "v-os.net",
  "v.gd",
  "v.ht",
  "v.ly",
  "v5.gd",
  "vaaa.fr",
  "valv.im",
  "vaza.me",
  "vbly.us",
  "vd55.com",
  "verd.in",
  "vgn.me",
  "virl.com",
  "vl.am",
  "vov.li",
  "vsll.eu",
  "vt802.us",
  "vur.me",
  "vv.vg",
  "vzt.me",
  "w1p.fr",
  "w3t.org",
  "waa.ai",
  "wapurl.co.uk",
  "wb1.eu",
  "wb2.biz",
  "web99.eu",
  "webwecan.net",
  "wed.li",
  "wideo.fr",
  "wipi.es",
  "wntdco.mx",
  "wp.me",
  "wpu.ir",
  "wq.lt",
  "wtc.la",
  "wtfthis.me",
  "wu.cz",
  "ww7.fr",
  "www.bitmark.me  ",
  "wwy.me",
  "x.co",
  "x.co.in",
  "x.co.za",
  "x.nu",
  "x.se",
  "x10.mx",
  "x2c.eu",
  "xaddr.com",
  "xav.cc",
  "xc.pl",
  "xeeurl.com",
  "xgd.in",
  "xib.me",
  "xl8.eu",
  "xoe.cz",
  "xr.com",
  "xrl.in",
  "xrl.us",
  "xt3.me",
  "xua.me",
  "xub.me",
  "xurl.jp",
  "xurls.co",
  "xzb.cc",
  "y2u.be",
  "yagoa.fr",
  "yagoa.me",
  "yau.sh",
  "yaythis.me",
  "yeca.eu",
  "yect.com",
  "yep.it",
  "yerl.org",
  "yfrog.com",
  "yogh.me",
  "yon.ir",
  "youfap.me",
  "yourcodeiss.com",
  "youtu.be",
  "ysear.ch",
  "ytbe.co",
  "yweb.com",
  "yyv.co",
  "z9.fr",
  "zapit.nu",
  "zeek.ir",
  "zi.ma",
  "zi.pe",
  "zii.bz",
  "zip.net",
  "zip.pe",
  "zipansion.com",
  "zipmyurl.com",
  "zkr.cz",
  "zkrat.me",
  "zkrt.cz",
  "zoodl.com",
  "zpag.es",
  "zsms.net",
  "zst.io",
  "zti.me",
  "zxq.net",
  "zyva.org",
  "zz.gd",
  "zzb.bz",
]);

app.post("/api/shorten", requireAuth, async (c) => {
  const body = (await c.req.json()) as { longUrl?: string };
  if (!body.longUrl) {
    return c.json({ error: "Long URL is required" }, 400);
  }

  try {
    const url = new URL(body.longUrl);
    if (BLOCKED_DOMAINS.has(url.hostname)) {
      return c.json({ error: "Redirection loops are not allowed" }, 400);
    }
  } catch {
    return c.json({ error: "Invalid long URL format" }, 400);
  }

  // Get current user from session
  const sessionId = getCookie(c, "session_id");
  const session = await c.env.DB.prepare(
    "SELECT username FROM sessions WHERE id = ?",
  )
    .bind(sessionId)
    .first<{ username: string }>();

  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const shortCode = nanoid(8);
  const id = crypto.randomUUID();

  try {
    await c.env.DB.prepare(
      "INSERT INTO short_urls (id, long_url, short_code, user_id) VALUES (?, ?, ?, ?)",
    )
      .bind(id, body.longUrl, shortCode, session.username)
      .run();

    const shortUrl = `https://dev.involvex.workers.dev/url=${shortCode}`;
    return c.json({ shortUrl, shortCode, originalUrl: body.longUrl });
  } catch {
    return c.json({ error: "Failed to create short URL" }, 500);
  }
});

app.get("/api/history", requireAuth, async (c) => {
  // Get current user
  const sessionId = getCookie(c, "session_id");
  const session = await c.env.DB.prepare(
    "SELECT username FROM sessions WHERE id = ?",
  )
    .bind(sessionId)
    .first<{ username: string }>();

  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const history = await c.env.DB.prepare(
    "SELECT * FROM short_urls WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(session.username)
    .all();

  return c.json({ history: history.results });
});

// Public Redirect Route
// Catch any request and check if it matches the /url= pattern manually
// This is the most reliable way to avoid conflicts with Hono's route parsing
app.get("*", async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/url=")) {
    const code = path.substring(5); // Remove "/url="
    console.log("Redirecting code from wildcard:", code);

    const entry = await c.env.DB.prepare(
      "SELECT long_url FROM short_urls WHERE short_code = ?",
    )
      .bind(code)
      .first<{ long_url: string }>();

    if (entry) {
      return c.redirect(entry.long_url);
    }
    return c.text("Short URL not found", 404);
  }
  return next();
});

// SSR react-router - catch everything else
app.get("*", (c) => {
  const requestHandler = createRequestHandler(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - virtual module
    () => import("virtual:react-router/server-build"),
    import.meta.env.MODE,
  );

  return requestHandler(c.req.raw, {
    cloudflare: { env: c.env, ctx: c.executionCtx },
  });
});

export default app;
