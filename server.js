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
  // 两个都为空就不记录
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

  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);

  return {
    avg,
    max,
    min,
    count: values.length
  };
}

// ========= 路由 =========

app.get("/", async (req, res) => {
  let lighterPrice = null;
  let paraBid = null;
  let paraAsk = null;

  // 1. Lighter —— 用你给的 last_trade_price（market_id=1）
  try {
    const lightRes = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const lightJson = await lightRes.json();

    const rawL = Number(lightJson?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(rawL)) {
      lighterPrice = rawL;
    }
  } catch (err) {
    console.log("Lighter API Error:", err.message || err);
  }

  // 2. Paradex —— 你测试过成功的 bbo 接口
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
    console.log("Paradex API Error:", err.message || err);
  }

  // 3. 即时价差（方向 A / B）
  let spreadA = null; // L 多 - P 空 = Lighter - P.bid
  let spreadB = null; // P 多 - L 空 = P.ask - Lighter

  if (lighterPrice != null && paraBid != null) {
    spreadA = lighterPrice - paraBid;
  }
  if (lighterPrice != null && paraAsk != null) {
    spreadB = paraAsk - lighterPrice;
  }

  // 4. 记录到 15 分钟窗口
  addSpreadSample(spreadA, spreadB);

  // 5. 计算 15 分钟统计
  const statsA = calcStats("spreadA");
  const statsB = calcStats("spreadB");

  // 6. 输出页面（不再有曲线，只保留监控 & 统计）
  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>BTC 套利监控（Lighter × Paradex）</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui;
      margin: 0;
      padding: 16px;
      background: #f5f5f7;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 12px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.03);
    }
    .label {
      font-size: 14px;
      color: #555;
    }
    .value {
      font-size: 18px;
      font-weight: 600;
      margin-top: 4px;
    }
    .spread-title {
      font-size: 16px;
      font-weight: 600;
    }
    .stat-row {
      margin-top: 6px;
      font-size: 14px;
    }
    .small {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="title">BTC 套利监控（Lighter × Paradex）</div>

  <!-- 当前价格 -->
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

  <!-- 即时价差 -->
  <div class="card">
    <div class="spread-title">即时价差（最新一次）</div>
    <div class="stat-row">方向 A（L 多 - P 空）： <strong>${fmtSigned(spreadA)}</strong></div>
    <div class="stat-row">方向 B（P 多 - L 空）： <strong>${fmtSigned(spreadB)}</strong></div>
  </div>

  <!-- 15 分钟统计 -->
  <div class="card">
    <div class="spread-title">15 分钟价差统计（滚动窗口）</div>

    <div class="stat-row" style="margin-top:8px;">
      <strong>方向 A（L 多 - P 空）</strong>
    </div>
    ${
      statsA
        ? `
      <div class="stat-row">平均：${fmtSigned(statsA.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(statsA.max)}</div>
      <div class="stat-row">最低：${fmtSigned(statsA.min)}</div>
      <div class="small">样本数量：${statsA.count} 次</div>
      `
        : `<div class="stat-row">暂无足够数据（少于一两次刷新）</div>`
    }

    <div class="stat-row" style="margin-top:12px;">
      <strong>方向 B（P 多 - L 空）</strong>
    </div>
    ${
      statsB
        ? `
      <div class="stat-row">平均：${fmtSigned(statsB.avg)}</div>
      <div class="stat-row">最高：${fmtSigned(statsB.max)}</div>
      <div class="stat-row">最低：${fmtSigned(statsB.min)}</div>
      <div class="small">样本数量：${statsB.count} 次</div>
      `
        : `<div class="stat-row">暂无足够数据（少于一两次刷新）</div>`
    }

    <div class="small" style="margin-top:10px;">
      窗口长度：最近 15 分钟 · 刷新频率：约 3
// -----------------------------
// Render 必须监听外部端口，否则服务会直接退出
// -----------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server RUNNING on port", PORT);
});
