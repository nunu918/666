// server.js —— 实时 BTC 套利监控（Lighter × Paradex）
// - 无图表版本（你要求）
// - 自动刷新 + 手动刷新均可用
// - 后台每 3 秒采样一次，持续记录 15 分钟的数据

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------
// 参数设置
// ---------------------------
const WINDOW_MS = 15 * 60 * 1000; // 15 分钟
const SAMPLE_INTERVAL_MS = 3000; // 后台采样 3 秒一次

// 历史样本：{ ts, lighter, paraBid, paraAsk }
const samples = [];

// --------------------------- 工具函数 ---------------------------
function fmt(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  return Number(val).toFixed(2);
}
function fmtSigned(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  const v = Number(val).toFixed(2);
  return (val > 0 ? "+" : "") + v;
}

// --------------------------- API 获取价格 ---------------------------
async function fetchPrices() {
  let lighterPrice = null;
  let paraBid = null;
  let paraAsk = null;

  // Lighter
  try {
    const r = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const j = await r.json();
    const raw = Number(j?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(raw)) lighterPrice = raw;
  } catch (e) {
    console.log("Lighter API Error:", e.message);
  }

  // Paradex
  try {
    const r = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const j = await r.json();
    const rawBid = Number(j?.bid);
    const rawAsk = Number(j?.ask);
    if (Number.isFinite(rawBid)) paraBid = rawBid;
    if (Number.isFinite(rawAsk)) paraAsk = rawAsk;
  } catch (e) {
    console.log("Paradex API Error:", e.message);
  }

  return { lighterPrice, paraBid, paraAsk };
}

// --------------------------- 后台采样 ---------------------------
async function takeSample() {
  const { lighterPrice, paraBid, paraAsk } = await fetchPrices();
  const now = Date.now();

  if (lighterPrice == null && paraBid == null && paraAsk == null) return;

  samples.push({
    ts: now,
    lighter: lighterPrice,
    paraBid,
    paraAsk
  });

  // 保留 15 分钟窗口
  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
}

// 每 3 秒采样（后台持续）
setInterval(() => takeSample().catch(() => {}), SAMPLE_INTERVAL_MS);

// 启动时采一次
takeSample();

// --------------------------- 统计 ---------------------------
function calcStats(key) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = [];

  for (const s of samples) {
    if (s.ts < cutoff) continue;

    let spread = null;
    if (key === "A" && s.lighter != null && s.paraBid != null)
      spread = s.lighter - s.paraBid;
    if (key === "B" && s.lighter != null && s.paraAsk != null)
      spread = s.paraAsk - s.lighter;

    if (spread != null && Number.isFinite(spread)) arr.push(spread);
  }

  if (!arr.length) return null;

  return {
    avg: arr.reduce((a, b) => a + b, 0) / arr.length,
    max: Math.max(...arr),
    min: Math.min(...arr),
    count: arr.length
  };
}

// --------------------------- 页面路由 ---------------------------
app.get("/", async (req, res) => {
  // 如果还没数据，强制采一次
  if (!samples.length) await takeSample();

  const last = samples[samples.length - 1] ?? {};
  const lighterPrice = last.lighter ?? null;
  const paraBid = last.paraBid ?? null;
  const paraAsk = last.paraAsk ?? null;

  const spreadA =
    lighterPrice != null && paraBid != null
      ? lighterPrice - paraBid
      : null;

  const spreadB =
    lighterPrice != null && paraAsk != null
      ? paraAsk - lighterPrice
      : null;

  const statsA = calcStats("A");
  const statsB = calcStats("B");

  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>BTC 套利监控（无图版）</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui;
      margin:0;padding:16px;background:#f5f5f7;
    }
    .card {
      background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:12px;
      box-shadow:0 2px 4px rgba(0,0,0,0.03);
    }
    .label {font-size:14px;color:#555;}
    .value {font-size:20px;font-weight:600;margin-top:4px;}
    .row {font-size:16px;margin-top:6px;}
    .small {font-size:12px;color:#888;margin-top:6px;}
  </style>
</head>
<body>

  <h2>BTC 套利监控（Lighter × Paradex）</h2>

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
    <div class="row">方向 A（L 多 - P 空）： <strong>${fmtSigned(spreadA)}</strong></div>
    <div class="row">方向 B（P 多 - L 空）： <strong>${fmtSigned(spreadB)}</strong></div>
  </div>

  <div class="card">
    <div class="row"><strong>15 分钟统计：方向 A</strong></div>
    ${
      statsA
        ? `
      <div class="row">平均：${fmtSigned(statsA.avg)}</div>
      <div class="row">最高：${fmtSigned(statsA.max)}</div>
      <div class="row">最低：${fmtSigned(statsA.min)}</div>
      <div class="small">样本：${statsA.count} 次</div>
      `
        : `<div class="row">暂无数据</div>`
    }

    <div class="row" style="margin-top:12px;"><strong>15 分钟统计：方向 B</strong></div>
    ${
      statsB
        ? `
      <div class="row">平均：${fmtSigned(statsB.avg)}</div>
      <div class="row">最高：${fmtSigned(statsB.max)}</div>
      <div class="row">最低：${fmtSigned(statsB.min)}</div>
      <div class="small">样本：${statsB.count} 次</div>
      `
        : `<div class="row">暂无数据</div>`
    }

    <div class="small">后台每 3 秒采样 · 页面每 3 秒自动刷新 · 手动刷新同样生效</div>
  </div>

  <!-- 自动刷新（不会阻止手动刷新） -->
  <script>
    setTimeout(() => location.reload(), 3000);
  </script>

</body>
</html>
  `);
});

// --------------------------- 启动服务 ---------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server RUNNING on", PORT);
});
