// server.js —— 移除曲线，新增 15 分钟价差统计（方向 A / B）

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 15 分钟窗口（毫秒）
const WINDOW_MS = 15 * 60 * 1000;

// 保存价差历史：{ ts, spreadA, spreadB }
const spreadHistory = [];

// ========= 工具函数 =========

// 数字格式化（价格、价差）
function fmt(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  return Number(val).toFixed(2);
}

// 带符号的格式化（+12.34 / -5.67）
function fmtSigned(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  const v = Number(val).toFixed(2);
  return (val > 0 ? "+" : "") + v;
}

// 添加一条价差记录，并维护 15 分钟窗口
function addSpreadSample(spreadA, spreadB) {
  if (
    (spreadA == null || !Number.isFinite(spreadA)) &&
    (spreadB == null || !Number.isFinite(spreadB))
  ) {
    return;
  }

  const now = Date.now();
  spreadHistory.push({ ts: now, spreadA, spreadB });

  // 只保留最近 15 分钟
  const cutoff = now - WINDOW_MS;
  while (spreadHistory.length && spreadHistory[0].ts < cutoff) {
    spreadHistory.shift();
  }
}

// 计算 15 分钟统计（平均、最大、最小）
function calcStats(key) {
  const values = spreadHistory
    .map((item) => item[key])
    .filter((v) => Number.isFinite(v));

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);

  return { avg, max, min, count: values.length };
}

// ========= 路由 =========

app.get("/", async (req, res) => {
  let lighterPrice = null;
  let paraBid = null;
  let paraAsk = null;

  // 1. Lighter 价格
  try {
    const lightRes = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const lightJson = await lightRes.json();
    const rawL = Number(lightJson?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(rawL)) lighterPrice = rawL;
  } catch (err) {
    console.log("Lighter API Error:", err.message);
  }

  // 2. Paradex BBO
  try {
    const paraRes = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const paraJson = await paraRes.json();
    const rawBid = Number(paraJson?.bid);
    const rawAsk = Number(paraJson?.ask);
    if (Number.isFinite(rawBid)) paraBid = rawBid;
    if (Number.isFinite(rawAsk)) paraAsk = rawAsk;
  } catch (err) {
    console.log("Paradex API Error:", err.message);
  }

  // 3. 即时价差
  let spreadA = lighterPrice != null && paraBid != null ? lighterPrice - paraBid : null;
  let spreadB = lighterPrice != null && paraAsk != null ? paraAsk - lighterPrice : null;

  // 4. 推入 15 分钟窗口
  addSpreadSample(spreadA, spreadB);

  // 5. 统计结果
  const statsA = calcStats("spreadA");
  const statsB = calcStats("spreadB");

  // 6. 页面输出
  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BTC 套利监控（Lighter × Paradex）</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, system-ui; padding: 16px; background:#f5f5f7; }
    .title { font-size:24px; font-weight:700; margin-bottom:16px; }
    .card { background:#fff; border-radius:12px; padding:12px 16px; margin-bottom:12px; }
    .label { font-size:14px; color:#555; }
    .value { font-size:18px; font-weight:600; margin-top:4px; }
    .spread-title { font-size:16px; font-weight:600; }
    .stat-row { margin-top:6px; font-size:14px; }
    .small { font-size:12px; color:#888; margin-top:4px; }
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
  <div class="spread-title">即时价差（最新）</div>
  <div class="stat-row">方向 A： <strong>${fmtSigned(spreadA)}</strong></div>
  <div class="stat-row">方向 B： <strong>${fmtSigned(spreadB)}</strong></div>
</div>

<div class="card">
  <div class="spread-title">15 分钟统计</div>

  <div class="stat-row" style="margin-top:8px;"><strong>方向 A</strong></div>
  ${
    statsA
      ? `
      <div class="stat-row">平均：${fmtSigned(statsA.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(statsA.max)}</div>
      <div class="stat-row">最低：${fmtSigned(statsA.min)}</div>
      <div class="small">样本数：${statsA.count} 次</div>
      `
      : `<div class="stat-row">暂无数据</div>`
  }

  <div class="stat-row" style="margin-top:12px;"><strong>方向 B</strong></div>
  ${
    statsB
      ? `
      <div class="stat-row">平均：${fmtSigned(statsB.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(statsB.max)}</div>
      <div class="stat-row">最低：${fmtSigned(statsB.min)}</div>
      <div class="small">样本数：${statsB.count} 次</div>
      `
      : `<div class="stat-row">暂无数据</div>`
  }

  <div class="small" style="margin-top:10px;">窗口长度：最近 15 分钟 · 自动刷新每 3 秒</div>
</div>

<script>
  setTimeout(() => location.reload(), 3000);
</script>

</body>
</html>
  `);
});

// =======================
// Render 必须监听端口
// =======================
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server RUNNING on port", PORT);
});
