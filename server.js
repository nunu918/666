// server.js —— 后台自动抓价差 + 15分钟统计，网页只显示结果

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 15 分钟窗口（毫秒）
const WINDOW_MS = 15 * 60 * 1000;

// 保存价差历史：{ ts, spreadA, spreadB }
const spreadHistory = [];

// 当前最新价格（给网页用）
let lighterPrice = null;
let paraBid = null;
let paraAsk = null;
let spreadA = null;
let spreadB = null;

// ========= 工具函数 =========
function fmt(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  return Number(val).toFixed(2);
}

function fmtSigned(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  return (val > 0 ? "+" : "") + Number(val).toFixed(2);
}

function addSpreadSample() {
  if (!Number.isFinite(spreadA) && !Number.isFinite(spreadB)) return;

  const now = Date.now();
  spreadHistory.push({ ts: now, spreadA, spreadB });

  // 保留最近 15 分钟
  const cutoff = now - WINDOW_MS;
  while (spreadHistory.length && spreadHistory[0].ts < cutoff) {
    spreadHistory.shift();
  }
}

function calcStats(key) {
  const values = spreadHistory
    .map((i) => i[key])
    .filter((v) => Number.isFinite(v));

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  return {
    avg: sum / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
    count: values.length
  };
}

// ========= 核心：后台每 3 秒自动抓取 =========

async function fetchPrices() {
  try {
    // Lighter
    const lightRes = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const lightJson = await lightRes.json();
    const rawL = Number(lightJson?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(rawL)) lighterPrice = rawL;
  } catch (err) {
    console.log("Lighter API Error:", err.message || err);
  }

  try {
    // Paradex
    const paraRes = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const paraJson = await paraRes.json();
    const rawBid = Number(paraJson?.bid);
    const rawAsk = Number(paraJson?.ask);
    if (Number.isFinite(rawBid)) paraBid = rawBid;
    if (Number.isFinite(rawAsk)) paraAsk = rawAsk;
  } catch (err) {
    console.log("Paradex API Error:", err.message || err);
  }

  // 计算价差
  if (Number.isFinite(lighterPrice) && Number.isFinite(paraBid)) {
    spreadA = lighterPrice - paraBid;
  }
  if (Number.isFinite(lighterPrice) && Number.isFinite(paraAsk)) {
    spreadB = paraAsk - lighterPrice;
  }

  // 写入 15 分钟窗口
  addSpreadSample();
}

// 后台自动抓取（每 3 秒）
setInterval(fetchPrices, 3000);
fetchPrices(); // 初始化先抓一次

// ========= 网页路由（只读数据） =========

app.get("/", (req, res) => {
  const statsA = calcStats("spreadA");
  const statsB = calcStats("spreadB");

  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BTC 套利监控（后台实时）</title>
  <style>
    body { font-family: -apple-system; padding: 16px; background: #f5f5f7;}
    .card { background: #fff; padding: 16px; margin-bottom: 12px;
            border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);}
    .title { font-size: 24px; font-weight: 700; margin-bottom: 16px;}
    .label { font-size: 14px; color: #666;}
    .value { font-size: 20px; font-weight: 600; margin-top: 6px;}
    .stat { font-size: 15px; margin-top: 6px;}
    .small { font-size: 12px; color: #777; margin-top: 6px;}
  </style>
</head>
<body>

  <div class="title">BTC 套利监控（后台实时）</div>

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
    <div class="label">即时价差</div>
    <div class="stat">方向 A（L 多 - P 空）： <strong>${fmtSigned(spreadA)}</strong></div>
    <div class="stat">方向 B（P 多 - L 空）： <strong>${fmtSigned(spreadB)}</strong></div>
  </div>

  <div class="card">
    <div class="label">15 分钟统计（后台持续）</div>

    <div style="margin-top:10px;"><strong>方向 A</strong></div>
    ${
      statsA
        ? `
      <div class="stat">平均：${fmtSigned(statsA.avg)}</div>
      <div class="stat">最高：${fmtSigned(statsA.max)}</div>
      <div class="stat">最低：${fmtSigned(statsA.min)}</div>
      <div class="small">样本：${statsA.count} 次</div>`
        : `<div class="stat">暂无数据</div>`
    }

    <div style="margin-top:12px;"><strong>方向 B</strong></div>
    ${
      statsB
        ? `
      <div class="stat">平均：${fmtSigned(statsB.avg)}</div>
      <div class="stat">最高：${fmtSigned(statsB.max)}</div>
      <div class="stat">最低：${fmtSigned(statsB.min)}</div>
      <div class="small">样本：${statsB.count} 次</div>`
        : `<div class="stat">暂无数据</div>`
    }

    <div class="small">窗口：最近 15 分钟 · 后台每 3 秒抓一次</div>
  </div>

</body>
</html>
`);
});

// Render 必须监听 0.0.0.0
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server RUNNING on", PORT);
});
