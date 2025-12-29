import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const { OPENROUTER_API_KEY } = process.env;

if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY in .env");
  process.exit(1);
}


const stripFences = (s = "") =>
  s
    .trim()
    .replace(/^```(html)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

const ensureFullDoc = (html = "", spec = {}) => {
  const hasHtml =
    /<\s*html[\s>]/i.test(html) || /<!doctype html>/i.test(html);

  if (hasHtml) return html;

  const title = (spec.projectName || "Website").toString();
  const safeTitle = title.replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m])
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
</head>
<body>
${html}
</body>
</html>`;
};


async function callOpenRouter({ model, prompt }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5000", // optional but recommended
      "X-Title": "AI Website Generator",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.4,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error: ${errText}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}


app.post("/api/generate", async (req, res) => {
  try {
    const { spec } = req.body || {};

    if (!spec?.brief) {
      return res.status(400).json({ error: "spec.brief is required" });
    }

    const safe = {
      projectName: spec.projectName || "Website",
      brief: spec.brief || "",
      primaryColor: spec.primaryColor || "#4f46e5",
      style: spec.style || "modern, clean",
      tone: spec.tone || "professional",
      pages: Array.isArray(spec.pages) ? spec.pages : [],
    };

    const prompt = `
You are a senior frontend engineer and UX designer. Generate a production-quality, fully responsive, single-file website with:

Strictly ONE complete HTML document. No markdown. No code fences.
- strictly write whole css in the HTML document , either use inline or internal css

Vanilla JavaScript only inside a single <script> tag near the end of <body>. No external libraries.

dont give href="#" in anchor tag, give class name instead

Requirements:

Structure: semantic sections (<header>, <nav>, <main>, <section>, <footer>), one section per page: ${safe.pages.join(
      ", "
    )}. Give each section an id matching its page name (kebab-case). Include a hero on Home.

Navigation: sticky top nav with links that smooth-scroll to sections; active link highlighting on scroll; mobile menu with hamburger toggle.

Styling: use CSS variables, set --primary to ${safe.primaryColor}. Apply a modern ${safe.style} look and a ${safe.tone} tone. Respect prefers-color-scheme; provide light/dark theme toggle.

Layout: fluid, mobile-first grid; accessible color contrast; focus outlines; skip-to-content link.

Interactivity: implement smooth-scroll, section active state, back-to-top button, simple tabs OR carousel component, and a basic contact form with client-side validation (no network calls). Persist theme choice in localStorage.

Assets: do not load external fonts/images. Use system font stack. For images, use placeholder SVGs or gradients inline.

Content: craft meaningful, concise copy aligned with the brief and project name.

SEO: include <title>, meta description, canonical (self), Open Graph, and JSON-LD Organization schema with ${safe.projectName}.

Performance: avoid heavy box-shadows; keep CSS minimal; avoid oversized DOM; no animations that harm motion-sensitive users; respect prefers-reduced-motion.

Accessibility: ARIA where needed; labels for inputs; reachable with keyboard; alt text for decorative placeholders can be empty.

Input context:

Project: ${safe.projectName}
Brief: ${safe.brief}
Pages: ${safe.pages.join(", ")}

Output:
Return ONLY the final HTML string for a complete document (<!doctype html> ... </html>), nothing else.
`;

    let html = "";
    let lastErr;
    const tried = [];

    const modelIds = [
      "x-ai/grok-code-fast-1",
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
      "deepseek/deepseek-chat",
    ];

    for (const model of modelIds) {
      try {
        const text = await callOpenRouter({ model, prompt });
        html = ensureFullDoc(stripFences(text), spec);

        if (html && html.length > 50) break;
      } catch (e) {
        lastErr = e;
      } finally {
        tried.push(model);
      }
    }

    if (!html || html.length < 20) {
      return res.status(502).json({
        error: "Model did not return usable HTML",
        details: lastErr?.message,
        tried,
      });
    }

    const downloadUrl =
      "data:text/html;base64," +
      Buffer.from(html, "utf8").toString("base64");

    return res.json({ html, downloadUrl });
  } catch (err) {
    console.error("BACKEND ERROR:", err);
    res.status(500).json({
      error: err.message || "Internal Server Error",
    });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
