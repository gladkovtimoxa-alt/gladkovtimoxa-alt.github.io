/* Отдельный бесплатный инструмент в конце главной страницы — без входа, без Pro, без сервера.
   Изолирован от app.js: свои id (ft-*), свой воркер Tesseract, ничего общего состояния. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);

  const OCR_LANGS = [
    ["rus+eng", "Русский + English"], ["eng", "English"], ["rus", "Русский"], ["ukr", "Українська"], ["bel", "Беларуская"],
    ["kaz", "Қазақша"], ["uzb", "Oʻzbekcha"], ["spa", "Español"], ["deu", "Deutsch"], ["fra", "Français"], ["por", "Português"],
    ["ita", "Italiano"], ["tur", "Türkçe"], ["pol", "Polski"], ["ces", "Čeština"], ["nld", "Nederlands"],
    ["chi_sim", "简体中文"], ["chi_tra", "繁體中文"], ["jpn", "日本語"], ["kor", "한국어"], ["ara", "العربية"],
    ["heb", "עברית"], ["hin", "हिन्दी"], ["vie", "Tiếng Việt"], ["tha", "ไทย"], ["ell", "Ελληνικά"],
    ["hye", "Հայերեն"], ["kat", "ქართული"], ["aze", "Azərbaycanca"],
  ];

  let files = [];
  let worker = null;
  let workerLang = null;
  let busy = false;

  function t(key, fallback) {
    const dict = (window.KATI_I18N || {})[document.documentElement.lang] || {};
    return dict[key] || fallback;
  }

  function setStatus(msg) { const el = $("#ft-status"); if (el) el.textContent = msg; }
  function setBar(pct) { const el = $("#ft-bar"); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + "%"; }
  function updateGo() { $("#ft-go").disabled = busy || !files.length; }

  function populateLangs() {
    const sel = $("#ft-lang");
    if (!sel || sel.options.length) return;
    for (const [code, label] of OCR_LANGS) sel.appendChild(new Option(label, code));
    try { const saved = localStorage.getItem("katiai.ocrLang"); if (saved) sel.value = JSON.parse(saved); } catch { /* ignore */ }
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

  async function getWorker(lang, onProgress) {
    if (worker && workerLang === lang) return worker;
    if (worker) { try { await worker.terminate(); } catch { /* ignore */ } worker = null; }
    setStatus(t("app.loading_lang", "Загружаем язык…"));
    worker = await window.Tesseract.createWorker(lang.split("+"), 1, {
      logger: (m) => { if (m.status === "recognizing text" && onProgress) onProgress(m.progress); },
    });
    workerLang = lang;
    return worker;
  }

  async function recognize() {
    if (busy || !files.length) return;
    if (typeof window.Tesseract === "undefined" || typeof WebAssembly !== "object") {
      setStatus(t("err.offline_unavailable", "Бесплатное распознавание недоступно в этом браузере."));
      return;
    }
    busy = true; updateGo();
    const lang = $("#ft-lang").value || "rus+eng";
    try { localStorage.setItem("katiai.ocrLang", JSON.stringify(lang)); } catch { /* ignore */ }
    const texts = [];
    const total = files.length;
    try {
      for (let i = 0; i < total; i++) {
        setStatus(t("app.progress", "Страница {n} из {total}").replace("{n}", i + 1).replace("{total}", total));
        const w = await getWorker(lang, (p) => setBar(((i + p) / total) * 100));
        const { data } = await w.recognize(await toCanvas(files[i]));
        texts.push((data.text || "").replace(/\s+$/g, ""));
        setBar(((i + 1) / total) * 100);
      }
      $("#ft-editor").value = texts.join("\n\n");
      setStatus("");
    } catch (e) {
      console.warn("free-tool OCR failed", e);
      setStatus(t("err.generic", "Не получилось распознать. Попробуйте ещё раз."));
    } finally {
      busy = false; updateGo(); setBar(0);
    }
  }

  function clearAll() {
    files = []; updateGo();
    $("#ft-editor").value = "";
    setStatus(""); setBar(0);
  }

  function addFiles(list) {
    files = files.concat([...list].filter((f) => f.type.startsWith("image/")));
    updateGo();
  }

  function downloadTxt() {
    const text = $("#ft-editor").value;
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "katiai.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function wire() {
    const drop = $("#ft-drop");
    if (!drop) return; // секции нет на странице — ничего не делаем
    populateLangs();
    drop.addEventListener("click", () => $("#ft-file").click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#ft-file").click(); } });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    $("#ft-file").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    $("#ft-go").addEventListener("click", recognize);
    $("#ft-clear").addEventListener("click", clearAll);
    $("#ft-copy").addEventListener("click", () => { $("#ft-editor").select(); navigator.clipboard?.writeText($("#ft-editor").value); });
    $("#ft-txt").addEventListener("click", downloadTxt);
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", wire) : wire();
})();
