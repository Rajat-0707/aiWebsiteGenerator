import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

import "./App.css";
import axios from "axios";



const DEFAULT_PAGES = ["Home", "About", "Services", "Blog", "Contact", "FAQ", "Pricing"];

const DEFAULT_TEMPLATES = [
  { id: "clean-landing", name: "Clean Landing", tagline: "Minimal hero + feature grid" },
  { id: "corporate-site", name: "Corporate Site", tagline: "Multi-page, classic" },
  { id: "portfolio", name: "Portfolio", tagline: "Cases and gallery" },
  { id: "saas", name: "SaaS", tagline: "Pricing tiers + CTA" },
];

const emptySpec = {
  projectName: "Untitled Project",
  brief: "",
  provider: "chatgpt",
  apiKeyAlias: "",
  templateId: DEFAULT_TEMPLATES[0].id,
  layout: "landing",
  style: "minimal",
  theme: "light",
  primaryColor: "#2f6feb",
  pages: DEFAULT_PAGES,
  include: {
    cms: false,
    auth: false,
    contactForm: true,
    newsletter: true,
    analytics: true,
    imageGen: false,
  },
  seo: { title: "", description: "", keywords: "" },
  tone: "neutral",
};

const STORAGE_KEYS = {
  spec: "aiwm/spec",
  history: "aiwm/history",
  theme: "aiwm/theme",
};

function kebab(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
const safeLocalStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      console.error("localStorage.getItem failed:", err);
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.error("localStorage.setItem failed:", err);
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error("localStorage.removeItem failed:", err);
    }
  },
};
const safeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function adjustColor(color, amount) {
  try {
    const clamp = (val) => Math.min(Math.max(val, 0), 255);
    const num = parseInt(color.replace("#", ""), 16);
    const r = clamp((num >> 16) + amount);
    const g = clamp(((num >> 8) & 0x00ff) + amount);
    const b = clamp((num & 0x0000ff) + amount);
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  } catch {
    return color;
  }
}

function generateMockHTML(spec) {
  const styleMap = {
    minimal: { font: "'Inter', sans-serif", bg: "#ffffff", text: "#1a202c", accent: spec.primaryColor || "#6366f1" },
    corporate: { font: "'Georgia', serif", bg: "#f8f9fa", text: "#2d3748", accent: spec.primaryColor || "#2563eb" },
    playful: { font: "'Comic Sans MS', cursive", bg: "#fff5f7", text: "#1a1a1a", accent: spec.primaryColor || "#ec4899" },
  };
  const style = styleMap[spec.style] || styleMap.minimal;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(spec.seo.title || spec.projectName)}</title>
  <meta name="description" content="${escapeHtml(spec.seo.description || spec.brief)}"/>
  ${spec.seo.keywords ? `<meta name="keywords" content="${escapeHtml(spec.seo.keywords)}"/>` : ""}
  <style>
    *{box-sizing:border-box} body{margin:0;font-family:${style.font};background:${style.bg};color:${style.text};line-height:1.6}
    .container{max-width:1200px;margin:0 auto;padding:20px}
    header{background:linear-gradient(135deg, ${style.accent}, ${adjustColor(style.accent, -20)});color:#fff;padding:60px 20px;text-align:center}
    h1{font-size:3em;margin:0 0 10px}
    .tagline{font-size:1.2em;opacity:.95}
    nav{position:sticky;top:0;background:${adjustColor(style.bg,-10)};padding:12px 0;box-shadow:0 2px 10px rgba(0,0,0,0.08);z-index:10}
    nav ul{list-style:none;display:flex;gap:24px;justify-content:center;margin:0;padding:0;flex-wrap:wrap}
    nav a{text-decoration:none;color:${style.text};font-weight:600}
    nav a:hover{color:${style.accent}}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;margin:40px 0}
    .card{background:#fff;border-radius:14px;padding:20px;border-top:4px solid ${style.accent};box-shadow:0 6px 16px rgba(0,0,0,.08)}
    .card h3{margin:0 0 8px;color:${style.accent}}
    .cta{background:${style.accent};color:#fff;border:none;border-radius:999px;padding:12px 24px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block;margin:10px}
    .cta:hover{background:${adjustColor(style.accent,-20)}}
    footer{background:${adjustColor(style.bg,-12)};padding:30px 20px;text-align:center;margin-top:40px;border-top:3px solid ${style.accent}}
    @media (max-width:768px){h1{font-size:2em}}
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(spec.projectName)}</h1>
    <p class="tagline">${escapeHtml(spec.brief || "AI Generated Website")}</p>
    <div style="margin-top:18px">
      <a href="#features" class="cta">Explore Features</a>
      <a href="#contact" class="cta" style="background:#fff;color:${style.accent}">Get in Touch</a>
    </div>
  </header>
  <nav><ul>${spec.pages.map(p => `<li><a href="#${kebab(p)}">${escapeHtml(p)}</a></li>`).join("")}</ul></nav>
  <div class="container">
    <section id="features">
      <div class="grid">
        ${spec.pages.slice(0, 6).map(p => `
          <div class="card">
            <h3>${escapeHtml(p)}</h3>
            <p>Autogenerated content for the ${escapeHtml(p)} section.</p>
            ${spec.include.cms ? '<span style="font-size:.85em;opacity:.8">CMS ready</span>' : ''}
          </div>`).join("")}
      </div>
    </section>
    ${spec.include.contactForm ? `
      <section id="contact" class="card" style="padding:30px;border-radius:16px">
        <h3 style="margin-top:0;color:${style.accent}">Contact Us</h3>
        <form onsubmit="event.preventDefault(); alert('Thanks!');">
          <input placeholder="Your name" style="width:100%;padding:12px;border-radius:10px;border:1px solid #ddd;margin:8px 0"/>
          <input type="email" placeholder="Email" style="width:100%;padding:12px;border-radius:10px;border:1px solid #ddd;margin:8px 0"/>
          <textarea placeholder="Message" rows="4" style="width:100%;padding:12px;border-radius:10px;border:1px solid #ddd;margin:8px 0"></textarea>
          <button class="cta" type="submit">Send</button>
        </form>
      </section>` : ""}
  </div>
  <footer>
    <div>&copy; ${new Date().getFullYear()} ${escapeHtml(spec.projectName)}</div>
    <div style="opacity:.7;margin-top:8px">${escapeHtml(spec.provider.toUpperCase())} • ${escapeHtml(spec.layout)} • ${escapeHtml(spec.style)} • ${escapeHtml(spec.tone)}</div>
  </footer>
</body>
</html>`;
}

export default function App() {
   const lightRef = useRef(null);
const darkRef = useRef(null);



 const handleClick = () => {
  lightRef.current.style.background = "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)";
  lightRef.current.style.color = "white";
  darkRef.current.style.color = "#1a202c;";
    darkRef.current.style.backgroundColor = "#f9f9f9";
    darkRef.current.style.background="none";
  
};

const handleDarkClick = () => {
  darkRef.current.style.background = "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)";
  darkRef.current.style.color = "white";
  lightRef.current.style.color = "#1a202c";
    lightRef.current.style.backgroundColor = "#f9f9f9";
    lightRef.current.style.background="none";
  
};

  const [spec, setSpec] = useState(() => {
    const saved = safeLocalStorage.getItem(STORAGE_KEYS.spec);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return emptySpec;
      }
    }
    return emptySpec;
  });

  const [theme, setTheme] = useState(() => safeLocalStorage.getItem(STORAGE_KEYS.theme) || spec.theme || "light");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [preview, setPreview] = useState("");
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [historyTrigger, setHistoryTrigger] = useState(0);
  const [iframeKey, setIframeKey] = useState(0); 

  const briefRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    safeLocalStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.spec, JSON.stringify(spec));
  }, [spec]);

  const notify = useCallback((msg, kind = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  }, []);

  const download = useCallback((filename, content, type = "text/plain") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const pushHistory = useCallback((html, specSnapshot) => {
    const item = {
      id: safeId(),
      spec: { ...specSnapshot },
      createdAt: Date.now(),
      htmlSnippet: html,
    };
    const saved = safeLocalStorage.getItem(STORAGE_KEYS.history);
    const history = saved ? JSON.parse(saved) : [];
    safeLocalStorage.setItem(STORAGE_KEYS.history, JSON.stringify([item, ...history].slice(0, 20)));
    setHistoryTrigger((p) => p + 1);
  }, []);

  const loadIntoPreview = useCallback((html) => {
    if (!html || typeof html !== "string" || !html.trim()) {
      notify("No HTML found for this item.", "warn");
      return;
    }
    setPreview(html);
    setIframeKey((k) => k + 1);
  }, [notify]);

  const onGenerate = useCallback(async () => {
    if (!spec.brief.trim()) {
      return notify("Please add a short brief (1–2 lines).", "warn");
    }

    setBusy(true);
      try {
      const apiUrl = import.meta.env.VITE_API_URL || "/api/generate";
      const res = await axios.post(`${apiUrl}/api/generate`, { spec }, { validateStatus: () => true });

      if (res.status >= 200 && res.status < 300 && res.data?.html) {
        const html = String(res.data.html);
        loadIntoPreview(html);
        setDownloadUrl(res.data.downloadUrl || null);

        if (!res.data.downloadUrl) {
          const blob = new Blob([html], { type: "text/html" });
          setDownloadUrl(URL.createObjectURL(blob));
        }

        pushHistory(html, spec);
        notify("Preview updated via API.", "success");
      } else {
        const mockHtml = generateMockHTML(spec);
        loadIntoPreview(mockHtml);

        const blob = new Blob([mockHtml], { type: "text/html" });
        setDownloadUrl(URL.createObjectURL(blob));

        pushHistory(mockHtml, spec);
        notify("Backend unavailable. Loaded demo preview.", "warn");
      }
    } catch (err) {
      const mockHtml = generateMockHTML(spec);
      loadIntoPreview(mockHtml);

      const blob = new Blob([mockHtml], { type: "text/html" });
      setDownloadUrl(URL.createObjectURL(blob));

      pushHistory(mockHtml, spec);
      notify("Generation failed. Showing demo preview.", "warn");
    } finally {
      setBusy(false);
    }
  }, [spec, notify, loadIntoPreview, pushHistory]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        briefRef.current?.focus();
      }
      if (e.key.toLowerCase() === "g" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onGenerate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onGenerate]);

  const onTemplatePick = (id) => setSpec((s) => ({ ...s, templateId: id }));
  const onTogglePage = (page) =>
    setSpec((s) => ({
      ...s,
      pages: s.pages.includes(page) ? s.pages.filter((p) => p !== page) : [...s.pages, page],
    }));
  const onToggleInclude = (k) =>
    setSpec((s) => ({
      ...s,
      include: { ...s.include, [k]: !s.include[k] },
    }));

  const exportSpec = () => download(`${kebab(spec.projectName)}-spec.json`, JSON.stringify(spec, null, 2), "application/json");
  const exportHTML = () => {
    if (!preview) return notify("Nothing to export yet — click Generate first.", "warn");
    download(`${kebab(spec.projectName)}-preview.html`, preview, "text/html");
  };

  const history = useMemo(() => {
    const saved = safeLocalStorage.getItem(STORAGE_KEYS.history);
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, [historyTrigger]);

  const clearHistory = () => {
    safeLocalStorage.removeItem(STORAGE_KEYS.history);
    setHistoryTrigger((p) => p + 1);
    notify("History cleared.");
  };

  return (
    <div className="app">
      <TopBar theme={theme} setTheme={setTheme} />

      <main className="layout">
        <aside className="panel">
          <section className="block">
            <label className="label">Project name</label>
            <input
              className="input"
              value={spec.projectName}
              onChange={(e) => setSpec({ ...spec, projectName: e.target.value })}
              placeholder="e.g. My Portfolio"
              maxLength={60}
            />
          </section>

          <section className="block">
            <label className="label">
               Brief 
              
            </label>
            <textarea
              ref={briefRef}
              className="textarea"
              value={spec.brief}
              onChange={(e) => setSpec({ ...spec, brief: e.target.value })}
              rows={4}
              placeholder="A modern clinic website with appointment booking, doctor profiles, and health articles."
            />
          </section>

          <section className="grid-2 block">
            <div>
              <label className="label">Layout</label>
              <select className="input" value={spec.layout} onChange={(e) => setSpec({ ...spec, layout: e.target.value })}>
                <option value="landing">Landing Page</option>
                <option value="multipage">Multi-page</option>
                <option value="onepage">One Page</option>
              </select>
            </div>
            <div>
              <label className="label">Style</label>
              <select className="input" value={spec.style} onChange={(e) => setSpec({ ...spec, style: e.target.value })}>
                <option value="minimal">Minimal</option>
                <option value="corporate">Corporate</option>
                <option value="playful">Playful</option>
              </select>
            </div>
          </section>

          <section className="grid-2 block">
            <div>
              <label className="label">Theme</label>
              <div className="seg">
                <button  
                  ref={lightRef} 
                  className="bhn"
                  onClick={() => {
                    handleClick();
                    setSpec((s) => ({ ...s, theme: "light" }));
                  }}
                >
                  Light
                </button>
                <button ref={darkRef} 
                 className="bhn"
                  onClick={() => {
                   handleDarkClick();
                    setSpec((s) => ({ ...s, theme: "dark" }));
                  }}
                >
                  Dark
                </button>
              </div>
            </div>
            <div>
              <label className="label">Primary color</label>
              <input className="input color" type="color" value={spec.primaryColor} onChange={(e) => setSpec({ ...spec, primaryColor: e.target.value })} />
            </div>
          </section>

          <section className="block">
            <label className="label">Pages</label>
            <div className="chips">
              {DEFAULT_PAGES.map((p) => (
                <button key={p} className={`chip ${spec.pages.includes(p) ? "selected" : ""}`} onClick={() => onTogglePage(p)}>
                  {p}
                </button>
              ))}
            </div>
          </section>

          <section className="block grid-2">
            <div>
              <label className="label">Tone</label>
              <select className="input" value={spec.tone} onChange={(e) => setSpec({ ...spec, tone: e.target.value })}>
                <option value="neutral">Neutral</option>
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
                <option value="bold">Bold</option>
              </select>
              <label className="label">AI model</label>
              <select className="input" value={spec.model} onChange={(e) => setSpec({ ...spec, model: e.target.value })}>
                <option value="gemini">Gemini</option>
                <option value="chatgpt">ChatGPT</option>
                <option value="claude">Claude</option>
              </select>
            </div>
            <div>
              <label className="label">Include features</label>
              <div className="toggles">
                {[
                  ["cms", "CMS/Blog"],
                  ["auth", "Auth"],
                  ["contactForm", "Contact form"],
                  ["newsletter", "Newsletter"],
                  ["analytics", "Analytics"],
                  ["imageGen", "AI image gen"],
                ].map(([key, label]) => (
                  <label key={key} className="toggle">
                    <input type="checkbox" checked={spec.include[key]} onChange={() => onToggleInclude(key)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="block">
            <label className="label">SEO</label>
            <input
              className="input"
              placeholder="Site title"
              value={spec.seo.title}
              onChange={(e) => setSpec({ ...spec, seo: { ...spec.seo, title: e.target.value } })}
            />
            <input
              className="input"
              placeholder="Meta description"
              value={spec.seo.description}
              onChange={(e) => setSpec({ ...spec, seo: { ...spec.seo, description: e.target.value } })}
            />
            <input
              className="input"
              placeholder="Keywords (comma separated)"
              value={spec.seo.keywords}
              onChange={(e) => setSpec({ ...spec, seo: { ...spec.seo, keywords: e.target.value } })}
            />
          </section>

          <section className="block">
            <label className="label">Templates</label>
            <div className="templates">
              {DEFAULT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onTemplatePick(t.id)}
                  className={`template ${spec.templateId === t.id ? "selected" : ""}`}
                  title={t.tagline}
                >
                  <span className="t-name">{t.name}</span>
                  <span className="t-tag">{t.tagline}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="actions">
            <button className="btn primary" onClick={onGenerate} disabled={busy}>
              {busy ? "Generating…" : "Generate (Ctrl/Cmd + G)"}
            </button>
            <button className="btn" onClick={exportSpec}>Export Spec</button>
            <button className="btn" onClick={exportHTML}>Export HTML</button>
          </div>
        </aside>

        <section className="workspace">
          <div className="preview-toolbar">
            <h2 className="h2">Live preview</h2>
            <span className="muted">{spec.model}</span>
          </div>

          {downloadUrl && (
            <a className="btn primary" href={downloadUrl} download>
              ⬇️ Download Generated HTML
            </a>
          )}

          <div className="preview" style={{ borderColor: "var(--border)" }}>
            {busy ? (
              <div className="empty">
                <h3>Generating your website…</h3>
                <p className="muted">Please wait a moment</p>
              </div>
            ) : preview ? (
              <iframe key={iframeKey} title="preview" srcDoc={preview} className="iframe" />
            ) : (
              <EmptyState onGenerate={onGenerate} />
            )}
          </div>

          <div className="actions" style={{ marginTop: 12 }}>
            <button
              className="btn"
              disabled={busy || !preview}
              onClick={() => {
                const url = downloadUrl || URL.createObjectURL(new Blob([preview], { type: "text/html" }));
                const win = window.open(url, "_blank");
                if (!downloadUrl) setTimeout(() => URL.revokeObjectURL(url), 15000);
                if (!win || win.closed) {
                  const a = document.createElement("a");
                  a.href = url;
                  a.target = "_blank";
                  a.rel = "noopener";
                  a.click();
                }
              }}
            >
              Open Generated Site in New Tab
            </button>
          </div>

          <div className="history">
            <div className="history-head">
              <h3>Recent generations</h3>
              <button className="link" onClick={clearHistory}>Clear</button>
            </div>
            {history.length === 0 ? (
              <p className="muted">No generations yet.</p>
            ) : (
              <ul className="history-list">
                {history.map((h) => (
                  <li key={h.id} className="history-item">
                    <div>
                      <div className="history-title">{h.spec.projectName}</div>
                      <div className="history-meta">
                        {new Date(h.createdAt).toLocaleString()} • {h.spec.style} • {h.spec.layout}
                      </div>
                    </div>
                    <button className="btn sm" onClick={() => loadIntoPreview(h.htmlSnippet || h.html)}>
                      Load snippet
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      {toast && <Toast {...toast} />}
      <Footer />
    </div>
  );
}

function TopBar({ theme, setTheme }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-name">aiwebsitemaker</span>
        <span className="brand-badge">frontend</span>
      </div>
      <nav className="top-actions">
        <div className="sep" />
        <button className="btn sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "Light" : "Dark"} mode
        </button>
      </nav>
    </header>
  );
}

function EmptyState({ onGenerate }) {
  return (
    <div className="empty">
      <h3>Describe your website and click Generate</h3>
      <p className="muted"></p>
      <button className="btn primary" onClick={onGenerate}>Generate</button>
    </div>
  );
}

function Toast({ msg, kind }) {
  return <div className={`toast ${kind}`}>{msg}</div>;
}

function Footer() {
  return (
    <footer className="footer">
      <div className="muted">© {new Date().getFullYear()} aiwebsitemaker — UI only</div>
    </footer>
  );
}
