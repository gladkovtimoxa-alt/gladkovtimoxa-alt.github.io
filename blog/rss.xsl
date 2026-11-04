<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/rss/channel">
<html lang="ru"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title><xsl:value-of select="title"/></title>
<style>
:root{--bg:#0B0A12;--fg:#F2F0FA;--muted:#A3A3B5;--accent:#3DF5C8}
body{background:var(--bg);color:var(--fg);font:16px/1.65 Onest,system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px 16px 80px}
a{color:var(--accent)} h1{font-size:30px} h2{font-size:20px;margin:0 0 6px}
.muted{color:var(--muted)} .card{border-top:1px solid rgba(255,255,255,.12);padding:20px 0}
.badge{display:inline-block;background:rgba(61,245,200,.12);color:var(--accent);border-radius:6px;padding:2px 8px;font-size:13px;margin-bottom:16px}
</style></head><body>
<p><a href="{link}">&#8592; Блог KaTiAi</a></p>
<span class="badge">RSS-лента</span>
<h1><xsl:value-of select="title"/></h1>
<p class="muted"><xsl:value-of select="description"/></p>
<p class="muted">Это техническая страница RSS-фида — она не предназначена для чтения в браузере.
Скопируйте адрес из адресной строки и добавьте его в RSS-читалку, чтобы получать новые статьи.</p>
<xsl:for-each select="item">
<div class="card">
<h2><a href="{link}"><xsl:value-of select="title"/></a></h2>
<p class="muted"><xsl:value-of select="pubDate"/></p>
<p><xsl:value-of select="description"/></p>
</div>
</xsl:for-each>
</body></html>
</xsl:template>
</xsl:stylesheet>
