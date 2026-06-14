const CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const provider = getAiProvider();
  if (!provider) {
    return response.status(503).json({ error: "AI provider is not configured" });
  }

  try {
    const { mode, payload } = request.body || {};
    if (!isAllowedMode(mode)) {
      return response.status(400).json({ error: "Invalid mode" });
    }

    const safePrompt = buildPrompt(mode, payload);
    const aiResponse = await callClaude(provider.key, safePrompt);

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      return response.status(aiResponse.status).json({
        error: `${provider.name} request failed`,
        detail: detail.slice(0, 400)
      });
    }

    const data = await aiResponse.json();
    const text = extractClaudeText(data);
    return response.status(200).json({ mode, provider: provider.name, model: provider.model, text });
  } catch (error) {
    return response.status(500).json({ error: error.message || "AI proxy failed" });
  }
}

function getAiProvider() {
  if (process.env.CLAUDE_API_KEY) {
    return { name: "claude", key: process.env.CLAUDE_API_KEY, model: CLAUDE_MODEL };
  }
  return null;
}

function callClaude(apiKey, prompt) {
  return fetch(CLAUDE_ENDPOINT, {
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

function extractClaudeText(data) {
  return data?.content?.map((part) => part.text || "").join("\n").trim() || "";
}

function isAllowedMode(mode) {
  return mode === "executive" || mode === "spotlight";
}

function buildPrompt(mode, payload) {
  const compactPayload = sanitizePayload(mode, payload);
  if (mode === "spotlight") {
    return [
      "You are an operations assistant for hotel booking QA.",
      "Use only the supplied JSON-derived metrics and alerts. Do not invent bookings, hotels, or API keys.",
      "Write in Thai.",
      "Return exactly 4 short sections: why it matters, likely cause, next action, and manager note.",
      "Keep the whole answer under 180 Thai words.",
      "",
      JSON.stringify(compactPayload, null, 2)
    ].join("\n");
  }

  return [
    "You are an operations analyst for a hotel booking business.",
    "Use only the supplied JSON-derived KPI payload below. Do not invent bookings, hotels, or API keys.",
    "Write in Thai.",
    "Return exactly: one executive paragraph, 4 numbered action items, and one final line named Priority.",
    "Keep the whole answer under 260 Thai words. Finish every numbered item completely.",
    "",
    JSON.stringify(compactPayload, null, 2)
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
