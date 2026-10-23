
document.addEventListener("DOMContentLoaded", () => {
  const cfg = window.HOTEL_CONFIG;
  const configured = cfg &&
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_PUBLISHABLE_KEY &&
    !cfg.SUPABASE_URL.includes("KListra_") &&
    !cfg.SUPABASE_PUBLISHABLE_KEY.includes("KListra_");

  if (!configured) {
    const warning = document.createElement("p");
    warning.className = "notice";
    warning.textContent =
      "Supabase är inte konfigurerat. Kontrollera js/config.js.";
    document.querySelector("main")?.prepend(warning);
  }
});
