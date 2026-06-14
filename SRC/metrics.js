import { groupBy } from "./data.js";

const ACTIVE_STATUSES = new Set(["CONFIRMED", "CHECKED_IN"]);

export function calculateMetrics(data) {
  const { hotels, derivedBookings } = data;
  const totalRevenue = sum(derivedBookings, "total_price");
  const activeRevenue = sum(derivedBookings.filter((row) => ACTIVE_STATUSES.has(row.status)), "total_price");
  const checkedOutRevenue = sum(derivedBookings.filter((row) => row.status === "CHECKED_OUT"), "total_price");
  const cancelledBookings = derivedBookings.filter((row) => row.status === "CANCELLED");
  const pendingBookings = derivedBookings.filter((row) => row.status === "PENDING");
  const cancelledRevenue = sum(cancelledBookings, "total_price");
  const pendingAmount = sum(pendingBookings, "total_price");
  const cancelRate = percent(cancelledBookings.length, derivedBookings.length);
  const averageHotelRating = average(hotels, "rating");
  const averageNightlyPrice = average(hotels, "price_per_night");
  const averageBookingValue = average(derivedBookings, "total_price");

  const revenueByMonth = aggregateByMonth(derivedBookings);
  const statusDistribution = aggregateStatus(derivedBookings);
  const revenueByLocation = aggregateByLocation(derivedBookings);
  const hotelPerformance = aggregateHotels(hotels, data.bookingsByHotelId);

  return {
    counts: {
      hotels: hotels.length,
      bookings: derivedBookings.length,
      cancelled: cancelledBookings.length,
      pending: pendingBookings.length
    },
    revenue: {
      total: totalRevenue,
      active: activeRevenue,
      checkedOut: checkedOutRevenue,
      cancelled: cancelledRevenue,
      pending: pendingAmount
    },
    rates: {
      cancel: cancelRate
    },
    averages: {
      hotelRating: round(averageHotelRating, 2),
      nightlyPrice: round(averageNightlyPrice, 0),
      bookingValue: round(averageBookingValue, 0)
    },
    revenueByMonth,
    statusDistribution,
    revenueByLocation,
    hotelPerformance,
    topLocations: revenueByLocation.slice(0, 5),
    worstLocations: [...revenueByLocation].sort((a, b) => a.revenue - b.revenue).slice(0, 5),
    topHotels: hotelPerformance.slice(0, 8)
  };
}

function aggregateByMonth(bookings) {
  const grouped = groupBy(bookings, (row) => row.check_in.slice(0, 7));
  return [...grouped.entries()]
    .map(([month, rows]) => ({
      month,
      bookings: rows.length,
      revenue: sum(rows, "total_price"),
      cancelled: rows.filter((row) => row.status === "CANCELLED").length
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function aggregateStatus(bookings) {
  const grouped = groupBy(bookings, (row) => row.status);
  return [...grouped.entries()]
    .map(([status, rows]) => ({
      status,
      count: rows.length,
      revenue: sum(rows, "total_price")
    }))
    .sort((a, b) => b.count - a.count);
}

function aggregateByLocation(bookings) {
  const grouped = groupBy(bookings, (row) => row.location);
  return [...grouped.entries()]
    .map(([location, rows]) => {
      const cancelled = rows.filter((row) => row.status === "CANCELLED");
      return {
        location,
        bookings: rows.length,
        revenue: sum(rows, "total_price"),
        cancelled: cancelled.length,
        cancelledAmount: sum(cancelled, "total_price"),
        cancelRate: percent(cancelled.length, rows.length),
        pendingAmount: sum(rows.filter((row) => row.status === "PENDING"), "total_price")
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

function aggregateHotels(hotels, bookingsByHotelId) {
  return hotels.map((hotel) => {
    const rows = bookingsByHotelId.get(hotel.hotel_id) || [];
    const cancelled = rows.filter((row) => row.status === "CANCELLED");
    const pending = rows.filter((row) => row.status === "PENDING");
    return {
      hotel_id: hotel.hotel_id,
      name: hotel.name,
      location: hotel.location,
      rating: hotel.rating,
      price_per_night: hotel.price_per_night,
      amenities: hotel.amenities,
      bookings: rows.length,
      revenue: sum(rows, "total_price"),
      cancelled: cancelled.length,
      cancelledAmount: sum(cancelled, "total_price"),
      pending: pending.length,
      pendingAmount: sum(pending, "total_price"),
      averageBookingValue: rows.length ? round(sum(rows, "total_price") / rows.length, 0) : 0
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function average(rows, key) {
  if (!rows.length) return 0;
  return sum(rows, key) / rows.length;
}

function percent(part, total) {
  if (!total) return 0;
  return round((part / total) * 100, 2);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
