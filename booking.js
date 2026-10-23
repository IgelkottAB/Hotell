
document.addEventListener("DOMContentLoaded", () => {
  const cfg = window.HOTEL_CONFIG || {};
  const $ = id => document.getElementById(id);

  const configured =
    window.supabase &&
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_PUBLISHABLE_KEY &&
    !cfg.SUPABASE_URL.includes("KListra_") &&
    !cfg.SUPABASE_PUBLISHABLE_KEY.includes("KListra_");

  const db = configured
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_PUBLISHABLE_KEY
      )
    : null;

  let selectedRoom = null;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const nextDay = new Date(tomorrow);
  nextDay.setDate(nextDay.getDate() + 1);

  const dateString = date =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  $("check-in").value = dateString(tomorrow);
  $("check-out").value = dateString(nextDay);
  $("check-in").min = dateString(tomorrow);
  $("check-out").min = dateString(nextDay);

  $("check-in").addEventListener("change", () => {
    const date = new Date($("check-in").value + "T12:00:00");
    date.setDate(date.getDate() + 1);
    $("check-out").min = dateString(date);

    if ($("check-out").value <= $("check-in").value) {
      $("check-out").value = dateString(date);
    }
  });

  const money = value =>
    new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: "SEK",
      maximumFractionDigits: 0
    }).format(Number(value || 0));

  const safe = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  $("search-form").addEventListener("submit", async event => {
    event.preventDefault();

    const message = $("search-message");
    const results = $("room-results");
    const panel = $("booking-panel");

    results.replaceChildren();
    panel.hidden = true;
    selectedRoom = null;

    if (!db) {
      message.textContent =
        "Supabase är inte konfigurerat. Kontrollera js/config.js.";
      return;
    }

    const checkIn = $("check-in").value;
    const checkOut = $("check-out").value;

    if (!checkIn || !checkOut || checkOut <= checkIn) {
      message.textContent =
        "Utcheckningsdatumet måste vara efter incheckningsdatumet.";
      return;
    }

    message.textContent = "Söker lediga rum…";

    const { data, error } = await db.rpc("search_hotel_rooms", {
      p_hotel_id: cfg.HOTEL_ID,
      p_check_in: checkIn,
      p_check_out: checkOut,
      p_guest_count: Number($("guest-count").value),
      p_needs_balcony: $("balcony").checked,
      p_needs_wheelchair_access: $("wheelchair").checked
    });

    if (error) {
      message.textContent = "Sökningen misslyckades: " + error.message;
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      message.textContent = "Inga lediga rum hittades.";
      return;
    }

    message.textContent = `Hittade ${data.length} rum.`;

    data.forEach(room => {
      const card = document.createElement("article");
      card.className = "room-card";

      const name =
        room.room_name ||
        room.room_type ||
        room.name ||
        `Rum ${room.room_number || ""}`;

      const price =
        room.total_price ??
        room.total_amount ??
        room.total ??
        Number(room.price_per_night || room.nightly_price || 0);

      card.innerHTML = `
        <h3>${safe(name)}</h3>
        <p>${safe(room.description || "Rum för valda datum.")}</p>
        <p class="price">${money(price)}</p>
        <button type="button">Välj rum</button>
      `;

      card.querySelector("button").addEventListener("click", () => {
        selectedRoom = room;
        $("selected-room").textContent = `Valt rum: ${name}.`;
        $("booking-panel").hidden = false;
        $("booking-result").hidden = true;
        $("booking-panel").scrollIntoView({ behavior: "smooth" });
      });

      results.append(card);
    });
  });

  $("cancel-selection").addEventListener("click", () => {
    selectedRoom = null;
    $("booking-panel").hidden = true;
  });

  $("booking-form").addEventListener("submit", async event => {
    event.preventDefault();

    const result = $("booking-result");
    result.hidden = false;

    if (!db) {
      result.textContent = "Supabase är inte konfigurerat.";
      return;
    }

    if (!selectedRoom) {
      result.textContent = "Välj ett rum först.";
      return;
    }

    const roomId = selectedRoom.room_id || selectedRoom.id;

    if (!roomId) {
      result.textContent =
        "Sökresultatet saknar rums-ID. Databasens resultat behöver kontrolleras.";
      return;
    }

    const button = $("booking-form").querySelector(
      'button[type="submit"]'
    );

    button.disabled = true;
    button.textContent = "Skapar bokning…";

    try {
      const { data, error } = await db.rpc("create_hotel_booking", {
        p_hotel_id: cfg.HOTEL_ID,
        p_room_id: roomId,
        p_guest_name: $("guest-name").value.trim(),
        p_guest_email: $("guest-email").value.trim(),
        p_guest_count: Number($("guest-count").value),
        p_check_in: $("check-in").value,
        p_check_out: $("check-out").value,
        p_payment_method: $("payment-method").value
      });

      if (error) {
        result.textContent = "Bokningen misslyckades: " + error.message;
        return;
      }

      const booking = Array.isArray(data) ? data[0] : data;

      result.innerHTML = `
        <h3>Resultat</h3>
        <p>${safe(booking?.message || "Databasen tog emot svaret.")}</p>
        <p><strong>Bokningskod:</strong>
        ${safe(booking?.booking_code || booking?.confirmation_code || "Kontrollera bokningsresultatet i Supabase.")}</p>
        <p><strong>Status:</strong>
        ${safe(booking?.status || "Kontrollera status i Supabase.")}</p>
        <p class="small">Testversion – ingen riktig betalning har utförts.</p>
      `;
    } catch (error) {
      result.textContent = "Ett oväntat fel uppstod: " + error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Skapa testbokning";
    }
  });
});
