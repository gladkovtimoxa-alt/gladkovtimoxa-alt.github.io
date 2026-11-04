// Markdown → HTML, в точности то же подмножество, что разбирает export.py:blocks()
// (заголовки # .. ######, списки -/*/N., таблицы |...|, абзацы). Нужно только для
// кнопки «Копировать»: чтобы вставка в Google Docs/Word сохраняла структуру, а не
// отдавала голый текст с решётками. Специально не полноценный CommonMark — ровно
// тот же разбор, что уже знает серверный экспорт в DOCX/PDF/ODT.
(function (global) {
  "use strict";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function blocks(md) {
    const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let para = [];
    const flush = () => {
      if (para.length) { out.push(["p", para.map((s) => s.trim()).join(" ")]); para = []; }
    };
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const stripped = line.trim();
      if (stripped.startsWith("|")) {
        flush();
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
          const isSep = cells.every((c) => !c || /^:?-{2,}:?$/.test(c)) && cells.some(Boolean);
          if (!isSep) rows.push(cells);
          i += 1;
        }
        const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
        if (rows.length) out.push(["table", rows.map((r) => r.concat(Array(width - r.length).fill("")))]);
        continue;
      }
      const h = stripped.match(/^(#{1,6})\s+(.*)$/);
      const li = stripped.match(/^([-*•]|\d+[.)])\s+(.*)$/);
      if (h) { flush(); out.push(["h", h[1].length, h[2]]); }
      else if (li) { flush(); out.push(["li", li[2]]); }
      else if (!stripped) { flush(); }
      else { para.push(line); }
      i += 1;
    }
    flush();
    return out;
  }

  function toHtml(md) {
    const parts = [];
    let inList = false;
    const closeList = () => { if (inList) { parts.push("</ul>"); inList = false; } };
    for (const b of blocks(md)) {
      if (b[0] !== "li") closeList();
      if (b[0] === "h") {
        const lvl = Math.min(b[1], 4);
        parts.push(`<h${lvl}>${esc(b[2])}</h${lvl}>`);
      } else if (b[0] === "li") {
        if (!inList) { parts.push("<ul>"); inList = true; }
        parts.push(`<li>${esc(b[1])}</li>`);
      } else if (b[0] === "table") {
        const rows = b[1];
        const trs = rows.map((row) => "<tr>" + row.map((c) => `<td>${esc(c)}</td>`).join("") + "</tr>").join("");
        parts.push(`<table border="1" cellpadding="4" style="border-collapse:collapse">${trs}</table>`);
      } else {
        parts.push(`<p>${esc(b[1])}</p>`);
      }
    }
    closeList();
    return parts.join("\n");
  }

  global.KatiaiMdHtml = { toHtml };
})(window);
