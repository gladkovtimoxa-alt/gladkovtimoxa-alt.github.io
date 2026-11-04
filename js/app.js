/* KaTiAi app: free OCR in the browser (Tesseract.js), AI mode via the server, exports, local history, sign-in, plans. */
(() => {
  "use strict";
  const I18N = window.KATI_I18N || {};
  const LANGS = Object.keys(I18N);
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };

  const OCR_LANGS = [
    ["rus+eng", "Русский + English"], ["eng", "English"], ["rus", "Русский"], ["ukr", "Українська"], ["bel", "Беларуская"],
    ["kaz", "Қазақша"], ["uzb", "Oʻzbekcha"], ["spa", "Español"], ["deu", "Deutsch"], ["fra", "Français"], ["por", "Português"],
    ["ita", "Italiano"], ["tur", "Türkçe"], ["pol", "Polski"], ["ces", "Čeština"], ["nld", "Nederlands"],
    ["chi_sim", "简体中文"], ["chi_tra", "繁體中文"], ["jpn", "日本語"], ["kor", "한국어"], ["ara", "العربية"],
    ["heb", "עברית"], ["hin", "हिन्दी"], ["vie", "Tiếng Việt"], ["tha", "ไทย"], ["ell", "Ελληνικά"],
    ["hye", "Հայերեն"], ["kat", "ქართული"], ["aze", "Azərbaycanca"],
  ];
  const DEFAULT_OCR = { ru: "rus+eng", en: "eng", es: "spa", de: "deu", fr: "fra", pt: "por", zh: "chi_sim", ar: "ara" };
  const LOCALE = { ru: "ru-RU", en: "en-US", es: "es-ES", de: "de-DE", fr: "fr-FR", pt: "pt-BR", zh: "zh-CN", ar: "ar" };
  const EXTRA_FONTS = {
    zh: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap",
    ar: "https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;600;700&display=swap",
  };
  const FALLBACK_CFG = { price_per_page_kopeks: 200, ad_reward_kopeks: 100, free_ai_kopeks_per_day: 2000, pro_days: 30,
    price_tiers_rub: ["100.00", "500.00", "1000.00"], tier_daily_kopeks: { "100.00": 1000, "500.00": 5000, "1000.00": 10000 },
    price: { USD: "6.99" },
    providers: { yookassa: false, stripe: false }, translate_to: ["en", "ru", "es", "de", "fr", "pt", "zh", "ar"], max_pages: 10, offline: true };

  function fmtRub(kopeks) {
    const whole = Math.floor(Math.max(0, kopeks || 0) / 100), cents = Math.max(0, kopeks || 0) % 100;
    return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, "0")}`;
  }

  const state = {
    lang: "ru", mode: "free", files: [], view: "text", busy: false,
    result: { text: "", markdown: "", translation: "" }, unclear: false,
    cfg: FALLBACK_CFG, me: { authenticated: false }, selectedTier: null,
  };

  // ---------- i18n ----------
  function pickLang() {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (LANGS.includes(fromUrl)) return fromUrl;
    const saved = store.get("katiai.lang", null);
    if (LANGS.includes(saved)) return saved;
    for (const l of navigator.languages || [navigator.language || "en"]) {
      const short = String(l).slice(0, 2).toLowerCase();
      if (LANGS.includes(short)) return short;
    }
    return "en";
  }

  function t(key, vars = {}) {
    const raw = (I18N[state.lang] || {})[key] ?? I18N.en?.[key] ?? I18N.ru?.[key] ?? key;
    const freeGens = Math.floor((state.cfg.free_ai_kopeks_per_day || 0) / (state.cfg.price_per_page_kopeks || 1));
    const all = { price_per_page: fmtRub(state.cfg.price_per_page_kopeks), ad_reward: fmtRub(state.cfg.ad_reward_kopeks),
      free_gens: freeGens, price: priceLabel(), ...vars };
    return raw.replace(/\{(\w+)\}/g, (_, k) => (all[k] ?? `{${k}}`));
  }
  const fmtNum = (n) => new Intl.NumberFormat(LOCALE[state.lang]).format(n);
  const fmtDate = (ts) => new Intl.DateTimeFormat(LOCALE[state.lang], { dateStyle: "long" }).format(new Date(ts * 1000));

  function currency() { return state.lang === "ru" ? "RUB" : "USD"; }
  function tierLabel(tierRub) {
    const nf = new Intl.NumberFormat(LOCALE[state.lang], { style: "currency", currency: "RUB",
      minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return nf.format(Number(tierRub));
  }
  function tierDailyLabel(tierRub) {
    const map = state.cfg.tier_daily_kopeks || FALLBACK_CFG.tier_daily_kopeks;
    const dailyKopeks = map[tierRub] ?? Math.round(Number(tierRub) * 100 / 10);
    const pages = Math.floor(dailyKopeks / state.cfg.price_per_page_kopeks) * (state.cfg.pro_days || 30);
    return t("checkout.tier_gens", { n: fmtNum(pages) });
  }
  function priceLabel(cur = currency()) {
    if (cur === "RUB") return tierLabel(state.selectedTier || state.cfg.price_tiers_rub[0]);
    const value = Number(state.cfg.price[cur]);
    const nf = new Intl.NumberFormat(LOCALE[state.lang], { style: "currency", currency: cur,
      minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return nf.format(value);
  }

  function applyI18n() {
    const html = document.documentElement;
    html.lang = state.lang;
    html.dir = state.lang === "ar" ? "rtl" : "ltr";
    if (EXTRA_FONTS[state.lang] && !document.querySelector(`link[data-font="${state.lang}"]`)) {
      const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: EXTRA_FONTS[state.lang] });
      link.dataset.font = state.lang;
      document.head.appendChild(link);
    }
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":");
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    document.title = `KaTiAi — ${t("hero.t1")} ${t("hero.t2")}`;
    $("#lang").value = state.lang;
    renderPricingCards();
    $("#consent-text").textContent = t("checkout.consent", { price: priceLabel() });
    $("#mode-hint").textContent = t(state.mode === "ai" ? "app.mode_ai_hint" : "app.mode_free_hint");
    if (!$("#fname").dataset.touched) $("#fname").value = defaultFilename();
    fillTranslateOptions();
    renderHistory();
    renderBalance();
    document.dispatchEvent(new CustomEvent("katiai:lang", { detail: state.lang }));
  }

  function fillOcrLangs() {
    const sel = $("#ocr-lang");
    sel.innerHTML = "";
    for (const [code, label] of OCR_LANGS) sel.appendChild(new Option(label, code));
    sel.value = store.get("katiai.ocrLang", null) || DEFAULT_OCR[state.lang] || "eng";
  }

  function fillTranslateOptions() {
    const sel = $("#ai-tr");
    const keep = sel.value;
    let names;
    try { names = new Intl.DisplayNames([LOCALE[state.lang]], { type: "language" }); } catch { names = null; }
    sel.innerHTML = "";
    sel.appendChild(new Option(t("app.no_translate"), ""));
    const codes = [...state.cfg.translate_to].sort((a, b) => (names?.of(a) || a).localeCompare(names?.of(b) || b, LOCALE[state.lang]));
    for (const code of codes) sel.appendChild(new Option(names?.of(code) || code, code));
    sel.value = keep;
  }

  const defaultFilename = () => `${t("app.file_default")}_${new Date().toISOString().slice(0, 10)}`;

  // ---------- API ----------
  class ApiError extends Error { constructor(code, message) { super(message || code); this.code = code; } }
  async function api(path, opts = {}) {
    let resp;
    try { resp = await fetch(path, { credentials: "same-origin", ...opts }); }
    catch { throw new ApiError("offline"); }
    if (resp.ok) return resp;
    let body = {};
    try { body = await resp.json(); } catch { /* not JSON */ }
    const code = typeof body.detail === "string" ? body.detail : (resp.status === 404 ? "offline" : "generic");
    throw new ApiError(code, body.message);
  }
  function errText(err) {
    const key = `err.${err.code}`;
    if (err.code === "offline") return t("err.generic");
    return (I18N.en[key] ? t(key, { n: state.cfg.max_pages }) : t("err.generic"));
  }

  async function loadConfig() {
    try { state.cfg = { ...FALLBACK_CFG, ...(await (await api("/api/config")).json()), offline: false }; } catch { state.cfg = FALLBACK_CFG; }
  }
  async function loadMe() {
    try { state.me = await (await api("/api/me")).json(); } catch { state.me = { authenticated: false }; }
    $("#account-btn").textContent = t(state.me.authenticated ? "nav.account" : "nav.login");
    $("#account-btn").dataset.i18n = state.me.authenticated ? "nav.account" : "nav.login";
    const authed = state.me.authenticated;
    $("#app").hidden = !authed;
    // Личный кабинет = только инструмент. Маркетинг (хиро, тарифы, FAQ...) скрываем целиком, не частично.
    document.querySelectorAll(".hero, #features, #how, #pricing, #faq, nav.links").forEach((el) => { el.hidden = authed; });
    renderBalance();
    renderMailSend();
    renderHistory(); // isProNow() только теперь знает правду — до этого чекбоксы пачки были бы скрыты
    renderFreeLimit();
  }

  // ---------- status ----------
  function setStatus(msg, kind = "") { const el = $("#status"); el.textContent = msg || ""; el.className = `status ${kind}`; }
  function setBar(p) { $("#bar").style.width = `${Math.max(0, Math.min(100, p))}%`; }
  function busy(on) {
    state.busy = on;
    $("#drop").classList.toggle("busy", on);
    $("#go").disabled = on || !state.files.length;
  }

  // ---------- files ----------
  function addFiles(list) {
    const added = [];
    for (const f of list) {
      if (!f || !String(f.type).startsWith("image/")) continue;
      const entry = { file: f, url: URL.createObjectURL(f), id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()) };
      state.files.push(entry);
      added.push(entry);
    }
    renderThumbs();
    // Авто-выравнивание — в фоне, не блокирует показ миниатюр. Срабатывает тихо:
    // не нашли уверенный контур листа — оставляем кадр как есть, без ошибок.
    if (window.KatiaiAutocrop) {
      added.forEach((entry) => {
        KatiaiAutocrop.straightenFile(entry.file).then((cropped) => {
          if (!cropped || !state.files.includes(entry)) return;
          URL.revokeObjectURL(entry.url);
          entry.file = cropped;
          entry.url = URL.createObjectURL(cropped);
          renderThumbs();
        });
      });
    }
  }
  function renderThumbs() {
    const box = $("#thumbs");
    box.innerHTML = "";
    state.files.forEach((f, i) => {
      const d = document.createElement("div");
      d.className = "thumb";
      d.draggable = true;
      d.dataset.index = i;
      d.innerHTML = `<img alt=""><span class="n">${i + 1}</span><button class="x" type="button" aria-label="×">×</button>`;
      d.querySelector("img").src = f.url;
      d.querySelector(".x").onclick = (e) => { e.stopPropagation(); URL.revokeObjectURL(f.url); state.files.splice(i, 1); renderThumbs(); };
      d.addEventListener("dragstart", (e) => { d.classList.add("dragging"); e.dataTransfer.setData("text/plain", String(i)); });
      d.addEventListener("dragend", () => d.classList.remove("dragging"));
      d.addEventListener("dragover", (e) => e.preventDefault());
      d.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation();
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (Number.isInteger(from) && from !== i) { const [m] = state.files.splice(from, 1); state.files.splice(i, 0, m); renderThumbs(); }
      });
      box.appendChild(d);
    });
    $("#go").disabled = state.busy || !state.files.length;
  }

  // ---------- recognition ----------
  let worker = null, workerLang = null;
  async function getWorker(lang, onProgress) {
    if (worker && workerLang === lang) return worker;
    if (worker) { try { await worker.terminate(); } catch { /* ignore */ } worker = null; }
    setStatus(t("app.loading_lang"));
    worker = await window.Tesseract.createWorker(lang.split("+"), 1, {
      logger: (m) => { if (m.status === "recognizing text" && onProgress) onProgress(m.progress); },
    });
    workerLang = lang;
    return worker;
  }

  async function toCanvas(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return c;
  }

  async function recognizeFree() {
    const lang = $("#ocr-lang").value;
    store.set("katiai.ocrLang", lang);
    const texts = [];
    const total = state.files.length;
    const local = typeof window.Tesseract !== "undefined" && typeof WebAssembly === "object";
    for (let i = 0; i < total; i++) {
      setStatus(t("app.progress", { n: i + 1, total }));
      let text = null;
      if (local) {
        try {
          const w = await getWorker(lang, (p) => setBar(((i + p) / total) * 100));
          setStatus(t("app.progress", { n: i + 1, total }));
          const { data } = await w.recognize(await toCanvas(state.files[i].file));
          text = (data.text || "").replace(/\s+$/g, "");
        } catch (e) { console.warn("local OCR failed", e); text = null; }
      }
      if (text === null) {
        setStatus(t("app.server_fallback"));
        const fd = new FormData();
        fd.append("file", state.files[i].file);
        fd.append("lang", lang);
        text = (await (await api("/api/ocr", { method: "POST", body: fd })).json()).text;
      }
      texts.push(text);
      setBar(((i + 1) / total) * 100);
    }
    return { text: texts.join("\n\n"), markdown: "", translation: "", unclear: false };
  }

  async function recognizeAI() {
    if (!state.me.authenticated) { openLogin(t("err.auth_required")); throw new ApiError("silent"); }
    if (state.files.length > state.cfg.max_pages) throw new ApiError("too_many_files");
    const fd = new FormData();
    state.files.forEach((f) => fd.append("files", f.file));
    fd.append("mode", $("#ai-kind").value);
    fd.append("translate_to", $("#ai-tr").value);
    setStatus(t("app.ai_progress", { total: state.files.length }));
    let fake = 5;
    const timer = setInterval(() => { fake = Math.min(92, fake + 3); setBar(fake); }, 700);
    try {
      const body = await (await api("/api/ai/ocr", { method: "POST", body: fd })).json();
      state.me.balance_kopeks = body.balance_kopeks;
      renderBalance();
      const pages = body.pages || [];
      return {
        text: pages.map((p) => p.text).join("\n\n"),
        markdown: pages.map((p) => p.markdown).join("\n\n"),
        translation: pages.map((p) => p.translation).filter(Boolean).join("\n\n"),
        unclear: pages.some((p) => (p.unclear || []).length),
      };
    } finally { clearInterval(timer); }
  }

  // ---------- browser OCR is free and unlimited; the button just offers extra paid-mode balance ----------
  function isProNow() { return !!(state.me && state.me.plan === "pro"); }
  function renderFreeLimit() {
    const el = $("#free-limit"); if (!el) return;
    el.hidden = state.mode !== "free" || isProNow();
  }
  // ---------- rewarded ad: credits the ИИ-mode wallet (requires sign-in; placeholder countdown, no real ad network yet) ----------
  function watchAd() {
    if (document.querySelector(".ad-overlay")) return;
    if (!state.me.authenticated) { openLogin(t("err.auth_required")); return; }
    const ov = document.createElement("div"); ov.className = "ad-overlay";
    const box = document.createElement("div"); box.className = "ad-box";
    const title = document.createElement("p"); title.className = "ad-title"; title.textContent = t("app.ad_title");
    const slot = document.createElement("div"); slot.className = "ad-slot"; slot.id = "ad-slot"; slot.textContent = t("app.ad_slot");
    const btn = document.createElement("button"); btn.className = "btn ai"; btn.disabled = true;
    box.append(title, slot, btn); ov.appendChild(box); document.body.appendChild(ov);
    let n = 15;
    const paint = () => { btn.textContent = n > 0 ? t("app.ad_wait", { n }) : t("app.ad_claim"); };
    paint();
    const timer = setInterval(() => { n -= 1; if (n <= 0) { clearInterval(timer); btn.disabled = false; } paint(); }, 1000);
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      clearInterval(timer); ov.remove();
      try {
        const body = await (await api("/api/ads/reward", { method: "POST" })).json();
        state.me.balance_kopeks = body.balance_kopeks;
        renderBalance();
        setStatus(t("app.ad_done"), "ok");
      } catch (e) { setStatus(errText(e), "bad"); }
    });
  }

  // ---------- send result by e-mail + address book (Pro) ----------
  async function loadAddressbook() {
    if (!isProNow()) return;
    try {
      const b = await (await api("/api/addressbook")).json();
      const dl = $("#contacts"); dl.textContent = "";
      (b.contacts || []).forEach((c) => {
        const o = document.createElement("option"); o.value = c.email; o.textContent = c.name || c.email; dl.appendChild(o);
      });
    } catch { /* ignore */ }
  }
  function renderMailSend() { const el = $("#mail-send"); if (el) { el.hidden = !isProNow(); if (isProNow()) loadAddressbook(); } }
  async function sendEmail() {
    if (!state.me.authenticated) return openLogin(t("err.auth_required"));
    if (!isProNow()) return openBuy();
    const to = $("#mail-to").value.trim();
    const content = $("#editor").value;
    if (!content.trim()) return setStatus(t("err.no_text"), "bad");
    if (!to) return setStatus(t("err.bad_email"), "bad");
    const fd = new FormData();
    fd.append("to", to); fd.append("fmt", "docx"); fd.append("text", content);
    fd.append("filename", ($("#fname").value || defaultFilename()).trim());
    fd.append("markdown", state.view === "text" ? "false" : "true");
    try {
      const b = await (await api("/api/send-email", { method: "POST", body: fd })).json();
      setStatus(b.sent ? t("app.mail_sent", { to }) : t("app.mail_queued"), "ok");
      loadAddressbook();
    } catch (e) { setStatus(errText(e), "bad"); }
  }

  async function run() {
    if (!state.files.length || state.busy) { if (!state.files.length) setStatus(t("err.no_files"), "bad"); return; }
    busy(true); setBar(2);
    try {
      const r = state.mode === "ai" ? await recognizeAI() : await recognizeFree();
      state.result = { text: r.text, markdown: r.markdown, translation: r.translation };
      state.unclear = r.unclear;
      setView(r.translation ? "translation" : r.markdown ? "markdown" : "text");
      const words = r.text.trim() ? r.text.trim().split(/\s+/).length : 0;
      setStatus(t("app.done", { chars: fmtNum(r.text.length), words: fmtNum(words) }), "ok");
      setBar(100);
      saveHistory();
    } catch (e) {
      if (e.code !== "silent") setStatus(errText(e), "bad");
      setBar(0);
    } finally { busy(false); }
  }

  // ---------- result views ----------
  function setView(view) {
    state.view = view;
    $$(".tabs [data-view]").forEach((b) => {
      const has = b.dataset.view === "text" || Boolean(state.result[b.dataset.view]);
      b.hidden = !has;
      b.setAttribute("aria-selected", String(b.dataset.view === view));
    });
    $("#editor").value = state.result[view] || "";
    $("#unclear").hidden = !state.unclear;
  }

  // ---------- export ----------
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function doExport(fmt) {
    const content = $("#editor").value;
    if (!content.trim()) { setStatus(t("err.no_text"), "bad"); return; }
    const name = ($("#fname").value || defaultFilename()).trim();
    try {
      if (fmt === "txt") download(new Blob(["﻿" + content], { type: "text/plain;charset=utf-8" }), `${name}.txt`);
      else {
        const fd = new FormData();
        fd.append("fmt", fmt); fd.append("text", content); fd.append("filename", name);
        fd.append("markdown", state.view === "text" ? "false" : "true");
        const ext = fmt === "photo" ? "zip" : fmt;
        download(await (await api("/api/export", { method: "POST", body: fd })).blob(), `${name}.${ext}`);
      }
      setStatus(t("app.saved"), "ok");
    } catch (e) { setStatus(errText(e), "bad"); }
  }
  async function searchablePdf() {
    if (!state.me.authenticated) return openLogin(t("err.auth_required"));
    if (state.me.plan !== "pro") return openBuy();
    if (!state.files.length) return setStatus(t("err.no_files"), "bad");
    busy(true); setStatus(t("app.progress", { n: 1, total: state.files.length }));
    try {
      const fd = new FormData();
      state.files.forEach((f) => fd.append("files", f.file));
      fd.append("lang", $("#ocr-lang").value);
      const name = ($("#fname").value || defaultFilename()).trim();
      fd.append("filename", name);
      download(await (await api("/api/pdf/searchable", { method: "POST", body: fd })).blob(), `${name}.pdf`);
      setStatus(t("app.saved"), "ok");
    } catch (e) { setStatus(errText(e), "bad"); } finally { busy(false); }
  }

  // ---------- history (this device only) ----------
  function saveHistory() {
    const items = store.get("katiai.history", []);
    const first = (state.result.text.split("\n").find((l) => l.trim()) || "…").slice(0, 80);
    items.unshift({ id: Date.now(), ts: Date.now() / 1000, mode: state.mode, title: first, ...state.result, unclear: state.unclear });
    let trimmed = items.slice(0, 30);
    while (trimmed.length > 1 && JSON.stringify(trimmed).length > 1_500_000) trimmed = trimmed.slice(0, -1);
    store.set("katiai.history", trimmed);
    renderHistory();
  }
  function renderHistory() {
    const box = $("#history");
    const items = store.get("katiai.history", []);
    box.innerHTML = "";
    $("#history-select-all-row").hidden = !items.length || !isProNow();
    $("#history-select-all").checked = false;
    if (!items.length) { box.innerHTML = `<p class="hint">${t("app.history_empty")}</p>`; updateHistoryBatchState(); return; }
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "history-row";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.className = "history-check"; cb.dataset.id = it.id; cb.hidden = !isProNow();
      cb.addEventListener("change", updateHistoryBatchState);
      const b = document.createElement("button");
      b.type = "button"; b.className = "item";
      const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = it.mode === "ai" ? "✦" : "📄";
      const t2 = document.createElement("span"); t2.className = "t";
      const title = document.createElement("b"); title.textContent = it.title;
      const small = document.createElement("small");
      const when = new Date(it.ts * 1000).toLocaleString(LOCALE[state.lang], { dateStyle: "short", timeStyle: "short" });
      small.textContent = `${fmtNum((it.text || "").length)} · ${when}`;
      t2.appendChild(title); t2.appendChild(small);
      b.appendChild(icon); b.appendChild(t2);
      b.onclick = () => {
        state.result = { text: it.text || "", markdown: it.markdown || "", translation: it.translation || "" };
        state.unclear = Boolean(it.unclear);
        setView(it.translation ? "translation" : it.markdown ? "markdown" : "text");
        $("#editor").focus();
      };
      row.appendChild(cb); row.appendChild(b);
      box.appendChild(row);
    }
    updateHistoryBatchState();
  }
  function updateHistoryBatchState() {
    const checks = [...document.querySelectorAll(".history-check")];
    $("#history-batch").hidden = !isProNow() || !checks.length;
    $("#history-send-mail").disabled = !checks.some((c) => c.checked);
  }
  async function sendHistoryBatch() {
    if (!state.me.authenticated) return openLogin(t("err.auth_required"));
    if (!isProNow()) return openBuy();
    const st = $("#history-mail-status");
    const to = $("#history-mail-to").value.trim();
    const ids = [...document.querySelectorAll(".history-check")].filter((c) => c.checked).map((c) => Number(c.dataset.id));
    if (!ids.length) { st.className = "status bad"; st.textContent = t("err.no_selection"); return; }
    if (!to) { st.className = "status bad"; st.textContent = t("err.bad_email"); return; }
    const items = store.get("katiai.history", []).filter((it) => ids.includes(it.id));
    const payload = {
      to, items: items.map((it) => ({
        text: it.translation || it.markdown || it.text || "", markdown: Boolean(it.markdown && !it.translation), filename: (it.title || "katiai").slice(0, 80),
      })),
    };
    try {
      st.className = "status"; st.textContent = t("checkout.redirect");
      const r = await (await api("/api/send-email-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).json();
      st.className = "status ok"; st.textContent = t("app.mail_sent_batch", { n: r.count, to });
      loadAddressbook();
    } catch (e) { st.className = "status bad"; st.textContent = errText(e); }
  }

  // ---------- account, balance, plans ----------
  function renderBalance() {
    const me = state.me;
    const hint = $("#quota-hint");
    $("#plan-name").hidden = me.plan !== "pro";
    if (!me.authenticated) {
      $("#quota-text").textContent = "—"; $("#quota-bar").style.width = "0";
      hint.textContent = t("app.quota_guest"); return;
    }
    const balance = me.balance_kopeks || 0;
    $("#quota-text").textContent = t("app.quota", { balance: fmtRub(balance) });
    $("#quota-bar").style.width = balance > 0 ? "100%" : "0%";
    hint.textContent = t(balance > 0 ? "app.quota_has_balance" : "app.quota_empty");
  }

  function openLogin(message) {
    $("#login-status").textContent = message || "";
    $("#login-status").className = "status";
    $("#login-dlg").showModal();
    setTimeout(() => $("#login-email").focus(), 50);
  }
  async function sendLogin() {
    const email = $("#login-email").value.trim();
    const st = $("#login-status");
    try {
      const body = await (await api("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lang: state.lang }) })).json();
      st.className = "status ok";
      st.textContent = t("login.sent", { email });
      if (body.dev_link) { const a = Object.assign(document.createElement("a"), { href: body.dev_link, textContent: " [dev link]" }); st.appendChild(a); }
    } catch (e) { st.className = "status bad"; st.textContent = errText(e); }
  }

  function openAccount() {
    const me = state.me;
    $("#acc-email").textContent = me.email || "";
    $("#acc-plan").textContent = me.plan === "pro" ? "Pro" : "Free";
    $("#acc-balance").textContent = `${fmtRub(me.balance_kopeks || 0)} ₽`;
    const pro = me.plan === "pro";
    $("#acc-until-row").hidden = !pro;
    if (pro) $("#acc-until").textContent = fmtDate(me.plan_until);
    $("#acc-renew").textContent = pro ? (me.auto_renew ? t("account.renew_on") : t("account.renew_off", { date: fmtDate(me.plan_until) })) : "";
    $("#acc-upgrade").hidden = pro;
    $("#acc-cancel").hidden = !(pro && me.auto_renew);
    $("#topup-amount").min = state.cfg.min_topup_rub;
    $("#topup-amount").value = "";
    $("#topup-status").textContent = "";
    $("#account-dlg").showModal();
  }

  async function topup() {
    const st = $("#topup-status");
    const value = Number($("#topup-amount").value);
    if (!value || value < Number(state.cfg.min_topup_rub)) {
      st.className = "status bad"; st.textContent = t("err.amount_too_small", { min: state.cfg.min_topup_rub }); return;
    }
    try {
      st.className = "status"; st.textContent = t("checkout.redirect");
      const body = await (await api("/api/billing/topup", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value.toFixed(2) }) })).json();
      location.href = body.url;
    } catch (e) { st.className = "status bad"; st.textContent = errText(e); }
  }

  function renderPricingCards() {
    $$(".plan.pro[data-tier-idx]").forEach((card) => {
      const tier = state.cfg.price_tiers_rub[Number(card.dataset.tierIdx)];
      if (!tier) { card.hidden = true; return; }
      card.hidden = false;
      card.querySelector(".tier-price").textContent = tierLabel(tier);
      card.querySelector(".tier-daily").textContent = tierDailyLabel(tier);
      const btn = card.querySelector(".buy-tier");
      if (btn) btn.onclick = () => { state.selectedTier = tier; openBuy(); };
    });
  }

  function renderTierSelect() {
    const box = $("#tier-select");
    if (!box) return;
    const p = state.cfg.providers || {};
    if (!p.yookassa) { box.hidden = true; box.innerHTML = ""; return; }
    const tiers = state.cfg.price_tiers_rub;
    if (!tiers.includes(state.selectedTier)) state.selectedTier = tiers[Math.floor(tiers.length / 2)];
    box.hidden = false;
    box.innerHTML = "";
    tiers.forEach((tier) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "tier-btn"; btn.dataset.tier = tier;
      btn.setAttribute("aria-pressed", String(tier === state.selectedTier));
      btn.replaceChildren(document.createTextNode(tierLabel(tier)), Object.assign(document.createElement("small"), { textContent: tierDailyLabel(tier) }));
      btn.addEventListener("click", () => {
        state.selectedTier = tier;
        $$("#tier-select .tier-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tier === tier)));
        updateConsentText();
      });
      box.appendChild(btn);
    });
  }
  function updateConsentText() {
    const p = state.cfg.providers || {};
    const curr = p.yookassa && state.lang === "ru" ? "RUB" : (p.stripe ? "USD" : currency());
    const consentKey = curr === "RUB" && !p.yookassa_recurring ? "checkout.consent_onetime" : "checkout.consent";
    $("#consent-text").textContent = t(consentKey, { price: priceLabel(curr) });
  }
  function openBuy() {
    if (!state.me.authenticated) return openLogin(t("err.auth_required"));
    const p = state.cfg.providers || {};
    $("#pay-yk").hidden = !p.yookassa;
    $("#pay-stripe").hidden = !p.stripe;
    if (state.lang !== "ru" && p.stripe && p.yookassa) $("#pay-stripe").after($("#pay-yk"));
    $("#buy-status").textContent = p.yookassa || p.stripe ? "" : t("checkout.none");
    $("#consent").checked = false;
    renderTierSelect();
    updateConsentText();
    $("#buy-dlg").showModal();
  }
  async function pay(provider, consentGiven) {
    const st = $("#buy-status");
    const consented = consentGiven !== undefined ? consentGiven : $("#consent").checked;
    if (!consented) { st.className = "status bad"; st.textContent = t("err.consent_required"); return; }
    if (provider === "yookassa" && !state.cfg.price_tiers_rub.includes(state.selectedTier)) {
      st.className = "status bad"; st.textContent = t("err.generic"); return;
    }
    try {
      st.className = "status"; st.textContent = t("checkout.redirect");
      const payload = { provider, consent: true };
      if (provider === "yookassa") payload.tier = state.selectedTier;
      const body = await (await api("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload) })).json();
      location.href = body.url;
    } catch (e) { st.className = "status bad"; st.textContent = errText(e); }
  }

  // ---------- wiring ----------
  function setMode(mode) {
    state.mode = mode;
    $$(".mode [data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    $("#ai-kind-box").hidden = mode !== "ai";
    $("#ai-tr-box").hidden = mode !== "ai";
    $("#lang-free-box").hidden = mode === "ai";
    $("#mode-hint").textContent = t(mode === "ai" ? "app.mode_ai_hint" : "app.mode_free_hint");
    renderFreeLimit();
  }

  function wire() {
    document.querySelectorAll('a[href="#app"]').forEach((a) => a.addEventListener("click", (e) => {
      if (!state.me.authenticated) { e.preventDefault(); openLogin(); }
    }));
    // <dialog> закрывает себя по кнопке (type=submit, method=dialog), но НЕ по клику вне себя — это не браузерный баг,
    // просто нет готового поведения, его обязательно вешать самим: клик по самому <dialog> (не по .in внутри) = клик по фону.
    document.querySelectorAll("dialog").forEach((dlg) => dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }));
    document.querySelectorAll("dialog .icon-btn.close").forEach((btn) => btn.addEventListener("click", (e) => {
      e.preventDefault(); btn.closest("dialog").close(); // подстраховка: form[method=dialog] должен закрывать сам, но не везде надёжно
    }));
    // Попап при уходе со страницы: мышь ушла за верхнюю границу окна (к адресной
    // строке/вкладкам/закрытию) — классический признак exit-intent на десктопе.
    // Один раз за вкладку (sessionStorage), не мешает уже открытому диалогу.
    const exitDlg = $("#exit-dlg");
    if (exitDlg) {
      $("#exit-skip")?.addEventListener("click", () => exitDlg.close());
      document.addEventListener("mouseleave", (e) => {
        if (e.clientY > 0) return;
        if (sessionStorage.getItem("katiai_exit_shown")) return;
        if (document.querySelectorAll("dialog[open]").length) return;
        sessionStorage.setItem("katiai_exit_shown", "1");
        exitDlg.showModal();
      });
    }
    const drop = $("#drop");
    drop.addEventListener("click", () => $("#file").click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    $("#file").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    $("#camera").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    $("#camera-btn").addEventListener("click", () => $("#camera").click());
    document.addEventListener("paste", (e) => {
      const imgs = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile());
      if (imgs.length) { addFiles(imgs); document.getElementById("app").scrollIntoView({ behavior: "smooth" }); }
    });
    $("#go").addEventListener("click", run);
    document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); });
    $("#clear").addEventListener("click", () => {
      state.files.forEach((f) => URL.revokeObjectURL(f.url));
      state.files = []; state.result = { text: "", markdown: "", translation: "" }; state.unclear = false;
      renderThumbs(); setView("text"); setStatus(""); setBar(0);
    });
    $$(".mode [data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    $$(".tabs [data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
    $("#editor").addEventListener("input", (e) => { state.result[state.view] = e.target.value; });
    $("#copy").addEventListener("click", async () => {
      const content = $("#editor").value;
      try {
        if (state.view === "markdown" && window.ClipboardItem && window.KatiaiMdHtml) {
          const html = KatiaiMdHtml.toHtml(content);
          await navigator.clipboard.write([new ClipboardItem({
            "text/plain": new Blob([content], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          })]);
        } else {
          await navigator.clipboard.writeText(content);
        }
        setStatus(t("app.copied"), "ok");
      } catch { $("#editor").select(); document.execCommand("copy"); setStatus(t("app.copied"), "ok"); }
    });
    $("#fname").addEventListener("input", (e) => { e.target.dataset.touched = "1"; });
    $$(".exports [data-fmt]").forEach((b) => b.addEventListener("click", () => doExport(b.dataset.fmt)));
    $("#spdf").addEventListener("click", searchablePdf);
    $("#send-mail").addEventListener("click", sendEmail);
    $("#watch-ad").addEventListener("click", watchAd);
    $("#history-clear").addEventListener("click", () => { if (confirm(t("app.history_confirm"))) { store.set("katiai.history", []); renderHistory(); } });
    $("#history-select-all").addEventListener("change", (e) => {
      document.querySelectorAll(".history-check").forEach((c) => { c.checked = e.target.checked; });
      updateHistoryBatchState();
    });
    $("#history-send-mail").addEventListener("click", sendHistoryBatch);

    $("#lang").addEventListener("change", (e) => { state.lang = e.target.value; store.set("katiai.lang", state.lang); applyI18n(); loadMe(); });
    $("#theme").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next; store.set("katiai.theme", next);
    });
    $("#account-btn").addEventListener("click", async () => {
      if (!state.me.authenticated) return openLogin();
      await loadMe(); // тариф/автопродление могли смениться (другая вкладка, вебхук) — не доверять памяти
      openAccount();
    });
    $("#login-send").addEventListener("click", sendLogin);
    $("#login-email").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendLogin(); } });
    $("#acc-upgrade").addEventListener("click", () => { $("#account-dlg").close(); openBuy(); });
    $("#topup-btn").addEventListener("click", topup);
    $("#acc-cancel").addEventListener("click", async () => {
      if (!confirm(t("account.cancel_confirm"))) return;
      try { await api("/api/billing/cancel", { method: "POST" }); await loadMe(); openAccount(); }
      catch (e) { $("#acc-renew").textContent = errText(e); }
    });
    $("#acc-logout").addEventListener("click", async () => {
      try { await api("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
      $("#account-dlg").close(); await loadMe();
    });
    $("#pay-yk").addEventListener("click", () => pay("yookassa"));
    $("#pay-stripe").addEventListener("click", () => pay("stripe"));

    // reveal on scroll + 3D tilt on bento tiles
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.12 });
    $$(".reveal").forEach((el) => io.observe(el));
    if (matchMedia("(pointer:fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      $$("[data-tilt]").forEach((el) => {
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = `perspective(900px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg)`;
        });
        el.addEventListener("pointerleave", () => { el.style.transform = ""; });
      });
    }
  }

  function handleHash() {
    if (location.hash === "#account" && state.me.authenticated) { history.replaceState(null, "", location.pathname + location.search); openAccount(); }
    if (location.hash === "#linked" && state.me.authenticated) {
      history.replaceState(null, "", location.pathname + location.search);
      openAccount();
      $("#acc-renew").textContent = t("account.linked");
    }
    if (location.hash === "#login-expired") { history.replaceState(null, "", location.pathname + location.search); openLogin(t("login.expired")); }
  }

  async function init() {
    const theme = store.get("katiai.theme", null);
    if (theme) document.documentElement.dataset.theme = theme;
    state.lang = pickLang();
    fillOcrLangs();
    wire();
    setMode("free");
    applyI18n();
    setView("text");
    await loadConfig();
    applyI18n();
    await loadMe();
    handleHash();
  }

  window.KaTiAi = { state, t, setView }; // for debugging and tests
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
