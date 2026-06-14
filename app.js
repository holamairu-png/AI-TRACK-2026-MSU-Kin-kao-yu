import { loadData } from "./src/data.js";
import { calculateMetrics } from "./src/metrics.js";
import { buildAuditModel } from "./src/audit.js";
import { createAiPayload } from "./src/ai.js";
import { initUi } from "./src/ui.js";

async function boot() {
  const data = await loadData({
    hotelsUrl: "./hotels.json",
    bookingsUrl: "./hotel_bookings.json"
  });

  const metrics = calculateMetrics(data);
  const audit = buildAuditModel(data, metrics);
  const aiPayload = createAiPayload(data, metrics, audit);

  initUi({ data, metrics, audit, aiPayload });
}

boot().catch((error) => {
  const banner = document.querySelector("#statusBanner");
  if (banner) {
    banner.hidden = false;
    banner.className = "status-banner error";
    banner.textContent = `Could not load app data: ${error.message}`;
  }
  console.error(error);
});
