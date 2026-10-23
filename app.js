
(() => {
  "use strict";

  const config = window.HOTEL_CONFIG;

  const elements = {
    searchForm: document.getElementById("search-form"),
    checkIn: document.getElementById("check-in"),
    checkOut: document.getElementById("check-out"),
    guestCount: document.getElementById("guest-count"),
    balcony: document.getElementById("balcony"),
    wheelchair: document.getElementById("wheelchair"),
    searchButton: document.getElementById("search-button"),
    searchMessage: document.getElementById("search-message"),
    roomResults: document.getElementById("room-results"),
    bookingPanel: document.getElementById("booking-panel"),
    selectedRoom: document.getElementById("selected-room"),
    bookingForm: document.getElementById("booking-form"),
    guestName: document.getElementById("guest-name"),
    guestEmail: document.getElementById("guest-email"),
    paymentMethod: document.getElementById("payment-method"),
    bookButton: document.getElementById("book-button"),
    cancelSelection: document.getElementById("cancel-selection"),
    bookingResult: document.getElementById("booking-result")
  };

  let supabaseClient = null;
  let selectedRoom = null;
  let latestSearch = 0;

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(dateString, numberOfDays) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + numberOfDays);
    return localDateString(date);
  }

  function setMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: "SEK",
      maximumFractionDigits: 0
    }).format(Number(value));
  }

  function formatDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    return new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  function countNights(checkIn, checkOut) {
    const start = new Date(`${checkIn}T00:00:00Z`);
    const end = new Date(`${checkOut}T00:00:00Z`);
    return Math.round((end - start) / 86400000);
  }

  function validateDates(checkIn, checkOut) {
    if (!checkIn || !checkOut) {
      return "Välj både incheckning och utcheckning.";
    }

    const today = localDateString(new Date());
    const nights = countNights(checkIn, checkOut);

    if (checkIn < today) {
      return "Incheckningen kan inte vara före dagens datum.";
    }

    if (nights < 1) {
      return "Utcheckningen måste vara minst en dag efter incheckningen.";
    }

    if (nights > 365) {
      return "Du kan söka efter vistelser på högst 365 nätter.";
    }

    return "";
  }

  function resetBooking() {
    selectedRoom = null;
    elements.bookingPanel.hidden = true;
    elements.bookingResult.hidden = true;
    elements.bookingResult.textContent = "";
    elements.selectedRoom.textContent = "";
  }

  function showBookingRoom(room) {
    selectedRoom = room;

    const checkIn = elements.checkIn.value;
    const checkOut = elements.checkOut.value;
    const nights = countNights(checkIn, checkOut);

    elements.selectedRoom.replaceChildren();

    const title = document.createElement("h3");
    title.textContent = `${room.room_type} – rum ${room.room_number}`;

    const details = document.createElement("p");
    details.textContent =
      `${formatDate(checkIn)} till ${formatDate(checkOut)} · ` +
      `${nights} nätter · ${elements.guestCount.value} gäster`;

    const price = document.createElement("p");
    price.textContent = `Totalt: ${formatMoney(room.total_price)}`;

    elements.selectedRoom.append(title, details, price);
    elements.bookingPanel.hidden = false;
    elements.bookingResult.hidden = true;
    elements.bookingPanel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function createRoomCard(room) {
    const card = document.createElement("article");
    card.className = "room-card";

    const title = document.createElement("h3");
    title.textContent = room.room_type || "Hotellrum";

    const number = document.createElement("p");
    number.className = "room-number";
    number.textContent = `Rum ${room.room_number}`;

    const description = document.createElement("p");
    description.textContent = room.description || "Beskrivning saknas.";

    const features = document.createElement("p");
    const featureList = [
      `${room.capacity} bäddar`,
      room.has_balcony ? "Balkong" : "Ingen balkong",
      room.wheelchair_accessible
        ? "Rullstolsanpassat"
        : "Inte rullstolsanpassat"
    ];
    features.textContent = featureList.join(" · ");

    const price = document.createElement("p");
    price.className = "room-price";

    const pricePerNight = document.createElement("span");
    pricePerNight.textContent =
      `${formatMoney(room.price_per_night)} `;

    const perNight = document.createElement("small");
    perNight.textContent = "/ natt";

    const total = document.createElement("p");
    total.textContent =
      `Totalt för vistelsen: ${formatMoney(room.total_price)}`;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Välj detta rum";
    button.addEventListener("click", () => showBookingRoom(room));

    price.append(pricePerNight, perNight);
    card.append(title, number, description, features, price, total, button);

    return card;
  }

  async function searchRooms(event) {
    event.preventDefault();

    const validation = validateDates(
      elements.checkIn.value,
      elements.checkOut.value
    );

    if (validation) {
      setMessage(elements.searchMessage, validation, true);
      return;
    }

    if (!supabaseClient) {
      setMessage(
        elements.searchMessage,
        "Supabase är inte konfigurerat. Kontrollera js/config.js.",
        true
      );
      return;
    }

    const searchId = ++latestSearch;

    resetBooking();
    elements.roomResults.replaceChildren();
    elements.searchButton.disabled = true;
    setMessage(elements.searchMessage, "Söker efter lediga rum…");

    try {
      const { data, error } = await supabaseClient.rpc(
        "search_hotel_rooms",
        {
          p_hotel_id: config.HOTEL_ID,
          p_check_in: elements.checkIn.value,
          p_check_out: elements.checkOut.value,
          p_guest_count: Number(elements.guestCount.value),
          p_needs_balcony: elements.balcony.checked,
          p_needs_wheelchair_access: elements.wheelchair.checked
        }
      );

      if (searchId !== latestSearch) return;

      if (error) throw error;

      const rooms = Array.isArray(data) ? data : [];

      if (rooms.length === 0) {
        setMessage(
          elements.searchMessage,
          "Inga lediga rum hittades. Prova andra datum eller ändra dina val."
        );
        return;
      }

      const fragment = document.createDocumentFragment();

      rooms.forEach((room) => {
        fragment.appendChild(createRoomCard(room));
      });

      elements.roomResults.appendChild(fragment);
      setMessage(
        elements.searchMessage,
        `Vi hittade ${rooms.length} lediga rum.`
      );
    } catch (error) {
      console.error("Sökfel:", error);
      setMessage(
        elements.searchMessage,
        error.message || "Sökningen misslyckades. Försök igen.",
        true
      );
    } finally {
      if (searchId === latestSearch) {
        elements.searchButton.disabled = false;
      }
    }
  }

  async function createBooking(event) {
    event.preventDefault();

    if (!selectedRoom) {
      setMessage(
        elements.bookingResult,
        "Välj ett rum först.",
        true
      );
      elements.bookingResult.hidden = false;
      return;
    }

    const name = elements.guestName.value.trim();
    const email = elements.guestEmail.value.trim();

    if (!name || !email) {
      setMessage(
        elements.bookingResult,
        "Fyll i namn och e-postadress.",
        true
      );
      elements.bookingResult.hidden = false;
      return;
    }

    if (!supabaseClient) {
      setMessage(
        elements.bookingResult,
        "Supabase är inte konfigurerat.",
        true
      );
      elements.bookingResult.hidden = false;
      return;
    }

    elements.bookButton.disabled = true;
    elements.bookingResult.hidden = false;
    elements.bookingResult.className = "result";
    setMessage(elements.bookingResult, "Skapar bokningen…");

    try {
      const { data, error } = await supabaseClient.rpc(
        "create_hotel_booking",
        {
          p_hotel_id: config.HOTEL_ID,
          p_room_id: selectedRoom.id,
          p_guest_name: name,
          p_guest_email: email,
          p_guest_count: Number(elements.guestCount.value),
          p_check_in: elements.checkIn.value,
          p_check_out: elements.checkOut.value,
          p_payment_method: elements.paymentMethod.value
        }
      );

      if (error) throw error;

      const booking = Array.isArray(data) ? data[0] : data;

      if (!booking || !booking.booking_code) {
        throw new Error(
          "Bokningen skapades, men servern returnerade ingen bokningskod."
        );
      }

      const nights = Number(booking.nights);
      const totalPrice = Number(booking.total_price);

      elements.bookingResult.replaceChildren();
      elements.bookingResult.className = "result success";

      const heading = document.createElement("h3");
      heading.textContent = "Bokningen är skapad!";

      const codeLabel = document.createElement("p");
      codeLabel.textContent = "Din bokningskod:";

      const code = document.createElement("p");
      code.className = "booking-code";
      code.textContent = booking.booking_code;

      const total = document.createElement("p");
      total.textContent = `Totalpris: ${formatMoney(totalPrice)}`;

      const nightText = document.createElement("p");
      nightText.textContent = `Antal nätter: ${nights}`;

      const status = document.createElement("p");
      status.textContent =
        booking.status === "confirmed"
          ? "Status: Bekräftad. Betalning sker på hotellet."
          : `Status: ${booking.status}.`;

      const reminder = document.createElement("p");
      reminder.textContent =
        "Spara bokningskoden. Den här testversionen skickar inte e-postkvitton.";

      elements.bookingResult.append(
        heading, codeLabel, code, total, nightText, status, reminder
      );

      elements.bookingForm.reset();
      elements.bookButton.textContent = "Bokning skapad";

      // Uppdatera listan eftersom rummet nu kan vara upptaget.
      await searchRooms(new Event("submit", { cancelable: true }));
    } catch (error) {
      console.error("Bokningsfel:", error);
      elements.bookingResult.className = "result error";
      setMessage(
        elements.bookingResult,
        error.message ||
          "Bokningen kunde inte skapas. Kontrollera datumen och försök igen.",
        true
      );
    } finally {
      elements.bookButton.disabled = false;
      elements.bookButton.textContent = "Skapa bokning";
    }
  }

  function initialize() {
    const today = localDateString(new Date());
    elements.checkIn.min = today;
    elements.checkIn.value = addDays(today, 1);
    elements.checkOut.min = addDays(today, 2);
    elements.checkOut.value = addDays(today, 2);

    elements.checkIn.addEventListener("change", () => {
      const nextDay = addDays(elements.checkIn.value, 1);
      elements.checkOut.min = nextDay;

      if (elements.checkOut.value <= elements.checkIn.value) {
        elements.checkOut.value = nextDay;
      }
    });

    elements.searchForm.addEventListener("submit", searchRooms);
    elements.bookingForm.addEventListener("submit", createBooking);

    elements.cancelSelection.addEventListener("click", () => {
      resetBooking();
      elements.roomResults.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });

    if (
      !config ||
      !config.SUPABASE_URL ||
      !config.SUPABASE_ANON_KEY ||
      config.SUPABASE_URL.includes("KListra_IN") ||
      config.SUPABASE_ANON_KEY.includes("KListra_IN")
    ) {
      setMessage(
        elements.searchMessage,
        "Fyll i Supabase-adressen och nyckeln i js/config.js.",
        true
      );
      elements.searchButton.disabled = true;
      return;
    }

    if (!window.supabase || !window.supabase.createClient) {
      setMessage(
        elements.searchMessage,
        "Supabase-biblioteket kunde inte laddas. Kontrollera internetanslutningen.",
        true
      );
      elements.searchButton.disabled = true;
      return;
    }

    supabaseClient = window.supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_ANON_KEY
    );

    setMessage(
      elements.searchMessage,
      "Välj datum och tryck på Sök lediga rum."
    );
  }

  initialize();
})();
