export const DEMO_FALLBACK_STORAGE_KEY = "sba-force-demo-fallback";

export function createAiPayload(data, metrics, audit) {
  return {
    generatedAt: new Date().toISOString(),
    source: {
      hotels: data.hotels.length,
      bookings: data.bookings.length,
      derivedFrom: ["hotels.json", "hotel_bookings.json"]
    },
    kpi: {
      totalRevenue: metrics.revenue.total,
      activeRevenue: metrics.revenue.active,
      checkedOutRevenue: metrics.revenue.checkedOut,
      cancelledRevenue: metrics.revenue.cancelled,
      pendingAmount: metrics.revenue.pending,
      cancelRate: metrics.rates.cancel,
      averageHotelPricePerNight: metrics.averages.nightlyPrice,
      averageHotelRating: metrics.averages.hotelRating,
      averageBookingValue: metrics.averages.bookingValue
    },
    topLocationsByRevenue: metrics.topLocations.slice(0, 5),
    worstLocationsByRevenue: metrics.worstLocations.slice(0, 3),
    topHotelsByRevenue: metrics.topHotels.slice(0, 5),
    alertSummary: audit.summary,
    topAlerts: audit.alerts.slice(0, 8).map((alert) => ({
      type: alert.type,
      severity: alert.severity,
      booking_id: alert.booking_id,
      hotel_id: alert.hotel_id,
      hotel_name: alert.hotel_name,
      location: alert.location,
      reason: alert.reason,
      action: alert.action,
      amount: alert.amount
    }))
  };
}

export async function generateExecutiveBrief({ apiKey, payload }) {
  if (isDemoFallbackForced()) {
    return localExecutiveSummary(payload);
  }
  const text = buildBriefPrompt(payload);
  if (!apiKey) {
    return callAiProxy({ mode: "executive", payload })
      .catch(() => localExecutiveSummary(payload));
  }
  return callGeminiWithUserKey(apiKey, text, "executive")
    .catch(() => callAiProxy({ mode: "executive", payload }))
    .catch(() => localExecutiveSummary(payload));
}

export async function generateAnomalySpotlight({ apiKey, payload }) {
  if (isDemoFallbackForced()) {
    return localAnomalySpotlight(payload);
  }
  const topAlert = payload.topAlerts[0];
  if (!topAlert) {
    return localAnomalySpotlight(payload);
  }
  const text = buildSpotlightPrompt(payload, topAlert);
  if (!apiKey) {
    return callAiProxy({ mode: "spotlight", payload: { topAlert, kpi: payload.kpi, alertSummary: payload.alertSummary } })
      .catch(() => localAnomalySpotlight(payload));
  }
  return callGeminiWithUserKey(apiKey, text, `spotlight-${topAlert.type}-${topAlert.booking_id || topAlert.hotel_id || "portfolio"}`)
    .catch(() => callAiProxy({ mode: "spotlight", payload: { topAlert, kpi: payload.kpi, alertSummary: payload.alertSummary } }))
    .catch(() => localAnomalySpotlight(payload));
}

async function callGeminiWithUserKey(apiKey, prompt, cacheKey) {
  const cacheId = `sba-ai-${cacheKey}-${hash(prompt)}`;
  const cached = localStorage.getItem(cacheId);
  if (cached) return cached;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1200
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status})`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n").trim();
  if (!text) throw new Error("Gemini returned an empty response");
  localStorage.setItem(cacheId, text);
  return text;
}

async function callAiProxy({ mode, payload }) {
  const compactPayload = JSON.stringify(payload);
  const cacheId = `sba-proxy-${mode}-${hash(compactPayload)}`;
  const cached = localStorage.getItem(cacheId);
  if (cached) return cached;

  const response = await fetch("/api/ai-brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, payload })
  });

  if (!response.ok) {
    throw new Error(`AI proxy failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.text) throw new Error("AI proxy returned an empty response");
  localStorage.setItem(cacheId, data.text);
  return data.text;
}

function isDemoFallbackForced() {
  return localStorage.getItem(DEMO_FALLBACK_STORAGE_KEY) === "true";
}

function buildBriefPrompt(payload) {
  return [
    "You are an operations analyst for a hotel booking business.",
    "Use only the JSON-derived KPI payload below. Do not invent data.",
    "Write in Thai.",
    "Return exactly: one executive paragraph, 4 numbered action items, and one final line named Priority.",
    "Keep the whole answer under 260 Thai words. Finish every numbered item completely.",
    "",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

function buildSpotlightPrompt(payload, topAlert) {
  return [
    "You are an operations assistant for hotel booking QA.",
    "Analyze this top alert using only the provided JSON-derived context.",
    "Write in Thai.",
    "Return exactly 4 short sections: why it matters, likely cause, next action, and manager note.",
    "Keep the whole answer under 180 Thai words.",
    "",
    JSON.stringify({
      topAlert,
      kpi: payload.kpi,
      alertSummary: payload.alertSummary
    }, null, 2)
  ].join("\n");
}

function localExecutiveSummary(payload) {
  const topLocation = payload.topLocationsByRevenue[0];
  return [
    "**Local fallback:** AI proxy is unavailable, so this summary was generated in the browser from JSON-derived KPI.",
    "",
    `ภาพรวมวันนี้มีมูลค่าการจองรวม ${formatMoney(payload.kpi.totalRevenue)} โดยรายได้ที่ยัง active อยู่ที่ ${formatMoney(payload.kpi.activeRevenue)} และ pending amount ${formatMoney(payload.kpi.pendingAmount)}.`,
    topLocation ? `พื้นที่ที่ทำรายได้สูงสุดคือ ${topLocation.location} (${formatMoney(topLocation.revenue)} จาก ${topLocation.bookings} bookings).` : "",
    `ระบบพบ alerts ทั้งหมด ${payload.alertSummary.total_alerts} รายการ โดยมี critical ${payload.alertSummary.critical} รายการ.`,
    "",
    "Action items:",
    "- ตรวจ critical alerts ก่อน โดยเฉพาะ price mismatch และ pending ที่เลยวัน check-in",
    "- Follow up pending bookings ที่มีมูลค่าสูง",
    "- Review cancelled revenue และ location ที่มี cancellation watch",
    "- ใช้ /ops/alerts JSON ส่งต่อทีม operations เพื่อทำงานต่อ",
    "",
    "Priority วันนี้: แก้ critical alerts ก่อน แล้วค่อยตาม pending amount."
  ].filter(Boolean).join("\n");
}

function localAnomalySpotlight(payload) {
  const topAlert = payload.topAlerts[0];
  if (!topAlert) {
    return "ยังไม่พบ alert ที่ต้อง spotlight จากข้อมูล JSON ชุดนี้";
  }
  return [
    "**Local fallback:** AI proxy is unavailable, so this spotlight was generated in the browser from the top alert.",
    "",
    `**Spotlight:** ${topAlert.type} (${topAlert.severity})`,
    `**เหตุผล:** ${topAlert.reason}`,
    `**ผลกระทบ:** alert นี้เกี่ยวข้องกับมูลค่าประมาณ ${formatMoney(topAlert.amount || 0)} และควรถูกจัดลำดับตาม severity`,
    `**Next action:** ${topAlert.action}`,
    "**Manager note:** มีรายการที่ระบบ audit ตรวจพบจาก JSON จริง ควรให้ ops ตรวจและปิดเคสก่อนส่งต่อโรงแรมหรือลูกค้า"
  ].join("\n");
}

function formatMoney(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function hash(text) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = ((value << 5) - value + text.charCodeAt(index)) | 0;
  }
  return Math.abs(value).toString(36);
}
