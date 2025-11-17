// server.js —— 后台持续抓数据 + 15 分钟统计 + 前端自动刷新

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------
// 15 分钟窗口（毫秒）
// ---------------------------
const WINDOW_MS = 15 * 60 * 1000;

// spreadHistory: { ts, spreadA, spreadB }
const spreadHistory = [];

// ---------------------------
// 工具函数
// ---------------------------
function fmt(v) {
  return Number.isFinite(v) ? Number(v).toFixed(2) : "—";
}

function fmtSigned(v) {
  return Number.isFinite(v)
    ? (v > 0 ? "+" : "") + Number(v).toFixed(2)
    : "—";
}

// 添加样本（后台用）
function addSample(spreadA, spreadB) {
  if (!Number.isFinite(spreadA) && !Number.isFinite(spreadB)) return;

  const now = Date.now();
  spreadHistory.push({ ts: now, spreadA, spreadB });

  // 仅保留 15 分钟内
  const cutoff = now - WINDOW_MS;
  while (spreadHistory.length && spreadHistory[0].ts < cutoff) {
    spreadHistory.shift();
  }
}

function getStats(key) {
  const arr = spreadHistory
    .map((i) => i[key])
    .filter((x) => Number.isFinite(x));

  if (arr.length === 0) return null;

  return {
    avg: arr.reduce((a, b) => a + b, 0) / arr.length,
    max: Math.max(...arr),
    min: Math.min(...arr),
    count: arr.length,
  };
}

// ---------------------------
// 后台持续抓数据（每 3 秒）
// ---------------------------
async function fetchPrices() {
  try {
    // Lighter
    let lighter = null;
    try {
      const r = await fetch(
        "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
      );
      const j = await r.json();
      const v = Number(j?.order_book_details?.[0]?.last_trade_price);
      if (Number.isFinite(v)) lighter = v;
    } catch {}

    // Paradex
    let bid = null,
      ask = null;
    try {
      const r = await fetch(
        "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
      );
      const j = await r.json();
      const b = Number(j?.bid);
      const a = Number(j?.ask);
      if (Number.isFinite(b)) bid = b;
      if (Number.isFinite(a)) ask = a;
    } catch {}

    // spreadA: Lighter - bid
    let spreadA = null;
    if (Number.isFinite(lighter) && Number.isFinite(bid)) {
      spreadA = lighter - bid;
    }

    // spreadB: ask - Lighter
    let spreadB = null;
    if (Number.isFinite(lighter) && Number.isFinite(ask)) {
      spreadB = ask - lighter;
    }

    // 存入 15 分钟窗口
    addSample(spreadA, spreadB);
  } catch (e) {
    console.log("后台抓取错误：", e.message);
  }
}

// **后台每 3 秒自动抓取**
setInterval(fetchPrices, 3000);

// ---------------------------
// 前端展示页面
// ---------------------------
app.get("/", async (req, res) => {
  // 当前最新价（实时再拉一次 API）
  let lighter = null;
  let bid = null;
  let ask = null;

  try {
    const r = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const j = await r.json();
    const v = Number(j?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(v)) lighter = v;
  } catch {}

  try {
    const r = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const j = await r.json();
    const b = Number(j?.bid);
    const a = Number(j?.ask);
    if (Number.isFinite(b)) bid = b;
    if (Number.isFinite(a)) ask = a;
  } catch {}

  let spreadA = null;
  if (Number.isFinite(lighter) && Number.isFinite(bid))
    spreadA = lighter - bid;

  let spreadB = null;
  if (Number.isFinite(lighter) && Number.isFinite(ask))
    spreadB = ask - lighter;

  const statsA = getStats("spreadA");
  const statsB = getStats("spreadB");

  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>BTC 套利监控（后台实时）</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, system-ui;
           margin: 0; padding: 16px; background: #f5f5f7; }
    .card { background: #fff; padding: 16px; border-radius: 12px;
            margin-bottom: 14px; box-shadow: 0 2px 4px #0001; }
    .label { color: #555; font-size: 14px; }
    .value { font-size: 22px; font-weight: 700; margin-top: 6px; }
    .big { font-size: 20px; font-weight: 600; }
    .row { margin-top: 6px; font-size: 16px; }
    .small { font-size: 12px; color: #777; margin-top: 4px; }
  </style>
</head>
<body>

<div class="card">
  <div class="label">Lighter BTC</div>
  <div class="value">${fmt(lighter)}</div>
</div>

<div class="card">
  <div class="label">Paradex Bid</div>
  <div class="value">${fmt(bid)}</div>
  <div class="label" style="margin-top:8px;">Paradex Ask</div>
  <div class="value">${fmt(ask)}</div>
</div>

<div class="card">
  <div class="big">即时价差（最新）</div>
  <div class="row">方向 A（L 多 - P 空）: <strong>${fmtSigned(spreadA)}</strong></div>
  <div class="row">方向 B（P 多 - L 空）: <strong>${fmtSigned(spreadB)}</strong></div>
</div>

<div class="card">
  <div class="big">15 分钟统计（后台持续）</div>

  <div class="row" style="margin-top:10px;"><strong>方向 A</strong></div>
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

  <div class="row" style="margin-top:12px;"><strong>方向 B</strong></div>
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

  <div class="small" style="margin-top:10px;">
    （数据来自后台，每 3 秒自动抓取）
  </div>
</div>

<!-- 网页自动刷新，每 3 秒同步后台 -->
<script>
  setTimeout(() => location.reload(), 3000);
</script>

</body>
</html>
  `);
});

// ---------------------------
// Render 部署必须监听 0.0.0.0
// ---------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server RUNNING on", PORT);
});
