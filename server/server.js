import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config();

const app = express();



const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://ai-website-generator-7od2ogz0h-rajat-0707s-projects.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("/api/*", cors());


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

/* =======================
   OpenRouter call
   ======================= */

async function callOpenRouter({ model, prompt }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://aiwebsitegenerator.onrender.com",
      "X-Title": "AI Website Generator",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 2500,
    }),
  });

  const raw = await res.text();

  if (!res.ok) {
    console.error("OPENROUTER ERROR:", raw);
    throw new Error(raw);
  }

  const data = JSON.parse(raw);
  return data?.choices?.[0]?.message?.content || "";
}

/* =======================
   Route
   ======================= */

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
You are a senior frontend engineer and UX designer. Generate a production-quality, fully responsive, single-file website.

Return ONLY valid HTML.
`;

    let html = "";
    let lastErr;
    const tried = [];

    const modelIds = [
      "mistralai/devstral-2512:free",
      "nvidia/nemotron-3-nano-30b-a3b:free",
      "nex-agi/deepseek-v3.1-nex-n1:free",
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
    res.status(500).json({ error: err.message });
  }
});

/* =======================
   Server
   ======================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
