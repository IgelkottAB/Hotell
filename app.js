(() => {
  "use strict";

  const config = window.HOTEL_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  let db = null;
  let valtRum = null;
  let sokning = null;

  function datumStr(datum) {
    const ar = datum.getFullYear();
    const manad = String(datum.getMonth() + 1).padStart(2, "0");
    const dag = String(datum.getDate()).padStart(2, "0");
    return `${ar}-${manad}-${dag}`;
  }

  function pengar(belopp) {
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: "SEK",
      maximumFractionDigits: 0
    }).format(Number(belopp));
  }

  function meddelande(id, text, typ = "") {
    const element = $(id);
    element.textContent = text;
    element.className = typ;
  }

  function anslutSupabase() {
    const url = config.SUPABASE_URL || "";
    const nyckel = config.SUPABASE_PUBLISHABLE_KEY || "";

    if (
      !window.supabase ||
      !url.startsWith("https://") ||
      url.includes("KListra_IN") ||
      nyckel.length < 20 ||
      nyckel.includes("KListra_IN")
    ) {
      meddelande(
        "search-message",
        "Supabase är inte konfigurerat. Fyll i URL och nyckel i js/config.js.",
        "error"
      );

      $("search-button").disabled = true;
      $("book-button").disabled = true;
      return;
    }

    db = window.supabase.createClient(url, nyckel);
  }

  function startaDatum() {
    const idag = new Date();
    const incheckning = new Date(
      idag.getFullYear(),
      idag.getMonth(),
      idag.getDate() + 1
    );
    const utcheckning = new Date(
      idag.getFullYear(),
      idag.getMonth(),
      idag.getDate() + 2
    );

    $("check-in").min = datumStr(idag);
    $("check-in").value = datumStr(incheckning);
    $("check-out").min = datumStr(
      new Date(
        incheckning.getFullYear(),
        incheckning.getMonth(),
        incheckning.getDate() + 1
      )
    );
    $("check-out").value = datumStr(utcheckning);

    $("check-in").addEventListener("change", () => {
      const valt = $("check-in").value;
      if (!valt) return;

      const nastaDag = new Date(valt + "T12:00:00");
      nastaDag.setDate(nastaDag.getDate() + 1);

      $("check-out").min = datumStr(nastaDag);

      if ($("check-out").value <= valt) {
        $("check-out").value = datumStr(nastaDag);
      }
    });
  }

  function visaRum(rum) {
    const lista = $("room-results");
    lista.replaceChildren();

    if (!rum.length) {
      const tomt = document.createElement("p");
      tomt.className = "empty";
      tomt.textContent =
        "Inga lediga rum hittades. Prova andra datum eller ändra filtren.";
      lista.appendChild(tomt);
      return;
    }

    rum.forEach((rumInfo) => {
      const kort = document.createElement("article");
      kort.className = "room-card";

      const rubrik = document.createElement("h3");
      rubrik.textContent =
        `Rum ${rumInfo.room_number} – ${rumInfo.room_type}`;

      const beskrivning = document.createElement("p");
      beskrivning.textContent =
        rumInfo.description || "Rum på hotellet.";

      const egenskaper = document.createElement("p");
      egenskaper.textContent = [
        `Plats för ${rumInfo.capacity} gäster`,
        rumInfo.has_balcony ? "Balkong" : "Ingen balkong",
        rumInfo.wheelchair_accessible
          ? "Rullstolsanpassat"
          : "Ej rullstolsanpassat"
      ].join(" · ");

      const nattpris = document.createElement("p");
      nattpris.textContent =
        `${pengar(rumInfo.price_per_night)} per natt`;

      const total = document.createElement("p");
      total.className = "total";
      total.textContent =
        `Totalt ${pengar(rumInfo.total_price)} för ` +
        `${sokning.natter} ${sokning.natter === 1 ? "natt" : "nätter"}`;

      const knapp = document.createElement("button");
      knapp.type = "button";
      knapp.textContent = "Välj detta rum";
      knapp.addEventListener("click", () => valjRum(rumInfo));

      kort.append(
        rubrik,
        beskrivning,
        egenskaper,
        nattpris,
        total,
        knapp
      );

      lista.appendChild(kort);
    });
  }

  function valjRum(rum) {
    valtRum = rum;

    $("selected-room").textContent =
      `Rum ${rum.room_number} – ${rum.room_type}. ` +
      `Totalt ${pengar(rum.total_price)} för ${sokning.natter} nätter.`;

    $("booking-panel").hidden = false;
    $("booking-result").hidden = true;

    $("booking-panel").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  $("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!db) return;

    const incheckning = $("check-in").value;
    const utcheckning = $("check-out").value;
    const antalGaster = Number($("guest-count").value);

    if (!incheckning || !utcheckning || utcheckning <= incheckning) {
      meddelande(
        "search-message",
        "Utcheckningen måste vara efter incheckningen.",
        "error"
      );
      return;
    }

    const idag = datumStr(new Date());

    if (incheckning < idag) {
      meddelande(
        "search-message",
        "Du kan inte välja ett datum som redan har passerat.",
        "error"
      );
      return;
    }

    const start = new Date(incheckning + "T12:00:00");
    const slut = new Date(utcheckning + "T12:00:00");
    const natter = Math.round((slut - start) / 86400000);

    if (natter > 365) {
      meddelande(
        "search-message",
        "Du kan söka högst 365 nätter åt gången.",
        "error"
      );
      return;
    }

    sokning = {
      incheckning,
      utcheckning,
      antalGaster,
      natter
    };

    valtRum = null;
    $("booking-panel").hidden = true;
    $("room-results").replaceChildren();

    const knapp = $("search-button");
    knapp.disabled = true;
    knapp.textContent = "Söker…";

    meddelande("search-message", "Kontrollerar lediga rum…");

    try {
      const { data, error } = await db.rpc("search_hotel_rooms", {
        p_hotel_id: config.HOTEL_ID,
        p_check_in: incheckning,
        p_check_out: utcheckning,
        p_guest_count: antalGaster,
        p_needs_balcony: $("balcony").checked,
        p_needs_wheelchair_access: $("wheelchair").checked
      });

      if (error) throw error;

      const rum = Array.isArray(data) ? data : [];

      meddelande(
        "search-message",
        `Sökningen är klar. Hittade ${rum.length} rum.`,
        "success"
      );

      visaRum(rum);
    } catch (fel) {
      console.error(fel);
      meddelande(
        "search-message",
        "Sökningen misslyckades: " + fel.message,
        "error"
      );
    } finally {
      knapp.disabled = false;
      knapp.textContent = "Sök lediga rum";
    }
  });

  $("booking-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!db || !valtRum || !sokning) {
      meddelande(
        "booking-result",
        "Sök rum och välj ett rum innan du bokar.",
        "error"
      );
      $("booking-result").hidden = false;
      return;
    }

    const namn = $("guest-name").value.trim();
    const epost = $("guest-email").value.trim();

    if (namn.length < 2 || !epost.includes("@")) {
      const resultat = $("booking-result");
      resultat.hidden = false;
      resultat.textContent = "Kontrollera namn och e-postadress.";
      resultat.className = "result error";
      return;
    }

    const knapp = $("book-button");
    knapp.disabled = true;
    knapp.textContent = "Skapar bokning…";
    $("booking-result").hidden = true;

    try {
      const { data, error } = await db.rpc("create_hotel_booking", {
        p_hotel_id: config.HOTEL_ID,
        p_room_id: valtRum.room_id,
        p_guest_name: namn,
        p_guest_email: epost,
        p_guest_count: sokning.antalGaster,
        p_check_in: sokning.incheckning,
        p_check_out: sokning.utcheckning,
        p_payment_method: $("payment-method").value
      });

      if (error) throw error;

      const bokning = Array.isArray(data) ? data[0] : data;

      if (!bokning || !bokning.booking_code) {
        throw new Error("Bokningsnumret saknas i svaret från Supabase.");
      }

      const resultat = $("booking-result");
      resultat.replaceChildren();
      resultat.hidden = false;
      resultat.className = "result";

      const rubrik = document.createElement("h3");
      rubrik.textContent = "Testbokningen är skapad!";

      const kod = document.createElement("p");
      kod.className = "booking-code";
      kod.textContent = "Bokningsnummer: " + bokning.booking_code;

      const detaljer = document.createElement("p");
      detaljer.textContent =
        `Rum ${valtRum.room_number} · ${sokning.incheckning} till ` +
        `${sokning.utcheckning} · ${bokning.nights} nätter · ` +
        `${pengar(bokning.total_price)} totalt.`;

      const betalning = document.createElement("p");
      betalning.textContent = bokning.payment_status === "unpaid"
        ? "Betalning: betalas på hotellet. Detta är ett test."
        : "Betalning: väntar på låtsasbetalning. Inga pengar har dragits.";

      const varning = document.createElement("p");
      varning.className = "small";
      varning.textContent =
        "Spara bokningsnumret. E-postbekräftelse är inte aktiverad ännu.";

      resultat.append(rubrik, kod, detaljer, betalning, varning);

      meddelande(
        "search-message",
        "Bokningen lyckades! Sök igen för att uppdatera listan.",
        "success"
      );

      resultat.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    } catch (fel) {
      console.error(fel);
      const resultat = $("booking-result");
      resultat.hidden = false;
      resultat.className = "result error";
      resultat.textContent =
        "Bokningen misslyckades: " + fel.message +
        ". Sök lediga rum igen och försök på nytt.";
    } finally {
      knapp.disabled = false;
      knapp.textContent = "Skapa testbokning";
    }
  });

  $("cancel-selection").addEventListener("click", () => {
    $("booking-panel").hidden = true;
    valtRum = null;
    $("search-form").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  startaDatum();
  anslutSupabase();
})();
