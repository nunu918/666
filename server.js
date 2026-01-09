// server.js —— BTC 套利监控（Lighter × Paradex）
// - 自动刷新：每 3 秒刷新一次页面
// - 手动刷新：立即调用 API（优先级最高）
// - 无图表版 + 放大 UI
// - 保留后台 15 分钟统计（持续运行）

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const SAMPLE_INTERVAL_MS = 3000;  // 3 sec

// 历史采样
const samples = [];

// ------- 工具函数 -------
function fmt(val) {
  return val == null || !Number.isFinite(val) ? "—" : Number(val).toFixed(2);
}
function fmtSigned(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  const v = Number(val).toFixed(2);
  return (val > 0 ? "+" : "") + v;
}

// ------- API 拉取 -------
async function fetchPrices() {
  let lighterPrice = null;
  let paraBid = null;
  let paraAsk = null;

  try {
    const r = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const j = await r.json();
    const raw = Number(j?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(raw)) lighterPrice = raw;
  } catch {}

  try {
    const r = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const j = await r.json();
    const bid = Number(j?.bid);
    const ask = Number(j?.ask);
    if (Number.isFinite(bid)) paraBid = bid;
    if (Number.isFinite(ask)) paraAsk = ask;
  } catch {}

  return { lighterPrice, paraBid, paraAsk };
}

// ------- 记录样本 -------
async function takeSample() {
  const { lighterPrice, paraBid, paraAsk } = await fetchPrices();
  const now = Date.now();
  if (lighterPrice == null && paraBid == null && paraAsk == null) return;

  samples.push({ ts: now, lighter: lighterPrice, paraBid, paraAsk });

  // 只保留 15 分钟的
  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
}

// ------- 统计 -------
function calcStats(direction) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = [];

  for (const s of samples) {
    if (s.ts < cutoff) continue;

    let v = null;
    if (direction === "A" && s.lighter != null && s.paraBid != null)
      v = s.lighter - s.paraBid;

    if (direction === "B" && s.lighter != null && s.paraAsk != null)
      v = s.paraAsk - s.lighter;

    if (v != null && Number.isFinite(v)) arr.push(v);
  }

  if (!arr.length) return null;
  return {
    avg: arr.reduce((a, b) => a + b, 0) / arr.length,
    max: Math.max(...arr),
    min: Math.min(...arr),
    count: arr.length
  };
}

// ------- 后台每 3 秒采样 -------
setInterval(() => takeSample(), SAMPLE_INTERVAL_MS);
takeSample(); // 启动时先采一次

// ------- 页面 -------
app.get("/", async (req, res) => {
  // ★ 手动刷新时，立即采样（最高优先级）
  await takeSample();

  const last = samples[samples.length - 1] || {};
  const lighterPrice = last.lighter ?? null;
  const paraBid = last.paraBid ?? null;
  const paraAsk = last.paraAsk ?? null;

  const spreadA =
    lighterPrice != null && paraBid != null ? lighterPrice - paraBid : null;

  const spreadB =
    lighterPrice != null && paraAsk != null ? paraAsk - lighterPrice : null;

  const statsA = calcStats("A");
  const statsB = calcStats("B");

  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>BTC 套利监控</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont; 
    margin: 0; padding: 18px; background:#f0f0f5;
    font-size: 20px;
  }
  .title { font-size: 28px; font-weight:700; margin-bottom:16px; }
  .card {
    background:#fff; border-radius:14px; padding:18px; margin-bottom:14px;
    box-shadow:0 2px 5px rgba(0,0,0,0.05);
  }
  .label { font-size:17px; color:#666; }
  .value { font-size:23px; font-weight:700; margin-top:6px; }
  .spread-title { font-size:20px; font-weight:700; }
  .stat-row { margin-top:8px; font-size:17px; }
  .small { font-size:14px; color:#888; margin-top:6px; }
</style>
</head>
<body>

<div class="title">BTC 套利监控（L × P）</div>

<div class="card">
  <div class="label">Lighter BTC：</div>
  <div class="value">${fmt(lighterPrice)}</div>
</div>

<div class="card">
  <div class="label">Paradex Bid：</div>
  <div class="value">${fmt(paraBid)}</div>
  <div class="label" style="margin-top:10px;">Paradex Ask：</div>
  <div class="value">${fmt(paraAsk)}</div>
</div>

<div class="card">
  <div class="spread-title">即时价差</div>
  <div class="stat-row">方向 A（买 L / 卖 P）：<strong>${fmtSigned(spreadA)}</strong></div>
  <div class="stat-row">方向 B（买 P / 卖 L）：<strong>${fmtSigned(spreadB)}</strong></div>
</div>

<div class="card">
  <div class="spread-title">15 分钟统计</div>

  <div class="stat-row"><strong>方向 A</strong></div>
  ${
    statsA
      ? `
      <div class="stat-row">平均：${fmtSigned(statsA.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(statsA.max)}</div>
      <div class="stat-row">最低：${fmtSigned(statsA.min)}</div>
      <div class="small">样本：${statsA.count} 次</div>`
      : `<div class="stat-row">暂无数据</div>`
  }

  <div class="stat-row" style="margin-top:14px;"><strong>方向 B</strong></div>
  ${
    statsB
      ? `
      <div class="stat-row">平均：${fmtSigned(statsB.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(statsB.max)}</div>
      <div class="stat-row">最低：${fmtSigned(statsB.min)}</div>
      <div class="small">样本：${statsB.count} 次</div>`
      : `<div class="stat-row">暂无数据</div>`
  }

  <div class="small" style="margin-top:12px;">
    后台采样 3 秒 · 页面自动刷新 3 秒 · 手动刷新立即更新
  </div>
</div>

<!-- 自动刷新（不会影响手动刷新） -->
<script>
  setInterval(() => {
    location.reload();
  }, 3000);
</script>

</body>
</html>
`);
});

// 监听
app.listen(PORT, "0.0.0.0", () =>
  console.log("Server RUNNING on port", PORT)
);
