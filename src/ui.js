import { generateAnomalySpotlight, generateExecutiveBrief } from "./ai.js";

const moneyFormatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0
});
const numberFormatter = new Intl.NumberFormat("th-TH");
const severityOrder = { CRITICAL: 3, WARNING: 2, INFO: 1 };

const STATUS_LABELS = {
  ALL: "ทั้งหมด (All Statuses)",
  CONFIRMED: "CONFIRMED (ยืนยันแล้ว)",
  CHECKED_IN: "CHECKED_IN (เช็คอินแล้ว)",
  CHECKED_OUT: "CHECKED_OUT (เช็คเอาท์แล้ว)",
  CANCELLED: "CANCELLED (ยกเลิกแล้ว)",
  PENDING: "PENDING (รอดำเนินการ)"
};

const ALERT_LABELS = {
  ALL: "ทั้งหมด (All Alerts)",
  MISSING_HOTEL_ID: "ไม่มีข้อมูลโรงแรม (Missing Hotel ID)",
  INVALID_DATES: "วันที่เข้าพักไม่ถูกต้อง (Invalid Dates)",
  PRICE_MISMATCH: "ราคาไม่ตรงตามราคารายคืน (Price Mismatch)",
  PAST_DUE_PENDING: "จองค้าง/เลยวันเช็คอิน (Overdue Pending)",
  UPCOMING_UNCONFIRMED: "ยังไม่ยืนยันการจอง (Upcoming Unconfirmed)",
  CANCELLATION_IMPACT: "การยกเลิกการจอง (Cancellation Impact)",
  HIGH_VALUE_BOOKING: "การจองมูลค่าสูง (High-Value Booking)",
  LOCATION_CANCEL_WATCH: "เฝ้าระวังการยกเลิกรายจังหวัด (Location Cancel Watch)",
  HOTEL_PERFORMANCE_WATCH: "เฝ้าระวังประสิทธิภาพโรงแรม (Hotel Performance Watch)"
};

const LOCATION_LABELS = {
  ALL: "ทั้งหมด (All Provinces)"
};

const AMENITY_LABELS = {
  Pool: "สระว่ายน้ำ (Pool)",
  Spa: "สปา (Spa)",
  Gym: "ฟิตเนส (Gym)",
  Wifi: "อินเทอร์เน็ตไร้สาย (Wifi)",
  Parking: "ที่จอดรถ (Parking)",
  Restaurant: "ห้องอาหาร (Restaurant)",
  Bar: "บาร์ (Bar)",
  AC: "เครื่องปรับอากาศ (AC)",
  Kitchen: "ห้องครัว (Kitchen)",
  Breakfast: "อาหารเช้า (Breakfast)"
};

const ALERT_BADGE_LABELS = {
  MISSING_HOTEL_ID: "ไม่มีข้อมูลโรงแรม",
  INVALID_DATES: "วันที่ไม่ถูกต้อง",
  PRICE_MISMATCH: "ราคาไม่ตรง",
  PAST_DUE_PENDING: "เลยวันเช็คอิน",
  UPCOMING_UNCONFIRMED: "ยังไม่ยืนยัน",
  CANCELLATION_IMPACT: "ยกเลิกแล้ว",
  HIGH_VALUE_BOOKING: "มูลค่าสูง",
  LOCATION_CANCEL_WATCH: "เฝ้าระวังพื้นที่",
  HOTEL_PERFORMANCE_WATCH: "เฝ้าระวังโรงแรม"
};

function translateAmenityName(amenity) {
  return AMENITY_LABELS[amenity] || amenity;
}

function translateAmenities(amenities) {
  return amenities.map((a) => AMENITY_LABELS[a] || a).join(" · ");
}

function translateAlert(alert) {
  const t = {
    title: alert.title,
    reason: alert.reason,
    action: alert.action,
    severity: alert.severity
  };

  const severityMap = {
    CRITICAL: "วิกฤต (CRITICAL)",
    WARNING: "แจ้งเตือน (WARNING)",
    INFO: "ข้อมูลทั่วไป (INFO)"
  };
  t.severityLabel = severityMap[alert.severity] || alert.severity;

  if (alert.type === "MISSING_HOTEL_ID") {
    t.title = "ไม่พบรหัสโรงแรมในฐานข้อมูล";
    t.reason = `ไม่พบรหัสโรงแรม ${alert.hotel_id} ในไฟล์ข้อมูล hotels.json`;
    t.action = "ระงับการยืนยัน และทำการตรวจสอบความถูกต้องของข้อมูลโรงแรมในระบบก่อนดำเนินการติดต่อลูกค้า";
  } else if (alert.type === "INVALID_DATES") {
    t.title = "วันเข้าพักไม่ถูกต้อง";
    t.reason = "วันที่ Check-out จะต้องเป็นวันที่หลังจากวัน Check-in เสมอ";
    t.action = "แก้ไขระยะเวลาและวันเข้าพักให้ถูกต้อง ก่อนส่งข้อมูลการจองไปยังโรงแรม";
  } else if (alert.type === "PRICE_MISMATCH") {
    t.title = "ราคารวมการจองไม่ตรงกับเรทราคารายคืน";
    t.reason = `ราคารายคืน ${money(alert.pricePerNight || alert.price_per_night)} × ${alert.nights} คืน = ควรเป็น ${money(alert.expected_price)}, แต่เก็บจริง ${money(alert.actual_price)}`;
    t.action = "ตรวจสอบแผนราคา (Rate Plan) และส่วนต่างโปรโมชั่นก่อนทำการยืนยันกับลูกค้า";
  } else if (alert.type === "PAST_DUE_PENDING") {
    t.title = "รายการจองค้างดำเนินการเลยวัน Check-in";
    const daysMatch = alert.reason.match(/\d+/);
    const days = daysMatch ? daysMatch[0] : "?";
    t.reason = `เลยกำหนดวัน Check-in มาแล้ว ${days} วัน แต่สถานะรายการจองในระบบยังคงเป็น PENDING`;
    t.action = "เร่งประสานงานติดต่อกับโรงแรมและผู้เข้าพักทันทีเพื่อยืนยันหรือตรวจสอบสถานะการเข้าพัก";
  } else if (alert.type === "UPCOMING_UNCONFIRMED") {
    t.title = "รายการจองใกล้ถึงวันเข้าพักแต่ยังไม่ยืนยัน";
    const daysMatch = alert.reason.match(/\d+/);
    const days = daysMatch ? daysMatch[0] : "?";
    t.reason = `เหลือเวลาอีกเพียง ${days} วันจะถึงวัน Check-in แต่สถานะในระบบยังคงเป็น PENDING`;
    t.action = "ติดตามความคืบหน้ากับโรงแรมเพื่อป้องกันความผิดพลาดในการให้บริการลูกค้า";
  } else if (alert.type === "CANCELLATION_IMPACT") {
    t.title = "ผลกระทบจากการยกเลิกการจอง";
    t.reason = `สูญเสียรายได้มูลค่ารวม ${money(alert.amount)} จากการยกเลิกรายการจองนี้`;
    t.action = "ตรวจสอบสาเหตุการยกเลิกและพิจารณาแนวทางติดตามเพื่อรักษาฐานลูกค้า";
  } else if (alert.type === "HIGH_VALUE_BOOKING") {
    t.title = "รายการจองมูลค่าสูง";
    const thresholdMatch = alert.reason.match(/threshold\s+(฿?\d[\d,]*)/) || alert.reason.match(/threshold\s+([\d,]+)/);
    const threshold = thresholdMatch ? thresholdMatch[1].startsWith("฿") ? thresholdMatch[1] : `฿${thresholdMatch[1]}` : "฿15,000";
    t.reason = `ยอดจองรวม ${money(alert.amount)} สูงกว่าเกณฑ์ขั้นต่ำของระบบ (${threshold})`;
    t.action = "ให้ความสำคัญกับการเตรียมบริการและความถูกต้องของรายละเอียดการยืนยันเป็นพิเศษ";
  } else if (alert.type === "LOCATION_CANCEL_WATCH") {
    t.title = "จังหวัดเฝ้าระวังอัตราการยกเลิกสูง";
    const ratesMatch = alert.reason.match(/rate\s+is\s+(\d+)%\s+vs\s+portfolio\s+(\d+)%/);
    const rateText = ratesMatch ? ` (${ratesMatch[1]}% เทียบกับค่าเฉลี่ยพอร์ต ${ratesMatch[2]}%)` : "";
    t.reason = `จังหวัด ${alert.location} มีอัตราการยกเลิกสูงกว่าค่าเฉลี่ยของภาพรวมพอร์ตการจอง${rateText}`;
    t.action = "ตรวจสอบคุณภาพการบริการ นโยบายการยกเลิก หรือฟีดแบกผู้ใช้งานในจังหวัดนี้";
  } else if (alert.type === "HOTEL_PERFORMANCE_WATCH") {
    t.title = "โรงแรมเรทติ้งสูงแต่ยังไม่มีการจอง";
    const ratingMatch = alert.reason.match(/rating\s+([\d.]+)/);
    const ratingText = ratingMatch ? ` (${ratingMatch[1]} ดาว)` : "";
    t.reason = `โรงแรม ${alert.hotel_name || alert.hotel_id} ได้คะแนนรีวิวดีเยี่ยม${ratingText} แต่ไม่มีมูลค่าการจองในรอบข้อมูลนี้`;
    t.action = "โปรโมทหรือตรวจสอบราคาตลาด การมองเห็น ตลอดจนแพ็กเกจส่งเสริมการขาย";
  }
  return t;
}

export function initUi({ data, metrics, audit, aiPayload }) {
  const state = {
    data,
    metrics,
    audit,
    aiPayload,
    bookingFilters: {
      search: "",
      status: "ALL",
      alert: "ALL",
      location: "ALL",
      dateFrom: "",
      dateTo: "",
      minTotal: "",
      sort: "severity"
    },
    hotelFilters: {
      search: "",
      location: "ALL",
      minRating: "",
      maxPrice: "",
      amenities: [],
      sort: "revenue_desc"
    }
  };

  bindNavigation();
  bindTheme();
  renderStatus(data);
  renderDashboard(state);
  setupBookingFilters(state);
  setupHotelFilters(state);
  bindAi(state);
  bindDetailDialog();
  renderBookings(state);
  renderHotels(state);
}

function bindNavigation() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.view}View`).classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function bindTheme() {
  const savedTheme = localStorage.getItem("sba-theme") || "light";
  document.documentElement.dataset.theme = savedTheme;
  document.querySelector("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("sba-theme", next);
  });
}

function renderStatus(data) {
  const freshness = document.querySelector("#dataFreshness");
  const userText = data.users?.length ? ` • ผู้ใช้งาน ${data.users.length} คน` : "";
  freshness.textContent = `วิเคราะห์ข้อมูลโรงแรม ${data.hotels.length} แห่ง • รายการจอง ${data.bookings.length} รายการ${userText}`;
  if (data.warnings.length) {
    showBanner(`พบข้อควรระวังเกี่ยวกับข้อมูล ${data.warnings.length} รายการ กรุณาตรวจสอบ JSON schema`, "warning");
  }
}

function renderDashboard(state) {
  const { metrics, audit } = state;
  const kpis = [
    ["มูลค่าการจองรวมทั้งหมด (Total Revenue)", money(metrics.revenue.total), `รวมทั้งหมด ${number(metrics.counts.bookings)} รายการจอง`],
    ["มูลค่ารายการจอง Active", money(metrics.revenue.active), "CONFIRMED + CHECKED_IN"],
    ["มูลค่าการจองรอตรวจสอบ (Pending)", money(metrics.revenue.pending), `รอดำเนินการ ${number(metrics.counts.pending)} รายการ`],
    ["มูลค่าความเสียหายจากการยกเลิก", money(metrics.revenue.cancelled), `อัตราการยกเลิก ${metrics.rates.cancel}%`],
    ["เคสปัญหาวิกฤต (Critical Issues)", number(audit.summary.critical), `แจ้งเตือนทั้งหมด ${audit.summary.total_alerts} รายการ`],
    ["คะแนนรีวิวโรงแรมเฉลี่ย", metrics.averages.hotelRating.toFixed(2), `ราคาเฉลี่ยคืนละ ${money(metrics.averages.nightlyPrice)}`]
  ];

  document.querySelector("#kpiGrid").innerHTML = kpis.map(([label, value, meta]) => `
    <article class="kpi-card">
      <p>${escapeHtml(label)}</p>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(meta)}</span>
    </article>
  `).join("");

  renderColumnChart("#monthlyRevenueChart", metrics.revenueByMonth, "month", "revenue");
  renderStatusChart(metrics.statusDistribution);
  renderLocationHeatmap(metrics.topLocations);
  renderTopAlert(state);
}

function renderTopAlert(state) {
  const topAlert = state.audit.alerts[0];
  const target = document.querySelector("#locationChart");
  if (!topAlert || !target) return;
  const t = translateAlert(topAlert);
  target.insertAdjacentHTML("beforeend", `
    <div class="top-alert-card">
      <span class="alert-badge ${topAlert.severity.toLowerCase()}">${escapeHtml(topAlert.severity)}</span>
      <strong>${escapeHtml(t.title)}</strong>
      <p>${escapeHtml(t.reason)}</p>
      <button class="table-button" type="button" data-top-alert-booking="${escapeHtml(topAlert.booking_id || "")}">ตรวจสอบเคสนี้</button>
    </div>
  `);
  const button = target.querySelector("[data-top-alert-booking]");
  button?.addEventListener("click", () => {
    document.querySelector('[data-view="bookings"]').click();
    if (topAlert.booking_id) openBookingDetail(state, topAlert.booking_id);
  });
}

function renderColumnChart(selector, rows, labelKey, valueKey) {
  const max = Math.max(...rows.map((row) => row[valueKey]), 1);
  const html = rows.map((row, index) => {
    const height = Math.max((row[valueKey] / max) * 100, 4);
    const formattedValue = row[valueKey] > 0 ? money(row[valueKey]) : "฿0";
    const isMax = row[valueKey] === max;
    const isLatest = index === rows.length - 1;
    const tone = isMax ? " peak" : isLatest ? " latest" : "";
    return `
      <div class="column-bar${tone}" title="${escapeHtml(`${row[labelKey]} ${formattedValue}`)}">
        <strong>${escapeHtml(formattedValue)}</strong>
        <div class="column-track">
          <div class="column-fill" style="height:${height}%"></div>
        </div>
        <span>${escapeHtml(formatMonthLabel(row[labelKey], index))}</span>
      </div>
    `;
  }).join("");
  document.querySelector(selector).innerHTML = html
    ? `<div class="column-chart">${html}</div>`
    : `<p class="empty-state">ไม่มีข้อมูลแสดงแผนภูมิ</p>`;
}

function formatMonthLabel(value, index) {
  const [year, month] = String(value).split("-");
  const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const monthIndex = Number(month) - 1;
  const monthLabel = monthNames[monthIndex] || value;
  if (index === 0 || month === "01") return `${monthLabel} '${String(year).slice(2)}`;
  return monthLabel;
}

function renderLocationHeatmap(rows) {
  const topRows = rows.slice(0, 5);
  const heatmapRows = rows.filter((row) => row.revenue > 0).slice(0, 12);
  const max = Math.max(...rows.map((row) => row.revenue), 1);
  const axis = [0, Math.round(max / 2), max];
  const list = topRows.map((row, index) => {
    const width = Math.max((row.revenue / max) * 100, 7);
    return `
      <div class="region-row">
        <div class="region-rank">${index + 1}</div>
        <div>
          <div class="region-row-heading">
            <strong>${escapeHtml(row.location)}</strong>
            <span>${money(row.revenue)}</span>
          </div>
          <div class="region-meter"><div style="width:${width}%"></div></div>
        </div>
      </div>
    `;
  }).join("");

  const tiles = heatmapRows.map((row) => {
    const intensity = row.revenue / max;
    const shade = Math.round(20 + intensity * 70);
    return `
      <article class="heat-tile" style="--heat:${shade}%">
        <strong>${escapeHtml(row.location)}</strong>
        <span>${money(row.revenue)}</span>
      </article>
    `;
  }).join("");

  document.querySelector("#locationChart").innerHTML = topRows.length
    ? `
      <div class="location-heatmap">
        <div class="region-chart">
          <div class="region-list">${list}</div>
          <div class="region-axis" aria-label="Revenue scale">
            ${axis.map((value) => `<span>${money(value)}</span>`).join("")}
          </div>
        </div>
        <div class="market-heatmap-panel">
          <div class="market-heat-grid">${tiles}</div>
          <div class="heatmap-caption">
            <strong>ระดับความหนาแน่นรายได้ตามจังหวัด</strong>
            <span>สีที่เข้มกว่าบ่งบอกถึงมูลค่าการจองสะสมในจังหวัดนั้นๆ ที่สูงกว่า</span>
          </div>
        </div>
      </div>
    `
    : `<p class="empty-state">ไม่มีข้อมูลแสดงแผนภูมิ</p>`;
}

function renderStatusChart(rows) {
  const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
  document.querySelector("#statusChart").innerHTML = rows.map((row) => {
    const percent = Math.round((row.count / total) * 100);
    const label = STATUS_LABELS[row.status] || row.status;
    return `
      <div class="status-row">
        <span class="status-pill ${statusClass(row.status)}">${escapeHtml(label)}</span>
        <div class="bar-track"><div class="bar-fill ${statusClass(row.status)}" style="width:${percent}%"></div></div>
        <strong>${row.count}</strong>
      </div>
    `;
  }).join("");
}

function setupBookingFilters(state) {
  fillSelect("#statusFilter", ["ALL", ...state.data.statuses], STATUS_LABELS);
  fillSelect("#locationFilter", ["ALL", ...state.data.locations], LOCATION_LABELS);
  fillSelect("#alertFilter", ["ALL", ...Object.keys(state.audit.summary.by_type).sort()], ALERT_LABELS);

  bindFilter("#bookingSearch", "input", (value) => state.bookingFilters.search = value);
  bindFilter("#statusFilter", "change", (value) => state.bookingFilters.status = value);
  bindFilter("#alertFilter", "change", (value) => state.bookingFilters.alert = value);
  bindFilter("#locationFilter", "change", (value) => state.bookingFilters.location = value);
  bindFilter("#dateFromFilter", "input", (value) => state.bookingFilters.dateFrom = value);
  bindFilter("#dateToFilter", "input", (value) => state.bookingFilters.dateTo = value);
  bindFilter("#minTotalFilter", "input", (value) => state.bookingFilters.minTotal = value);
  bindFilter("#bookingSort", "change", (value) => state.bookingFilters.sort = value);
  document.querySelector("#clearBookingFilters").addEventListener("click", () => {
    state.bookingFilters = {
      search: "",
      status: "ALL",
      alert: "ALL",
      location: "ALL",
      dateFrom: "",
      dateTo: "",
      minTotal: "",
      sort: "severity"
    };
    document.querySelector("#bookingSearch").value = "";
    document.querySelector("#statusFilter").value = "ALL";
    document.querySelector("#alertFilter").value = "ALL";
    document.querySelector("#locationFilter").value = "ALL";
    document.querySelector("#dateFromFilter").value = "";
    document.querySelector("#dateToFilter").value = "";
    document.querySelector("#minTotalFilter").value = "";
    document.querySelector("#bookingSort").value = "severity";
    renderBookings(state);
  });

  ["#bookingSearch", "#statusFilter", "#alertFilter", "#locationFilter", "#dateFromFilter", "#dateToFilter", "#minTotalFilter", "#bookingSort"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", () => renderBookings(state));
    document.querySelector(selector).addEventListener("change", () => renderBookings(state));
  });
}

function renderBookings(state) {
  const rows = filterBookings(state);
  document.querySelector("#bookingTableCaption").textContent = `แสดงรายการจองทั้งหมด ${rows.length} รายการ จากข้อมูล hotel_bookings.json`;
  document.querySelector("#bookingTableBody").innerHTML = rows.map((row) => {
    const alerts = state.audit.alertsByBookingId.get(row.booking_id) || [];
    const topSeverity = alerts.reduce((severity, alert) => {
      return severityOrder[alert.severity] > severityOrder[severity] ? alert.severity : severity;
    }, "INFO");
    return `
      <tr>
        <td><strong>${escapeHtml(row.booking_id)}</strong><br><span class="muted">${escapeHtml(formatUserLine(row))}</span></td>
        <td>${escapeHtml(row.hotelName)}<br><span class="muted">${escapeHtml(row.location)} · ${row.rating.toFixed(1)} ดาว</span></td>
        <td>${escapeHtml(row.check_in)} → ${escapeHtml(row.check_out)}<br><span class="muted">${row.nights ?? "?"} คืน · ${row.guests} ผู้เข้าพัก</span></td>
        <td><span class="status-pill ${statusClass(row.status)}">${escapeHtml(STATUS_LABELS[row.status] || row.status)}</span></td>
        <td>${money(row.total_price)}</td>
        <td>${alerts.length ? renderAlertBadges(alerts) : `<span class="muted">ไม่มีข้อแจ้งเตือน</span>`}</td>
        <td><button class="table-button" type="button" data-detail-booking="${escapeHtml(row.booking_id)}">เปิดดู</button></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="7" class="empty-state">ไม่มีรายการจองที่ตรงกับตัวกรอง</td></tr>`;

  document.querySelectorAll("[data-detail-booking]").forEach((button) => {
    button.addEventListener("click", () => openBookingDetail(state, button.dataset.detailBooking));
  });
}

function filterBookings(state) {
  const filters = state.bookingFilters;
  const query = filters.search.trim().toLowerCase();
  const minTotal = Number(filters.minTotal) || 0;

  return state.data.derivedBookings
    .filter((row) => {
      const alerts = state.audit.alertsByBookingId.get(row.booking_id) || [];
      const text = [row.booking_id, row.user_id, row.userName, row.userEmail, row.userPhone, row.hotelName, row.location, row.status, row.hotel_id].join(" ").toLowerCase();
      return (!query || text.includes(query))
        && (filters.status === "ALL" || row.status === filters.status)
        && (filters.location === "ALL" || row.location === filters.location)
        && (filters.alert === "ALL" || alerts.some((alert) => alert.type === filters.alert))
        && (!filters.dateFrom || row.check_in >= filters.dateFrom)
        && (!filters.dateTo || row.check_in <= filters.dateTo)
        && row.total_price >= minTotal;
    })
    .sort((a, b) => compareBookings(a, b, filters.sort, state.audit));
}

function compareBookings(a, b, sort, audit) {
  if (sort === "check_in") return a.check_in.localeCompare(b.check_in);
  if (sort === "total_desc") return b.total_price - a.total_price;
  if (sort === "rating_desc") return b.rating - a.rating;
  const aSeverity = maxSeverity(a.booking_id, audit);
  const bSeverity = maxSeverity(b.booking_id, audit);
  return severityOrder[bSeverity] - severityOrder[aSeverity] || b.total_price - a.total_price;
}

function maxSeverity(bookingId, audit) {
  const alerts = audit.alertsByBookingId.get(bookingId) || [];
  return alerts.reduce((severity, alert) => severityOrder[alert.severity] > severityOrder[severity] ? alert.severity : severity, "INFO");
}

function setupHotelFilters(state) {
  fillSelect("#hotelLocationFilter", ["ALL", ...state.data.locations], LOCATION_LABELS);
  setupAmenityMultiSelect(state);
  bindFilter("#hotelSearch", "input", (value) => state.hotelFilters.search = value);
  bindFilter("#hotelLocationFilter", "change", (value) => state.hotelFilters.location = value);
  bindFilter("#hotelRatingFilter", "input", (value) => state.hotelFilters.minRating = value);
  bindFilter("#hotelPriceFilter", "input", (value) => state.hotelFilters.maxPrice = value);
  bindFilter("#hotelSort", "change", (value) => state.hotelFilters.sort = value);
  document.querySelector("#clearHotelFilters").addEventListener("click", () => {
    state.hotelFilters = {
      search: "",
      location: "ALL",
      minRating: "",
      maxPrice: "",
      amenities: [],
      sort: "revenue_desc"
    };
    document.querySelector("#hotelSearch").value = "";
    document.querySelector("#hotelLocationFilter").value = "ALL";
    document.querySelector("#hotelRatingFilter").value = "";
    document.querySelector("#hotelPriceFilter").value = "";
    document.querySelector("#hotelSort").value = "revenue_desc";
    updateAmenityMultiSelect(state);
    renderHotels(state);
  });

  ["#hotelSearch", "#hotelLocationFilter", "#hotelRatingFilter", "#hotelPriceFilter", "#hotelSort"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", () => renderHotels(state));
    document.querySelector(selector).addEventListener("change", () => renderHotels(state));
  });
}

function setupAmenityMultiSelect(state) {
  const root = document.querySelector("#amenityFilter");
  const button = document.querySelector("#amenityFilterButton");
  const menu = document.querySelector("#amenityFilterMenu");

  menu.innerHTML = state.data.amenities.map((amenity) => `
    <label class="multi-select-option">
      <input type="checkbox" value="${escapeHtml(amenity)}">
      <span>${escapeHtml(translateAmenityName(amenity))}</span>
    </label>
  `).join("");

  button.addEventListener("click", () => {
    const nextOpen = menu.hidden;
    menu.hidden = !nextOpen;
    button.setAttribute("aria-expanded", String(nextOpen));
  });

  menu.addEventListener("change", (event) => {
    if (!event.target.matches("input[type='checkbox']")) return;
    state.hotelFilters.amenities = [...menu.querySelectorAll("input:checked")].map((input) => input.value);
    updateAmenityMultiSelect(state);
    renderHotels(state);
  });

  document.addEventListener("click", (event) => {
    if (root.contains(event.target)) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  });

  updateAmenityMultiSelect(state);
}

function updateAmenityMultiSelect(state) {
  const button = document.querySelector("#amenityFilterButton");
  const menu = document.querySelector("#amenityFilterMenu");
  const selectedAmenities = state.hotelFilters.amenities;

  menu.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = selectedAmenities.includes(input.value);
  });

  if (!selectedAmenities.length) {
    button.textContent = "สิ่งอำนวยความสะดวกทั้งหมด";
  } else if (selectedAmenities.length === 1) {
    button.textContent = translateAmenityName(selectedAmenities[0]);
  } else {
    button.textContent = `เลือกแล้ว ${selectedAmenities.length} รายการ`;
  }
}

function renderHotels(state) {
  const filters = state.hotelFilters;
  const query = filters.search.trim().toLowerCase();
  const minRating = Number(filters.minRating) || 0;
  const maxPrice = Number(filters.maxPrice) || Infinity;
  const rows = state.metrics.hotelPerformance
    .filter((hotel) => {
      const text = [hotel.name, hotel.location, hotel.amenities.join(" ")].join(" ").toLowerCase();
      return (!query || text.includes(query))
        && (filters.location === "ALL" || hotel.location === filters.location)
        && (!filters.amenities.length || filters.amenities.every((amenity) => hotel.amenities.includes(amenity)))
        && hotel.rating >= minRating
        && hotel.price_per_night <= maxPrice;
    })
    .sort((a, b) => compareHotels(a, b, filters.sort));

  renderHotelResultSummary(state, rows);
  document.querySelector("#hotelGrid").innerHTML = rows.map((hotel) => `
    <article class="hotel-card">
      <div>
        <p class="eyebrow">${escapeHtml(hotel.location)}</p>
        <h3>${escapeHtml(hotel.name)}</h3>
      </div>
      <dl class="metric-list">
        <div><dt>รายได้สะสม</dt><dd>${money(hotel.revenue)}</dd></div>
        <div><dt>จำนวนจอง</dt><dd>${hotel.bookings}</dd></div>
        <div><dt>คะแนนเฉลี่ย</dt><dd>${hotel.rating.toFixed(1)}</dd></div>
        <div><dt>ราคาต่อคืน</dt><dd>${money(hotel.price_per_night)}</dd></div>
      </dl>
      <p class="amenities">${hotel.amenities.slice(0, 5).map(translateAmenityName).join(" · ")}</p>
      <button class="secondary-button" type="button" data-detail-hotel="${escapeHtml(hotel.hotel_id)}">เปิดดูโรงแรม</button>
    </article>
  `).join("") || `<p class="empty-state">ไม่มีโรงแรมที่ตรงกับเงื่อนไข</p>`;

  document.querySelectorAll("[data-detail-hotel]").forEach((button) => {
    button.addEventListener("click", () => openHotelDetail(state, button.dataset.detailHotel));
  });
}

function renderHotelResultSummary(state, rows) {
  const filters = state.hotelFilters;
  const chips = [];
  if (filters.search.trim()) chips.push(`ค้นหา: "${filters.search.trim()}"`);
  if (filters.location !== "ALL") chips.push(`จังหวัด: ${filters.location}`);
  if (filters.minRating) chips.push(`คะแนนขั้นต่ำ: ${filters.minRating}`);
  if (filters.maxPrice) chips.push(`ราคาต่อคืนสูงสุด: ${money(Number(filters.maxPrice))}`);
  if (filters.amenities.length) chips.push(`สิ่งอำนวยความสะดวก: ${filters.amenities.map(translateAmenityName).join(", ")}`);

  const summary = document.querySelector("#hotelResultSummary");
  summary.innerHTML = `
    <strong>กำลังแสดงโรงแรม ${rows.length} จากทั้งหมด ${state.metrics.hotelPerformance.length} แห่ง</strong>
    ${chips.length ? `<span>ตัวกรอง: ${chips.map(escapeHtml).join(" · ")}</span>` : `<span>ไม่ได้เปิดใช้งานตัวกรอง</span>`}
  `;
}

function compareHotels(a, b, sort) {
  if (sort === "rating_desc") return b.rating - a.rating;
  if (sort === "price_asc") return a.price_per_night - b.price_per_night;
  if (sort === "bookings_desc") return b.bookings - a.bookings;
  return b.revenue - a.revenue;
}

function bindAi(state) {
  document.querySelector("#generateBriefButton").addEventListener("click", async () => {
    await runAiAction({
      outputSelector: "#briefOutput",
      label: "กำลังสร้างรายงาน AI Insights...",
      action: () => generateExecutiveBrief({ payload: state.aiPayload })
    });
  });
  document.querySelector("#generateSpotlightButton").addEventListener("click", async () => {
    await runAiAction({
      outputSelector: "#spotlightOutput",
      label: "กำลังวิเคราะห์ข้อแจ้งเตือนที่สำคัญ...",
      action: () => generateAnomalySpotlight({ payload: state.aiPayload })
    });
  });
}

async function runAiAction({ outputSelector, label, action }) {
  const output = document.querySelector(outputSelector);
  output.textContent = label;
  try {
    const markdownText = await action();
    output.innerHTML = renderMarkdown(markdownText + completionNote(markdownText));
  } catch (error) {
    output.textContent = `การร้องขอ AI ล้มเหลว แนะนำให้ลองใหม่อีกครั้ง หรือแสดงข้อมูลสำรองในเครื่อง: ${error.message}`;
  }
}

function completionNote(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const endsCleanly = /[.!?。]|ครับ|ค่ะ|แล้ว|ได้|ก่อน|ต่อ|สูง|ต่ำ|บาท|%|\)$/u.test(trimmed);
  return endsCleanly ? "" : "\n\n**หมายเหตุ:** คำตอบอาจถูกตัดกลางประโยค กรุณากด Generate อีกครั้ง";
}

function renderMarkdown(markdownText) {
  const escaped = escapeHtml(markdownText);
  const lines = escaped.split(/\r?\n/);
  let inList = false;
  const html = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      return;
    }

    if (trimmed.startsWith("### ")) {
      if (inList) html.push("</ul>");
      inList = false;
      html.push(`<h4>${formatInlineMarkdown(trimmed.slice(4))}</h4>`);
      return;
    }

    if (trimmed.startsWith("## ")) {
      if (inList) html.push("</ul>");
      inList = false;
      html.push(`<h3>${formatInlineMarkdown(trimmed.slice(3))}</h3>`);
      return;
    }

    if (trimmed.startsWith("# ")) {
      if (inList) html.push("</ul>");
      inList = false;
      html.push(`<h3>${formatInlineMarkdown(trimmed.slice(2))}</h3>`);
      return;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInlineMarkdown(trimmed.slice(2))}</li>`);
      return;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
  });

  if (inList) html.push("</ul>");
  return html.join("");
}

function formatInlineMarkdown(value) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function bindDetailDialog() {
  const dialog = document.querySelector("#detailDialog");
  document.querySelector("#closeDetailButton").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function formatUserLine(row) {
  if (!row.user) return row.user_id;
  const contact = row.userEmail || row.userPhone || row.user_id;
  return `${row.userName} · ${contact}`;
}

function openBookingDetail(state, bookingId) {
  const row = state.data.derivedBookings.find((booking) => booking.booking_id === bookingId);
  const alerts = state.audit.alertsByBookingId.get(bookingId) || [];
  if (!row) return;
  document.querySelector("#detailTitle").textContent = `รายการจอง ${row.booking_id}`;
  document.querySelector("#detailContent").innerHTML = `
    <div class="detail-grid">
      <section>
        <h3>ข้อมูลการจอง (Booking Details)</h3>
        <dl class="detail-list">
          <div><dt>สถานะ (Status)</dt><dd><span class="status-pill ${statusClass(row.status)}">${escapeHtml(STATUS_LABELS[row.status] || row.status)}</span></dd></div>
          <div><dt>ระยะเวลาเข้าพัก (Stay)</dt><dd>${escapeHtml(row.check_in)} → ${escapeHtml(row.check_out)} (${row.nights ?? "?"} คืน)</dd></div>
          <div><dt>จำนวนผู้เข้าพัก (Guests)</dt><dd>${row.guests} คน</dd></div>
          <div><dt>ราคารวม (Total Price)</dt><dd>${money(row.total_price)}</dd></div>
        </dl>
      </section>
      <section>
        <h3>ข้อมูลผู้จอง (Guest Contact)</h3>
        <dl class="detail-list">
          <div><dt>ชื่อผู้จอง (Name)</dt><dd>${escapeHtml(row.userName)}</dd></div>
          <div><dt>รหัสผู้ใช้งาน (User ID)</dt><dd>${escapeHtml(row.user_id)}</dd></div>
          <div><dt>อีเมล (Email)</dt><dd>${row.userEmail ? escapeHtml(row.userEmail) : `<span class="muted">ไม่มีข้อมูล</span>`}</dd></div>
          <div><dt>เบอร์ติดต่อ (Phone)</dt><dd>${row.userPhone ? escapeHtml(row.userPhone) : `<span class="muted">ไม่มีข้อมูล</span>`}</dd></div>
          <div><dt>ระดับสมาชิก (Tier)</dt><dd>${row.userTier ? escapeHtml(row.userTier) : `<span class="muted">ไม่มีข้อมูล</span>`}</dd></div>
        </dl>
      </section>
      <section>
        <h3>ข้อมูลโรงแรม (Hotel Details)</h3>
        <dl class="detail-list">
          <div><dt>ชื่อโรงแรม (Name)</dt><dd>${escapeHtml(row.hotelName)}</dd></div>
          <div><dt>จังหวัด (Location)</dt><dd>${escapeHtml(row.location)}</dd></div>
          <div><dt>คะแนน (Rating)</dt><dd>${row.rating.toFixed(1)} / 5.0</dd></div>
          <div><dt>ราคาต่อคืน (Nightly Rate)</dt><dd>${money(row.pricePerNight)}</dd></div>
          <div><dt>สิ่งอำนวยความสะดวก (Amenities)</dt><dd>${escapeHtml(translateAmenities(row.hotel?.amenities || []))}</dd></div>
        </dl>
      </section>
    </div>
    <section class="calculation-box">
      <h3>การคำนวณราคาตามสัญญา (Price Calculation)</h3>
      <p>ราคาต่อคืน ${money(row.pricePerNight)} × ${row.nights ?? "?"} คืน = คาดการณ์ <strong>${row.expectedPrice === null ? "ไม่ระบุ" : money(row.expectedPrice)}</strong></p>
      <p>ยอดจ่ายจริง: <strong>${money(row.total_price)}</strong> · ส่วนต่างราคา: <strong class="${row.priceDiff !== 0 ? "text-error" : ""}">${row.priceDiff === null ? "ไม่ระบุ" : money(row.priceDiff)}</strong></p>
    </section>
    <section>
      <h3>ข้อแจ้งเตือน & คำแนะนำการจัดการ (Alerts & Actions)</h3>
      ${alerts.length ? alerts.map(renderAlertDetail).join("") : `<p class="empty-state">ไม่มีข้อแจ้งเตือนสำหรับรายการนี้</p>`}
    </section>
  `;
  document.querySelector("#detailDialog").showModal();
}

function openHotelDetail(state, hotelId) {
  const hotel = state.metrics.hotelPerformance.find((item) => item.hotel_id === hotelId);
  const rows = state.data.bookingsByHotelId.get(hotelId) || [];
  if (!hotel) return;
  document.querySelector("#detailTitle").textContent = hotel.name;
  document.querySelector("#detailContent").innerHTML = `
    <div class="detail-grid">
      <section>
        <h3>ข้อมูลโรงแรม (Hotel Profile)</h3>
        <dl class="detail-list">
          <div><dt>รหัสโรงแรม (Hotel ID)</dt><dd>${escapeHtml(hotel.hotel_id)}</dd></div>
          <div><dt>จังหวัด (Location)</dt><dd>${escapeHtml(hotel.location)}</dd></div>
          <div><dt>คะแนนเฉลี่ย (Rating)</dt><dd>${hotel.rating.toFixed(1)} / 5.0</dd></div>
          <div><dt>ราคาต่อคืน (Nightly Rate)</dt><dd>${money(hotel.price_per_night)}</dd></div>
          <div><dt>สิ่งอำนวยความสะดวก (Amenities)</dt><dd>${escapeHtml(translateAmenities(hotel.amenities))}</dd></div>
        </dl>
      </section>
      <section>
        <h3>ผลการดำเนินงาน (Performance)</h3>
        <dl class="detail-list">
          <div><dt>รายได้สะสม (Revenue)</dt><dd>${money(hotel.revenue)}</dd></div>
          <div><dt>จำนวนจองทั้งหมด (Bookings)</dt><dd>${hotel.bookings} ครั้ง</dd></div>
          <div><dt>ยกเลิกแล้ว (Cancelled)</dt><dd>${hotel.cancelled} ครั้ง</dd></div>
          <div><dt>รอดำเนินการ (Pending)</dt><dd>${hotel.pending} ครั้ง</dd></div>
          <div><dt>มูลค่าการจองเฉลี่ย (Avg Booking Value)</dt><dd>${money(hotel.averageBookingValue)}</dd></div>
        </dl>
      </section>
    </div>
    <section>
      <h3>รายการจองที่เกี่ยวข้อง (Related Bookings)</h3>
      <div class="related-list">
        ${rows.map((row) => `
          <button class="related-item" type="button" data-detail-booking="${escapeHtml(row.booking_id)}">
            <strong>${escapeHtml(row.booking_id)}</strong>
            <span>${escapeHtml(STATUS_LABELS[row.status] || row.status)} · ${money(row.total_price)} · ${escapeHtml(row.check_in)}</span>
          </button>
        `).join("") || `<p class="empty-state">ไม่มีรายการจองสำหรับโรงแรมนี้</p>`}
      </div>
    </section>
  `;
  document.querySelectorAll("#detailContent [data-detail-booking]").forEach((button) => {
    button.addEventListener("click", () => openBookingDetail(state, button.dataset.detailBooking));
  });
  document.querySelector("#detailDialog").showModal();
}

function renderAlertBadges(alerts) {
  return alerts.slice(0, 3).map((alert) => `
    <span class="alert-badge ${alert.severity.toLowerCase()}" title="${escapeHtml(translateAlert(alert).title)}">${escapeHtml(ALERT_BADGE_LABELS[alert.type] || alert.type)}</span>
  `).join("") + (alerts.length > 3 ? `<span class="muted">+${alerts.length - 3}</span>` : "");
}

function renderAlertDetail(alert) {
  const t = translateAlert(alert);
  return `
    <article class="alert-detail ${alert.severity.toLowerCase()}">
      <h4>${escapeHtml(t.title)}</h4>
      <p><strong>${escapeHtml(t.severityLabel)}</strong> · ${escapeHtml(alert.type)}</p>
      <p>${escapeHtml(t.reason)}</p>
      <p><strong>การดำเนินการที่แนะนำ (Action):</strong> ${escapeHtml(t.action)}</p>
    </article>
  `;
}

function bindFilter(selector, eventName, update) {
  document.querySelector(selector).addEventListener(eventName, (event) => update(event.target.value));
}

function fillSelect(selector, values, labelsMap = {}) {
  document.querySelector(selector).innerHTML = values.map((value) => {
    const label = labelsMap[value] || value;
    return `
    <option value="${escapeHtml(value)}">${escapeHtml(label)}</option>
  `;
  }).join("");
}

function showBanner(message, type = "info") {
  const banner = document.querySelector("#statusBanner");
  banner.hidden = false;
  banner.className = `status-banner ${type}`;
  banner.textContent = message;
  window.setTimeout(() => {
    banner.hidden = true;
  }, 4000);
}

function money(value) {
  return moneyFormatter.format(value || 0);
}

function number(value) {
  return numberFormatter.format(value || 0);
}

function statusClass(status) {
  return String(status || "").toLowerCase().replace("_", "-");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
