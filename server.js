import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

loadDotEnv();

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (url.pathname === "/api/ai-brief") {
      await handleAiBrief(request, response);
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message || "Server error" }));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Smart Booking Audit running at http://127.0.0.1:${port}/`);
});

async function handleAiBrief(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { Allow: "POST", "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const provider = getAiProvider();
  if (!provider) {
    response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "AI provider is not configured" }));
    return;
  }

  const body = await readRequestJson(request);
  const mode = body?.mode;
  if (!isAllowedMode(mode)) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Invalid mode" }));
    return;
  }

  const guardedPrompt = buildPrompt(mode, body.payload);

  const aiResponse = provider.name === "claude"
    ? await callClaude(provider.key, guardedPrompt)
    : await callGemini(provider.key, guardedPrompt);

  if (!aiResponse.ok) {
    response.writeHead(aiResponse.status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: `${provider.name} request failed` }));
    return;
  }

  const data = await aiResponse.json();
  const text = provider.name === "claude" ? extractClaudeText(data) : extractGeminiText(data);
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ provider: provider.name, model: provider.model, text }));
}

function getAiProvider() {
  if (process.env.CLAUDE_API_KEY) {
    return { name: "claude", key: process.env.CLAUDE_API_KEY, model: CLAUDE_MODEL };
  }
  if (process.env.GEMINI_API_KEY) {
    return { name: "gemini", key: process.env.GEMINI_API_KEY, model: "gemini-2.0-flash" };
  }
  return null;
}

function callClaude(apiKey, prompt) {
  return fetchWithRetry(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
}

function callGemini(apiKey, prompt) {
  return fetchWithRetry(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1200 }
    })
  });
}

function extractClaudeText(data) {
  return data?.content?.map((part) => part.text || "").join("\n").trim() || "";
}

function extractGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n").trim() || "";
}

async function fetchWithRetry(url, options, retries = 2, delay = 2000) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < retries - 1) {
      await wait(delay);
      continue;
    }
    return response;
  }
  return fetch(url, options);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function serveStatic(pathname, response) {
  if (pathname === "/") {
    const bytes = await readFile(join(root, "index.html"));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(bytes);
    return;
  }

  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const bytes = await readFile(filePath);
  response.writeHead(200, { "Content-Type": contentType(filePath) });
  response.end(bytes);
}

function contentType(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/plain; charset=utf-8"
  };
  return types[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function isAllowedMode(mode) {
  return mode === "executive" || mode === "spotlight";
}

function buildPrompt(mode, payload) {
  const safePayload = sanitizePayload(mode, payload);
  if (mode === "spotlight") {
    return [
    "You are an operations assistant for hotel booking QA.",
    "Use only supplied JSON-derived metrics and alerts. Do not invent data.",
    "Write in Thai.",
    "Return exactly 4 short sections: why it matters, likely cause, next action, and manager note.",
    "Keep the whole answer under 180 Thai words.",
      "",
      JSON.stringify(safePayload, null, 2)
    ].join("\n");
  }
  return [
    "You are an operations analyst for a hotel booking business.",
    "Use only supplied JSON-derived KPI and alert payload. Do not invent data.",
    "Write in Thai.",
    "Return exactly: one executive paragraph, 4 numbered action items, and one final line named Priority.",
    "Keep the whole answer under 260 Thai words. Finish every numbered item completely.",
    "",
    JSON.stringify(safePayload, null, 2)
  ].join("\n");
}

function sanitizePayload(mode, payload) {
  if (!payload || typeof payload !== "object") return {};
  if (mode === "spotlight") {
    return {
      topAlert: payload.topAlert || null,
      kpi: payload.kpi || {},
      alertSummary: payload.alertSummary || {}
    };
  }
  return {
    source: payload.source || {},
    kpi: payload.kpi || {},
    topLocationsByRevenue: Array.isArray(payload.topLocationsByRevenue) ? payload.topLocationsByRevenue.slice(0, 5) : [],
    worstLocationsByRevenue: Array.isArray(payload.worstLocationsByRevenue) ? payload.worstLocationsByRevenue.slice(0, 3) : [],
    topHotelsByRevenue: Array.isArray(payload.topHotelsByRevenue) ? payload.topHotelsByRevenue.slice(0, 5) : [],
    alertSummary: payload.alertSummary || {},
    topAlerts: Array.isArray(payload.topAlerts) ? payload.topAlerts.slice(0, 8) : []
  };
}

function loadDotEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = value;
  });
}
