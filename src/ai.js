export const DEMO_FALLBACK_STORAGE_KEY = "sba-force-demo-fallback";

export function createAiPayload(data, metrics, audit) {
  const derivedFrom = ["hotels.json", "hotel_bookings.json"];
  if (data.users?.length) derivedFrom.push("users.json");

  return {
    generatedAt: new Date().toISOString(),
    source: {
      hotels: data.hotels.length,
      bookings: data.bookings.length,
      users: data.users?.length || 0,
      derivedFrom
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
      user_id: alert.user_id,
      user_name: alert.user_name,
      user_email: alert.user_email,
      user_phone: alert.user_phone,
      hotel_id: alert.hotel_id,
      hotel_name: alert.hotel_name,
      location: alert.location,
      reason: alert.reason,
      action: alert.action,
      amount: alert.amount
    }))
  };
}

export async function generateExecutiveBrief({ payload }) {
  if (isDemoFallbackForced()) {
    return localExecutiveSummary(payload);
  }
  return callAiProxy({ mode: "executive", payload })
    .catch(() => localExecutiveSummary(payload));
}

export async function generateAnomalySpotlight({ payload }) {
  if (isDemoFallbackForced()) {
    return localAnomalySpotlight(payload);
  }
  const topAlert = payload.topAlerts[0];
  if (!topAlert) {
    return localAnomalySpotlight(payload);
  }
  return callAiProxy({
    mode: "spotlight",
    payload: {
      topAlert,
      kpi: payload.kpi,
      alertSummary: payload.alertSummary
    }
  }).catch(() => localAnomalySpotlight(payload));
}

async function callAiProxy({ mode, payload }) {
  const compactPayload = JSON.stringify(payload);
  const cacheId = `sba-claude-proxy-${mode}-${hash(compactPayload)}`;
  const cached = localStorage.getItem(cacheId);
  if (cached) return cached;

  const response = await fetch("/api/ai-insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, payload })
  });

  if (!response.ok) {
    throw new Error(`Claude proxy failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.text) throw new Error("Claude proxy returned an empty response");
  localStorage.setItem(cacheId, data.text);
  return data.text;
}

function isDemoFallbackForced() {
  return localStorage.getItem(DEMO_FALLBACK_STORAGE_KEY) === "true";
}

function localExecutiveSummary(payload) {
  const topLocation = payload.topLocationsByRevenue[0];
  return [
    "**Local fallback:** Claude proxy is unavailable, so this summary was generated in the browser from JSON-derived KPI.",
    "",
    `ภาพรวมวันนี้มีมูลค่าการจองรวม ${formatMoney(payload.kpi.totalRevenue)} โดยรายได้ที่ยัง active อยู่ที่ ${formatMoney(payload.kpi.activeRevenue)} และ pending amount ${formatMoney(payload.kpi.pendingAmount)}.`,
    topLocation ? `พื้นที่ที่ทำรายได้สูงสุดคือ ${topLocation.location} (${formatMoney(topLocation.revenue)} จาก ${topLocation.bookings} bookings).` : "",
    `ระบบพบ alerts ทั้งหมด ${payload.alertSummary.total_alerts} รายการ โดยมี critical ${payload.alertSummary.critical} รายการ.`,
    "",
    "Action items:",
    "- ตรวจ critical alerts ก่อน โดยเฉพาะ price mismatch และ pending ที่เลยวัน check-in",
    "- Follow up pending bookings ที่มีมูลค่าสูง",
    "- Review cancelled revenue และ location ที่มี cancellation watch",
    "- ใช้รายการ alerts ในหน้า Bookings & Alerts เป็น queue งานของทีม operations",
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
    "**Local fallback:** Claude proxy is unavailable, so this spotlight was generated in the browser from the top alert.",
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
