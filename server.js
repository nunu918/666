// server.js —— 实时 BTC 套利监控（Lighter × Paradex）
// （无图表版本，全功能保留）

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 15 分钟窗口（毫秒）
const WINDOW_MS = 15 * 60 * 1000;

// 后台采样间隔：3 秒
const SAMPLE_INTERVAL_MS = 3000;

// 历史样本：{ ts, lighter, paraBid, paraAsk }
const samples = [];

// ========= 工具函数 =========
function fmt(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  return Number(val).toFixed(2);
}
function fmtSigned(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  const v = Number(val).toFixed(2);
  return (val > 0 ? "+" : "") + v;
}

// 调 API
async function fetchPrices() {
  let lighterPrice = null;
  let paraBid = null;
  let paraAsk = null;

  try {
    const lightRes = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const lightJson = await lightRes.json();
    const rawL = Number(lightJson?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(rawL)) lighterPrice = rawL;
  } catch {}

  try {
    const paraRes = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const paraJson = await paraRes.json();
    const rawBid = Number(paraJson?.bid);
    const rawAsk = Number(paraJson?.ask);
    if (Number.isFinite(rawBid)) paraBid = rawBid;
    if (Number.isFinite(rawAsk)) paraAsk = rawAsk;
  } catch {}

  return { lighterPrice, paraBid, paraAsk };
}

// 后台采样
async function takeSample() {
  const { lighterPrice, paraBid, paraAsk } = await fetchPrices();
  const now = Date.now();

  samples.push({
    ts: now,
    lighter: lighterPrice,
    paraBid,
    paraAsk
  });

  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
}

// 统计
function calcStats(directionKey) {
  const cutoff = Date.now() - WINDOW_MS;
  const values = [];

  for (const s of samples) {
    if (s.ts < cutoff) continue;

    let spread = null;
    if (directionKey === "A" && s.lighter != null && s.paraBid != null)
      spread = s.lighter - s.paraBid;
    if (directionKey === "B" && s.lighter != null && s.paraAsk != null)
      spread = s.paraAsk - s.lighter;

    if (spread != null && Number.isFinite(spread)) values.push(spread);
  }

  if (!values.length) return null;

  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
    count: values.length
  };
}

// 后台定时采样
setInterval(() => takeSample(), SAMPLE_INTERVAL_MS);
takeSample();

// ========= 页面路由 =========
app.get("/", async (req, res) => {
  if (!samples.length) await takeSample();

  const last = samples[samples.length - 1];

  const lighterPrice = last.lighter;
  const paraBid = last.paraBid;
  const paraAsk = last.paraAsk;

  const spreadA = (lighterPrice - paraBid);
  const spreadB = (paraAsk - lighterPrice);

  const statsA = calcStats("A");
  const statsB = calcStats("B");

  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>BTC 套利监控（Lighter × Paradex）</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family:-apple-system,BlinkMacSystemFont; margin:0; padding:16px; background:#f5f5f7; }
  .title { font-size:24px; font-weight:700; margin-bottom:16px; }
  .card {
    background:white; border-radius:12px; padding:12px 16px; margin-bottom:12px;
    box-shadow:0 2px 4px rgba(0,0,0,0.03);
  }
  .label { font-size:14px; color:#555; }
  .value { font-size:20px; font-weight:600; margin-top:4px; }
  .stat-row { margin-top:6px; font-size:15px; }
  .small { font-size:12px; color:#888; margin-top:6px; }
</style>
</head>

<body>

<div class="title">BTC 套利监控（Lighter × Paradex）</div>

<div class="card">
  <div class="label">Lighter BTC：</div>
  <div class="value">${fmt(lighterPrice)}</div>
</div>

<div class="card">
  <div class="label">Paradex Bid：</div>
  <div class="value">${fmt(paraBid)}</div>
  <div class="label" style="margin-top:8px;">Paradex Ask：</div>
  <div class="value">${fmt(paraAsk)}</div>
</div>

<div class="card">
  <div class="label" style="font-weight:600;">即时价差（最新）</div>
  <div class="stat-row">方向 A（L 多 - P 空）：<strong>${fmtSigned(spreadA)}</strong></div>
  <div class="stat-row">方向 B（P 多 - L 空）：<strong>${fmtSigned(spreadB)}</strong></div>
</div>

<div class="card">
  <div class="label" style="font-weight:600;">15 分钟统计（后台持续）</div>

  <div class="stat-row"><strong>方向 A</strong></div>
  ${
    statsA ? `
      <div class="stat-row">平均：${fmtSigned(statsA.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(statsA.max)}</div>
      <div class="stat-row">最低：${fmtSigned(statsA.min)}</div>
      <div class="small">样本：${statsA.count} 次</div>
    ` : `<div class="stat-row">暂无数据</div>`
  }

  <div class="stat-row" style="margin-top:10px;"><strong>方向 B</strong></div>
  ${
    statsB ? `
      <div class="stat-row">平均：${fmtSigned(statsB.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(statsB.max)}</div>
      <div class="stat-row">最低：${fmtSigned(statsB.min)}</div>
      <div class="small">样本：${statsB.count} 次</div>
    ` : `<div class="stat-row">暂无数据</div>`
  }

  <div class="small" style="margin-top:10px;">
    后台采样每 3 秒 · 页面自动刷新每 3 秒（保留手动刷新功能）
  </div>
</div>

<script>
  setTimeout(() => location.reload(), 3000);
</script>

</body>
</html>
  `);
});

app.listen(PORT, "0.0.0.0", () => console.log("Server RUNNING", PORT));
