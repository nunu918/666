// server.js —— BTC 套利监控（Lighter × Paradex）
// - 自动刷新：每 3 秒刷新一次页面
// - 手动刷新：立即调用 API（优先级最高）
// - 无图表版 + 放大 UI
// - 保留后台 15 分钟统计（持续运行）

import express from "express";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const WINDOW_MS = 15 * 60 * 1000; // 15 min
const SAMPLE_INTERVAL_MS = 3000; // 3 sec

const BTC_MARKET_ID = 1;
const ETH_MARKET_ID = 2;
const BTC_SYMBOL = "BTC-USD-PERP";
const ETH_SYMBOL = "ETH-USD-PERP";

// 历史采样
const btcSamples = [];
const ethSamples = [];

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
async function fetchLighterPrice(marketId) {
  try {
    const r = await fetch(
      `https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=${marketId}`
    );
    const j = await r.json();
    const raw = Number(j?.order_book_details?.[0]?.last_trade_price);
    return Number.isFinite(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function fetchParadexBbo(symbol) {
  try {
    const r = await fetch(`https://api.prod.paradex.trade/v1/bbo/${symbol}`);
    const j = await r.json();
    const bid = Number(j?.bid);
    const ask = Number(j?.ask);
    return {
      bid: Number.isFinite(bid) ? bid : null,
      ask: Number.isFinite(ask) ? ask : null
    };
  } catch {
    return { bid: null, ask: null };
  }
}

// ------- 记录样本 -------
function recordSample(samples, now, lighterPrice, paraBid, paraAsk) {
  if (lighterPrice == null && paraBid == null && paraAsk == null) return;

  samples.push({ ts: now, lighter: lighterPrice, paraBid, paraAsk });

  // 只保留 15 分钟的
  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
}

async function takeSample() {
  const [
    lighterBtcPrice,
    lighterEthPrice,
    paradexBtc,
    paradexEth
  ] = await Promise.all([
    fetchLighterPrice(BTC_MARKET_ID),
    fetchLighterPrice(ETH_MARKET_ID),
    fetchParadexBbo(BTC_SYMBOL),
    fetchParadexBbo(ETH_SYMBOL)
  ]);
  const now = Date.now();

  recordSample(btcSamples, now, lighterBtcPrice, paradexBtc.bid, paradexBtc.ask);
  recordSample(ethSamples, now, lighterEthPrice, paradexEth.bid, paradexEth.ask);
}

// ------- 统计 -------
function calcStats(direction, sourceSamples = [], now = Date.now()) {
  const cutoff = now - WINDOW_MS;
  const arr = [];

  for (const s of sourceSamples) {
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

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

// ------- 后台每 3 秒采样（手动刷新时另触发一次） -------
if (isMain) {
  setInterval(() => takeSample(), SAMPLE_INTERVAL_MS);
  takeSample(); // 启动时先采一次
}

// ------- 页面 -------
app.get("/", async (req, res) => {
  // ★ 手动刷新时，立即采样（最高优先级）
  if (req.query.manual === "1") {
    await takeSample();
  }

  const lastBtc = btcSamples[btcSamples.length - 1] || {};
  const lastEth = ethSamples[ethSamples.length - 1] || {};
  const lighterPrice = lastBtc.lighter ?? null;
  const paraBid = lastBtc.paraBid ?? null;
  const paraAsk = lastBtc.paraAsk ?? null;
  const ethLighterPrice = lastEth.lighter ?? null;
  const ethParaBid = lastEth.paraBid ?? null;
  const ethParaAsk = lastEth.paraAsk ?? null;

  const spreadA =
    lighterPrice != null && paraBid != null ? lighterPrice - paraBid : null;

  const spreadB =
    lighterPrice != null && paraAsk != null ? paraAsk - lighterPrice : null;

  const ethSpreadA =
    ethLighterPrice != null && ethParaBid != null
      ? ethLighterPrice - ethParaBid
      : null;

  const ethSpreadB =
    ethLighterPrice != null && ethParaAsk != null
      ? ethParaAsk - ethLighterPrice
      : null;

  const statsA = calcStats("A", btcSamples);
  const statsB = calcStats("B", btcSamples);
  const ethStatsA = calcStats("A", ethSamples);
  const ethStatsB = calcStats("B", ethSamples);

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
  .button {
    font-size: 18px;
    padding: 10px 16px;
    border-radius: 10px;
    border: none;
    background: #2f6fed;
    color: #fff;
    cursor: pointer;
  }
</style>
</head>
<body>

<div class="title">BTC / ETH 套利监控（L × P）</div>

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
  <div class="spread-title">BTC 15 分钟统计</div>

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

<div class="card">
  <div class="label">Lighter ETH：</div>
  <div class="value">${fmt(ethLighterPrice)}</div>
</div>

<div class="card">
  <div class="label">Paradex ETH Bid：</div>
  <div class="value">${fmt(ethParaBid)}</div>
  <div class="label" style="margin-top:10px;">Paradex ETH Ask：</div>
  <div class="value">${fmt(ethParaAsk)}</div>
</div>

<div class="card">
  <div class="spread-title">ETH 即时价差</div>
  <div class="stat-row">方向 A（买 L / 卖 P）：<strong>${fmtSigned(ethSpreadA)}</strong></div>
  <div class="stat-row">方向 B（买 P / 卖 L）：<strong>${fmtSigned(ethSpreadB)}</strong></div>
</div>

<div class="card">
  <div class="spread-title">ETH 15 分钟统计</div>

  <div class="stat-row"><strong>方向 A</strong></div>
  ${
    ethStatsA
      ? `
      <div class="stat-row">平均：${fmtSigned(ethStatsA.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(ethStatsA.max)}</div>
      <div class="stat-row">最低：${fmtSigned(ethStatsA.min)}</div>
      <div class="small">样本：${ethStatsA.count} 次</div>`
      : `<div class="stat-row">暂无数据</div>`
  }

  <div class="stat-row" style="margin-top:14px;"><strong>方向 B</strong></div>
  ${
    ethStatsB
      ? `
      <div class="stat-row">平均：${fmtSigned(ethStatsB.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(ethStatsB.max)}</div>
      <div class="stat-row">最低：${fmtSigned(ethStatsB.min)}</div>
      <div class="small">样本：${ethStatsB.count} 次</div>`
      : `<div class="stat-row">暂无数据</div>`
  }

  <div class="small" style="margin-top:12px;">
    后台采样 3 秒 · 页面自动刷新 3 秒 · 手动刷新立即更新
  </div>
</div>

<div class="card">
  <button class="button" onclick="location.href='/?manual=1'">手动刷新</button>
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
if (isMain) {
  app.listen(PORT, "0.0.0.0", () =>
    console.log("Server running on port", PORT)
  );
}

export { calcStats, fmt, fmtSigned };
