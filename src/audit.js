const SEVERITY_SCORE = {
  CRITICAL: 3,
  WARNING: 2,
  INFO: 1
};

export function buildAuditModel(data, metrics) {
  const referenceDate = startOfDay(new Date());
  const alerts = [];
  const alertsByBookingId = new Map();
  const highValueThreshold = Math.max(metrics.averages.bookingValue * 1.4, 15000);

  data.derivedBookings.forEach((booking) => {
    const bookingAlerts = auditBooking(booking, { referenceDate, highValueThreshold });
    bookingAlerts.forEach((alert) => {
      alerts.push(alert);
      if (!alertsByBookingId.has(alert.booking_id)) alertsByBookingId.set(alert.booking_id, []);
      alertsByBookingId.get(alert.booking_id).push(alert);
    });
  });

  const performanceAlerts = auditHotelAndLocationPerformance(metrics);
  performanceAlerts.forEach((alert) => alerts.push(alert));

  const sortedAlerts = alerts.sort((a, b) => {
    const severityDiff = SEVERITY_SCORE[b.severity] - SEVERITY_SCORE[a.severity];
    if (severityDiff) return severityDiff;
    return (b.amount || 0) - (a.amount || 0);
  });

  return {
    alerts: sortedAlerts,
    alertsByBookingId,
    summary: summarizeAlerts(sortedAlerts),
    response: buildOpsAlertsResponse(sortedAlerts),
    referenceDate,
    highValueThreshold
  };
}

function auditBooking(booking, context) {
  const alerts = [];

  if (!booking.hotel) {
    alerts.push(alert({
      booking,
      type: "MISSING_HOTEL_ID",
      severity: "CRITICAL",
      title: "Hotel ID missing from master data",
      reason: `${booking.hotel_id} is not present in hotels.json`,
      action: "Hold confirmation and verify hotel master data before contacting guest"
    }));
  }

  if (!booking.checkInDate || !booking.checkOutDate || booking.nights <= 0) {
    alerts.push(alert({
      booking,
      type: "INVALID_DATES",
      severity: "CRITICAL",
      title: "Invalid stay dates",
      reason: "Check-out date must be after check-in date",
      action: "Correct stay dates before sending booking to the hotel"
    }));
  }

  if (booking.expectedPrice !== null && booking.nights > 0 && booking.priceDiff !== 0) {
    alerts.push(alert({
      booking,
      type: "PRICE_MISMATCH",
      severity: "CRITICAL",
      title: "Booking total does not match nightly rate",
      reason: `${formatMoney(booking.pricePerNight)} x ${booking.nights} nights = ${formatMoney(booking.expectedPrice)}, actual ${formatMoney(booking.total_price)}`,
      action: "Verify rate plan before confirming with guest",
      expected_price: booking.expectedPrice,
      actual_price: booking.total_price,
      diff: booking.priceDiff,
      amount: Math.abs(booking.priceDiff)
    }));
  }

  if (booking.status === "PENDING") {
    const daysUntilCheckIn = booking.checkInDate
      ? Math.ceil((startOfDay(booking.checkInDate).getTime() - context.referenceDate.getTime()) / 86400000)
      : null;

    if (daysUntilCheckIn !== null && daysUntilCheckIn < 0) {
      alerts.push(alert({
        booking,
        type: "PAST_DUE_PENDING",
        severity: "CRITICAL",
        title: "Pending booking is past check-in date",
        reason: `Check-in was ${Math.abs(daysUntilCheckIn)} days ago and status is still PENDING`,
        action: "Contact hotel and guest immediately to reconcile booking status",
        amount: booking.total_price
      }));
    } else if (daysUntilCheckIn !== null && daysUntilCheckIn <= 7) {
      alerts.push(alert({
        booking,
        type: "UPCOMING_UNCONFIRMED",
        severity: "INFO",
        title: "Upcoming booking is not confirmed",
        reason: `Check-in is in ${daysUntilCheckIn} days and status is still PENDING`,
        action: "Follow up before arrival to prevent service failure",
        amount: booking.total_price
      }));
    }
  }

  if (booking.status === "CANCELLED") {
    alerts.push(alert({
      booking,
      type: "CANCELLATION_IMPACT",
      severity: booking.total_price >= context.highValueThreshold ? "WARNING" : "INFO",
      title: "Cancelled booking impact",
      reason: `${formatMoney(booking.total_price)} was removed from booking value`,
      action: "Review cancellation reason and consider retention follow-up",
      amount: booking.total_price
    }));
  }

  if (booking.status !== "CANCELLED" && booking.total_price >= context.highValueThreshold) {
    alerts.push(alert({
      booking,
      type: "HIGH_VALUE_BOOKING",
      severity: "INFO",
      title: "High-value booking",
      reason: `${formatMoney(booking.total_price)} is above the high-value threshold ${formatMoney(context.highValueThreshold)}`,
      action: "Prioritize service readiness and confirmation accuracy",
      amount: booking.total_price
    }));
  }

  return alerts;
}

function auditHotelAndLocationPerformance(metrics) {
  const alerts = [];
  const avgCancelRate = metrics.rates.cancel;

  metrics.revenueByLocation.forEach((location) => {
    if (location.bookings >= 2 && location.cancelRate > avgCancelRate && location.cancelledAmount > 0) {
      alerts.push({
        id: `loc-${slug(location.location)}-cancel-watch`,
        type: "LOCATION_CANCEL_WATCH",
        severity: "INFO",
        title: "Location cancellation watch",
        scope: "location",
        location: location.location,
        reason: `${location.location} cancel rate is ${location.cancelRate}% vs portfolio ${avgCancelRate}%`,
        action: "Check supply, policies, or guest experience patterns for this location",
        amount: location.cancelledAmount
      });
    }
  });

  metrics.hotelPerformance.forEach((hotel) => {
    if (hotel.rating >= 4.6 && hotel.bookings <= 1 && hotel.revenue === 0) {
      alerts.push({
        id: `${hotel.hotel_id}-performance-watch`,
        type: "HOTEL_PERFORMANCE_WATCH",
        severity: "INFO",
        title: "High-rated hotel with no booking traction",
        scope: "hotel",
        hotel_id: hotel.hotel_id,
        hotel_name: hotel.name,
        location: hotel.location,
        reason: `${hotel.name} has rating ${hotel.rating} but no booking revenue in this dataset`,
        action: "Review visibility, pricing, or package positioning",
        amount: 0
      });
    }
  });

  return alerts;
}

function alert({ booking, ...details }) {
  return {
    id: `${booking.booking_id}-${details.type}`,
    scope: "booking",
    booking_id: booking.booking_id,
    user_id: booking.user_id,
    hotel_id: booking.hotel_id,
    hotel_name: booking.hotelName,
    location: booking.location,
    check_in: booking.check_in,
    check_out: booking.check_out,
    status: booking.status,
    total_price: booking.total_price,
    amount: details.amount ?? booking.total_price,
    ...details
  };
}

function summarizeAlerts(alerts) {
  return alerts.reduce((summary, alertItem) => {
    summary.total_alerts += 1;
    summary[alertItem.severity.toLowerCase()] += 1;
    summary.by_type[alertItem.type] = (summary.by_type[alertItem.type] || 0) + 1;
    return summary;
  }, {
    total_alerts: 0,
    critical: 0,
    warning: 0,
    info: 0,
    by_type: {}
  });
}

function buildOpsAlertsResponse(alerts) {
  return {
    endpoint: "GET /ops/alerts",
    generated_at: new Date().toISOString(),
    summary: summarizeAlerts(alerts),
    alerts: alerts.map((alertItem) => ({
      id: alertItem.id,
      type: alertItem.type,
      severity: alertItem.severity,
      scope: alertItem.scope,
      booking_id: alertItem.booking_id,
      hotel_id: alertItem.hotel_id,
      hotel_name: alertItem.hotel_name,
      location: alertItem.location,
      status: alertItem.status,
      expected_price: alertItem.expected_price,
      actual_price: alertItem.actual_price,
      diff: alertItem.diff,
      reason: alertItem.reason,
      action: alertItem.action
    }))
  };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatMoney(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0
  }).format(value || 0);
}
