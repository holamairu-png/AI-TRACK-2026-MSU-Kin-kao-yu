const REQUIRED_HOTEL_FIELDS = ["hotel_id", "name", "location", "rating", "price_per_night", "amenities"];
const REQUIRED_BOOKING_FIELDS = ["booking_id", "user_id", "hotel_id", "check_in", "check_out", "guests", "total_price", "status"];

export async function loadData({ hotelsUrl, bookingsUrl }) {
  const [hotels, bookings] = await Promise.all([
    fetchJson(hotelsUrl),
    fetchJson(bookingsUrl)
  ]);

  assertArray("hotels", hotels);
  assertArray("bookings", bookings);

  const hotelWarnings = validateRows(hotels, REQUIRED_HOTEL_FIELDS, "hotel");
  const bookingWarnings = validateRows(bookings, REQUIRED_BOOKING_FIELDS, "booking");
  const hotelById = new Map(hotels.map((hotel) => [hotel.hotel_id, normalizeHotel(hotel)]));
  const normalizedBookings = bookings.map(normalizeBooking);
  const derivedBookings = normalizedBookings.map((booking) => deriveBookingRow(booking, hotelById));
  const bookingsByHotelId = groupBy(derivedBookings, (row) => row.hotel_id);
  const locations = unique(hotels.map((hotel) => hotel.location)).sort(compareText);
  const statuses = unique(bookings.map((booking) => booking.status)).sort(compareText);
  const amenities = unique(hotels.flatMap((hotel) => hotel.amenities)).sort(compareText);

  return {
    hotels: hotels.map(normalizeHotel),
    bookings: normalizedBookings,
    derivedBookings,
    hotelById,
    bookingsByHotelId,
    locations,
    statuses,
    amenities,
    warnings: [...hotelWarnings, ...bookingWarnings],
    loadedAt: new Date()
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function assertArray(name, value) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be a JSON array`);
  }
}

function validateRows(rows, fields, label) {
  const warnings = [];
  rows.forEach((row, index) => {
    fields.forEach((field) => {
      if (!(field in row)) {
        warnings.push(`${label} row ${index + 1} is missing ${field}`);
      }
    });
  });
  return warnings;
}

function normalizeHotel(hotel) {
  return {
    ...hotel,
    rating: Number(hotel.rating) || 0,
    price_per_night: Number(hotel.price_per_night) || 0,
    amenities: Array.isArray(hotel.amenities) ? hotel.amenities : []
  };
}

function normalizeBooking(booking) {
  return {
    ...booking,
    guests: Number(booking.guests) || 0,
    total_price: Number(booking.total_price) || 0,
    checkInDate: parseDate(booking.check_in),
    checkOutDate: parseDate(booking.check_out)
  };
}

function deriveBookingRow(booking, hotelById) {
  const hotel = hotelById.get(booking.hotel_id) || null;
  const nights = booking.checkInDate && booking.checkOutDate
    ? dayDiff(booking.checkInDate, booking.checkOutDate)
    : null;
  const expectedPrice = hotel && Number.isFinite(nights)
    ? nights * hotel.price_per_night
    : null;

  return {
    ...booking,
    hotel,
    hotelName: hotel?.name || "Missing hotel",
    location: hotel?.location || "Unknown",
    rating: hotel?.rating || 0,
    pricePerNight: hotel?.price_per_night || 0,
    nights,
    expectedPrice,
    priceDiff: expectedPrice === null ? null : booking.total_price - expectedPrice
  };
}

function parseDate(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function dayDiff(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function groupBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function compareText(a, b) {
  return String(a).localeCompare(String(b));
}
