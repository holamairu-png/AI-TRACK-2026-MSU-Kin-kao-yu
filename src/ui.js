import { generateAnomalySpotlight, generateExecutiveBrief } from "./ai.js";

const moneyFormatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0
});
const numberFormatter = new Intl.NumberFormat("th-TH");
const severityOrder = { CRITICAL: 3, WARNING: 2, INFO: 1 };

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
  freshness.textContent = `${data.hotels.length} hotels • ${data.bookings.length} bookings analyzed`;
  if (data.warnings.length) {
    showBanner(`${data.warnings.length} data warnings found. Check JSON schema.`, "warning");
  }
}

function renderDashboard(state) {
  const { metrics, audit } = state;
  const kpis = [
    ["Total Booking Value", money(metrics.revenue.total), `${metrics.counts.bookings} bookings`],
    ["Active Booking Value", money(metrics.revenue.active), "CONFIRMED + CHECKED_IN"],
    ["Pending Follow-up Value", money(metrics.revenue.pending), `${metrics.counts.pending} pending bookings`],
    ["Lost / Cancelled Value", money(metrics.revenue.cancelled), `${metrics.rates.cancel}% cancel rate`],
    ["Critical Issues", number(audit.summary.critical), `${audit.summary.total_alerts} total alerts`],
    ["Average Hotel Rating", metrics.averages.hotelRating.toFixed(2), `${money(metrics.averages.nightlyPrice)} avg nightly`]
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
  target.insertAdjacentHTML("beforeend", `
    <div class="top-alert-card">
      <span class="alert-badge ${topAlert.severity.toLowerCase()}">${escapeHtml(topAlert.severity)}</span>
      <strong>${escapeHtml(topAlert.title)}</strong>
      <p>${escapeHtml(topAlert.reason)}</p>
      <button class="table-button" type="button" data-top-alert-booking="${escapeHtml(topAlert.booking_id || "")}">Open top issue</button>
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
    const value = money(row[valueKey]);
    const isMax = row[valueKey] === max;
    const isLatest = index === rows.length - 1;
    const showValue = isMax || isLatest;
    const tone = isMax ? " peak" : isLatest ? " latest" : "";
    return `
      <div class="column-bar${tone}" title="${escapeHtml(`${row[labelKey]} ${value}`)}">
        <strong>${showValue ? escapeHtml(value) : ""}</strong>
        <div class="column-track">
          <div class="column-fill" style="height:${height}%"></div>
        </div>
        <span>${escapeHtml(formatMonthLabel(row[labelKey], index))}</span>
      </div>
    `;
  }).join("");
  document.querySelector(selector).innerHTML = html
    ? `<div class="column-chart">${html}</div>`
    : `<p class="empty-state">No chart data</p>`;
}

function formatMonthLabel(value, index) {
  const [year, month] = String(value).split("-");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
            <strong>Location intensity</strong>
            <span>Darker tiles indicate higher booking value in this portfolio.</span>
          </div>
        </div>
      </div>
    `
    : `<p class="empty-state">No chart data</p>`;
}

function renderStatusChart(rows) {
  const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
  document.querySelector("#statusChart").innerHTML = rows.map((row) => {
    const percent = Math.round((row.count / total) * 100);
    return `
      <div class="status-row">
        <span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status)}</span>
        <div class="bar-track"><div class="bar-fill ${statusClass(row.status)}" style="width:${percent}%"></div></div>
        <strong>${row.count}</strong>
      </div>
    `;
  }).join("");
}

function setupBookingFilters(state) {
  fillSelect("#statusFilter", ["ALL", ...state.data.statuses]);
  fillSelect("#locationFilter", ["ALL", ...state.data.locations]);
  fillSelect("#alertFilter", ["ALL", ...Object.keys(state.audit.summary.by_type).sort()]);

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
  document.querySelector("#bookingTableCaption").textContent = `${rows.length} bookings shown from hotel_bookings.json`;
  document.querySelector("#bookingTableBody").innerHTML = rows.map((row) => {
    const alerts = state.audit.alertsByBookingId.get(row.booking_id) || [];
    const topSeverity = alerts.reduce((severity, alert) => {
      return severityOrder[alert.severity] > severityOrder[severity] ? alert.severity : severity;
    }, "INFO");
    return `
      <tr>
        <td><strong>${escapeHtml(row.booking_id)}</strong><br><span class="muted">${escapeHtml(row.user_id)}</span></td>
        <td>${escapeHtml(row.hotelName)}<br><span class="muted">${escapeHtml(row.location)} · ${row.rating.toFixed(1)} rating</span></td>
        <td>${escapeHtml(row.check_in)} → ${escapeHtml(row.check_out)}<br><span class="muted">${row.nights ?? "?"} nights · ${row.guests} guests</span></td>
        <td><span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
        <td>${money(row.total_price)}</td>
        <td>${alerts.length ? renderAlertBadges(alerts) : `<span class="muted">No alert</span>`}</td>
        <td><button class="table-button" type="button" data-detail-booking="${escapeHtml(row.booking_id)}">Open</button></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="7" class="empty-state">No bookings match the filters.</td></tr>`;

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
      const text = [row.booking_id, row.user_id, row.hotelName, row.location, row.status, row.hotel_id].join(" ").toLowerCase();
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
  fillSelect("#hotelLocationFilter", ["ALL", ...state.data.locations]);
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
      <span>${escapeHtml(amenity)}</span>
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
    button.textContent = "All amenities";
  } else if (selectedAmenities.length === 1) {
    button.textContent = selectedAmenities[0];
  } else {
    button.textContent = `${selectedAmenities.length} amenities selected`;
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
        <div><dt>Revenue</dt><dd>${money(hotel.revenue)}</dd></div>
        <div><dt>Bookings</dt><dd>${hotel.bookings}</dd></div>
        <div><dt>Rating</dt><dd>${hotel.rating.toFixed(1)}</dd></div>
        <div><dt>Nightly</dt><dd>${money(hotel.price_per_night)}</dd></div>
      </dl>
      <p class="amenities">${hotel.amenities.slice(0, 5).map(escapeHtml).join(" · ")}</p>
      <button class="secondary-button" type="button" data-detail-hotel="${escapeHtml(hotel.hotel_id)}">Open hotel</button>
    </article>
  `).join("") || `<p class="empty-state">No hotels match the filters.</p>`;

  document.querySelectorAll("[data-detail-hotel]").forEach((button) => {
    button.addEventListener("click", () => openHotelDetail(state, button.dataset.detailHotel));
  });
}

function renderHotelResultSummary(state, rows) {
  const filters = state.hotelFilters;
  const chips = [];
  if (filters.search.trim()) chips.push(`search: "${filters.search.trim()}"`);
  if (filters.location !== "ALL") chips.push(`location: ${filters.location}`);
  if (filters.minRating) chips.push(`rating >= ${filters.minRating}`);
  if (filters.maxPrice) chips.push(`nightly <= ${money(Number(filters.maxPrice))}`);
  if (filters.amenities.length) chips.push(`amenities: ${filters.amenities.join(", ")}`);

  const summary = document.querySelector("#hotelResultSummary");
  summary.innerHTML = `
    <strong>Showing ${rows.length} of ${state.metrics.hotelPerformance.length} hotels</strong>
    ${chips.length ? `<span>Filters: ${chips.map(escapeHtml).join(" · ")}</span>` : `<span>No filters applied</span>`}
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
      label: "Generating executive summary...",
      action: () => generateExecutiveBrief({ payload: state.aiPayload })
    });
  });
  document.querySelector("#generateSpotlightButton").addEventListener("click", async () => {
    await runAiAction({
      outputSelector: "#spotlightOutput",
      label: "Analyzing top alert...",
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
    output.textContent = `AI request failed. Showing local fallback is recommended. ${error.message}`;
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

function openBookingDetail(state, bookingId) {
  const row = state.data.derivedBookings.find((booking) => booking.booking_id === bookingId);
  const alerts = state.audit.alertsByBookingId.get(bookingId) || [];
  if (!row) return;
  document.querySelector("#detailTitle").textContent = `Booking ${row.booking_id}`;
  document.querySelector("#detailContent").innerHTML = `
    <div class="detail-grid">
      <section>
        <h3>Booking</h3>
        <dl class="detail-list">
          <div><dt>User</dt><dd>${escapeHtml(row.user_id)}</dd></div>
          <div><dt>Status</dt><dd><span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status)}</span></dd></div>
          <div><dt>Stay</dt><dd>${escapeHtml(row.check_in)} → ${escapeHtml(row.check_out)} (${row.nights ?? "?"} nights)</dd></div>
          <div><dt>Guests</dt><dd>${row.guests}</dd></div>
          <div><dt>Total price</dt><dd>${money(row.total_price)}</dd></div>
        </dl>
      </section>
      <section>
        <h3>Hotel</h3>
        <dl class="detail-list">
          <div><dt>Name</dt><dd>${escapeHtml(row.hotelName)}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(row.location)}</dd></div>
          <div><dt>Rating</dt><dd>${row.rating.toFixed(1)}</dd></div>
          <div><dt>Nightly rate</dt><dd>${money(row.pricePerNight)}</dd></div>
          <div><dt>Amenities</dt><dd>${escapeHtml(row.hotel?.amenities?.join(", ") || "Unknown")}</dd></div>
        </dl>
      </section>
    </div>
    <section class="calculation-box">
      <h3>Price Calculation</h3>
      <p>${money(row.pricePerNight)} × ${row.nights ?? "?"} nights = <strong>${row.expectedPrice === null ? "Unknown" : money(row.expectedPrice)}</strong></p>
      <p>Actual total: <strong>${money(row.total_price)}</strong> · Difference: <strong>${row.priceDiff === null ? "Unknown" : money(row.priceDiff)}</strong></p>
    </section>
    <section>
      <h3>Alerts & Suggested Actions</h3>
      ${alerts.length ? alerts.map(renderAlertDetail).join("") : `<p class="empty-state">No alert for this booking.</p>`}
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
        <h3>Hotel profile</h3>
        <dl class="detail-list">
          <div><dt>Hotel ID</dt><dd>${escapeHtml(hotel.hotel_id)}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(hotel.location)}</dd></div>
          <div><dt>Rating</dt><dd>${hotel.rating.toFixed(1)}</dd></div>
          <div><dt>Nightly rate</dt><dd>${money(hotel.price_per_night)}</dd></div>
          <div><dt>Amenities</dt><dd>${escapeHtml(hotel.amenities.join(", "))}</dd></div>
        </dl>
      </section>
      <section>
        <h3>Performance</h3>
        <dl class="detail-list">
          <div><dt>Revenue</dt><dd>${money(hotel.revenue)}</dd></div>
          <div><dt>Bookings</dt><dd>${hotel.bookings}</dd></div>
          <div><dt>Cancelled</dt><dd>${hotel.cancelled}</dd></div>
          <div><dt>Pending</dt><dd>${hotel.pending}</dd></div>
          <div><dt>Avg booking value</dt><dd>${money(hotel.averageBookingValue)}</dd></div>
        </dl>
      </section>
    </div>
    <section>
      <h3>Related bookings</h3>
      <div class="related-list">
        ${rows.map((row) => `
          <button class="related-item" type="button" data-detail-booking="${escapeHtml(row.booking_id)}">
            <strong>${escapeHtml(row.booking_id)}</strong>
            <span>${escapeHtml(row.status)} · ${money(row.total_price)} · ${escapeHtml(row.check_in)}</span>
          </button>
        `).join("") || `<p class="empty-state">No bookings for this hotel.</p>`}
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
    <span class="alert-badge ${alert.severity.toLowerCase()}">${escapeHtml(alert.type)}</span>
  `).join("") + (alerts.length > 3 ? `<span class="muted">+${alerts.length - 3}</span>` : "");
}

function renderAlertDetail(alert) {
  return `
    <article class="alert-detail ${alert.severity.toLowerCase()}">
      <h4>${escapeHtml(alert.title)}</h4>
      <p><strong>${escapeHtml(alert.severity)}</strong> · ${escapeHtml(alert.type)}</p>
      <p>${escapeHtml(alert.reason)}</p>
      <p><strong>Action:</strong> ${escapeHtml(alert.action)}</p>
    </article>
  `;
}

function bindFilter(selector, eventName, update) {
  document.querySelector(selector).addEventListener(eventName, (event) => update(event.target.value));
}

function fillSelect(selector, values) {
  document.querySelector(selector).innerHTML = values.map((value) => `
    <option value="${escapeHtml(value)}">${escapeHtml(value)}</option>
  `).join("");
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
