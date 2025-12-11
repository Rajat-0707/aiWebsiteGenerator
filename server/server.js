// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// CORS: prefer configuring allowed origin via env in production
const corsOrigin = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: corsOrigin, credentials: true }));

// Basic rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX || "30", 10), // 30 req / minute by default
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ---- Provider SDK import note ----
// The original used: import { GoogleGenerativeAI } from "@google/generative-ai";
// SDK constructors and response shapes vary. If your SDK expects a different
// constructor signature (e.g. { apiKey: ... } or new GoogleGenerativeAI({ apiKey })),
// update the instantiation below accordingly.
import { GoogleGenerativeAI } from "@google/generative-ai";

const { GEMINI_API_KEY } = process.env;
if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

// instantiate provider client - adapt if SDK signature differs
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ---- Helpers ----
const clamp = (s = "", n = 2000) => (s.length > n ? s.slice(0, n) : s);

const stripFences = (s = "") => {
  // remove fenced blocks like ```html ... ``` and any stray backticks, but preserve code content
  return s
    .replace(/^\s*```(?:[a-zA-Z0-9_-]+)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/`{3,}/g, "")
    .trim();
};

const escapeHtmlAttr = (s = "") =>
  s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const toKebab = (s = "") =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const ensureFullDoc = (html = "", spec = {}) => {
  const hasHtml = /<\s*html[\s>]/i.test(html) || /<!doctype html>/i.test(html);
  if (hasHtml) return html;
  const title = escapeHtmlAttr((spec.seo?.title || spec.projectName || "Website").toString());
  const description = escapeHtmlAttr((spec.seo?.description || spec.brief || "").toString());
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="${description}"/>
<link rel="canonical" href="${escapeHtmlAttr(spec.canonical || "")}"/>
<!-- Open Graph minimal -->
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${description}"/>
<meta property="og:type" content="website"/>
<script type="application/ld+json">
${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: spec.projectName || "Website",
  })}
</script>
</head>
<body>${html}</body>
</html>`;
};

// safe model response extractor (tries several common shapes)
const extractTextFromModelResult = async (result) => {
  if (!result) return "";
  // if SDK provides a .response.text() method returning a promise or string
  try {
    if (result.response && typeof result.response.text === "function") {
      const r = result.response.text();
      if (r instanceof Promise) return await r;
      return r;
    }
  } catch (e) {
    // continue to other patterns
  }

  // common alternative payload shapes:
  if (typeof result.response?.output_text === "string") return result.response.output_text;
  if (typeof result.output_text === "string") return result.output_text;

  // array outputs: [{ content: [{ type: "output_text", text: "..." }] }]
  try {
    const out = result.response?.output ?? result.output ?? null;
    if (Array.isArray(out)) {
      // find any text content
      for (const item of out) {
        if (item?.content) {
          for (const c of item.content) {
            if (c?.type?.includes("output_text") && c?.text) return c.text;
            if (c?.text) return c.text;
          }
        }
        if (typeof item === "string") return item;
      }
    }
  } catch (e) {
    // swallow
  }

  // fallback: JSON stringify small fallback
  return typeof result === "string" ? result : JSON.stringify(result).slice(0, 10000);
};

// timeout helper for promises
const withTimeout = (p, ms = 120000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// ---- Route ----
app.post("/api/generate", async (req, res) => {
  try {
    const { spec } = req.body || {};
    if (!spec?.brief) {
      return res.status(400).json({ error: "spec.brief is required" });
    }

    // sanitize / normalize
    const safe = {
      projectName: String(spec.projectName || "Website").slice(0, 200),
      brief: clamp(String(spec.brief || ""), 4000),
      primaryColor: String(spec.primaryColor || "#4f46e5").slice(0, 20),
      style: String(spec.style || "modern, clean").slice(0, 200),
      tone: String(spec.tone || "professional").slice(0, 200),
      pages: Array.isArray(spec.pages)
        ? spec.pages.map((p) => toKebab(String(p))).filter(Boolean)
        : [],
    };

    // ensure at least one page (Home)
    if (!safe.pages.includes("home")) safe.pages.unshift("home");

    // create the prompt (shorten brief if too long)
    const prompt = `
You are a senior frontend engineer and UX designer. Generate a production-quality, fully responsive, single-file website with:
- Strictly ONE complete HTML document. No markdown. No code fences.
- strictly write whole css in the HTML document, either use inline or internal css
- Vanilla JavaScript only inside a single <script> tag near the end of <body>. No external libraries.
- don't give href="#" in anchor tag, give class name instead

Requirements:
- Structure: semantic sections (<header>, <nav>, <main>, <section>, <footer>), one section per page: ${safe.pages.join(
      ", "
    )}. Give each section an id matching its page name (kebab-case). Include a hero on Home.
- Navigation: sticky top nav with links that smooth-scroll to sections; active link highlighting on scroll; mobile menu with hamburger toggle.
- Styling: use CSS variables, set --primary to ${safe.primaryColor}. Apply a modern ${safe.style} look and a ${safe.tone} tone. Respect prefers-color-scheme; provide light/dark theme toggle.
- Layout: fluid, mobile-first grid; accessible color contrast; focus outlines; skip-to-content link.
- Interactivity: implement smooth-scroll, section active state, back-to-top button, simple tabs OR carousel component, and a basic contact form with client-side validation (no network calls). Persist theme choice in localStorage.
- Assets: do not load external fonts/images. Use system font stack. For images, use placeholder SVGs or gradients inline.
- Content: craft meaningful, concise copy aligned with the brief and project name.
- SEO: include <title>, meta description, canonical (self), Open Graph, and JSON-LD Organization schema with ${safe.projectName}.
- Performance: avoid heavy box-shadows; keep CSS minimal; avoid oversized DOM; no animations that harm motion-sensitive users; respect prefers-reduced-motion.
- Accessibility: ARIA where needed; labels for inputs; reachable with keyboard; alt text for decorative placeholders can be empty.

Input context:
- Project: ${safe.projectName}
- Brief: ${safe.brief}
- Pages: ${safe.pages.join(", ")}

Output:
- Return ONLY the final HTML string for a complete document (<!doctype html> ... </html>), nothing else.
`.trim();

    // Models to try (you had these; keep order)
    const modelIds = ["gemini-2.0-flash-exp", "gemini-2.0-flash", "gemini-1.5-flash"];

    let html = "";
    let lastErr = null;
    const tried = [];

    for (const id of modelIds) {
      tried.push(id);
      try {
        // NOTE: adjust usage to your SDK. This is defensive and generic.
        const model = genAI.getGenerativeModel ? genAI.getGenerativeModel({ model: id }) : genAI;

        // If the SDK expects a generate() or generateContent() adjust accordingly.
        // Wrap with timeout to avoid long/hung requests.
        const generatePromise =
          typeof model.generateContent === "function"
            ? model.generateContent(prompt)
            : typeof model.generate === "function"
            ? model.generate({ prompt })
            : model.call
            ? model.call(prompt)
            : Promise.reject(new Error("No known generate method on model instance"));

        const result = await withTimeout(generatePromise, parseInt(process.env.MODEL_TIMEOUT_MS || "110000", 10));
        const text = await extractTextFromModelResult(result);

        if (!text || text.trim().length < 20) {
          lastErr = new Error("Empty or too short model output");
          continue;
        }

        html = ensureFullDoc(stripFences(text), spec);
        if (html && html.length > 50) break;
      } catch (e) {
        lastErr = e;
        // log and continue to next model id
        console.warn(`Model ${id} error:`, e.message || e);
      }
    }

    if (!html || html.length < 20) {
      return res.status(502).json({ error: "Model did not return usable HTML", details: lastErr?.message, tried });
    }

    // offer base64 data URL for quick download (warning: can be large)
    const downloadUrl = "data:text/html;base64," + Buffer.from(html, "utf8").toString("base64");

    return res.json({ html, downloadUrl });
  } catch (err) {
    console.error("BACKEND ERROR:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
