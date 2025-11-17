// server.js —— 后台持续运行 + 15分钟价差统计（无图表版）
import express from "express";
import fetch from "node-fetch";

const app = express();

// Render 必须使用 process.env.PORT
const PORT = process.env.PORT || 3000;

// === 15 分钟窗口（毫秒） ===
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

// 添加记录（保持 15 分钟）
function addSpreadSample(spreadA, spreadB) {
  const hasA = Number.isFinite(spreadA);
  const hasB = Number.isFinite(spreadB);
  if (!hasA && !hasB) return;

  const ts = Date.now();
  spreadHistory.push({ ts, spreadA, spreadB });

  const cutoff = ts - WINDOW_MS;
  while (spreadHistory.length && spreadHistory[0].ts < cutoff) {
    spreadHistory.shift();
  }
}

// 计算统计
function calcStats(key) {
  const arr = spreadHistory
    .map((x) => x[key])
    .filter((v) => Number.isFinite(v));

  if (arr.length === 0) return null;

  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    avg: sum / arr.length,
    max: Math.max(...arr),
    min: Math.min(...arr),
    count: arr.length,
  };
}

// ========= 主页面 =========

app.get("/", async (req, res) => {
  let lighter = null;
  let bid = null;
  let ask = null;

  // ---- Lighter ----
  try {
    const r = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const j = await r.json();
    const p = Number(j?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(p)) lighter = p;
  } catch (e) {
    console.log("Lighter error:", e.message);
  }

  // ---- Paradex ----
  try {
    const r = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const j = await r.json();
    const b = Number(j?.bid);
    const a = Number(j?.ask);
    if (Number.isFinite(b)) bid = b;
    if (Number.isFinite(a)) ask = a;
  } catch (e) {
    console.log("Paradex error:", e.message);
  }

  // ---- 即时价差 ----
  let spreadA = null; // L 多 - P 空
  let spreadB = null; // P 多 - L 空
  if (Number.isFinite(lighter) && Number.isFinite(bid)) {
    spreadA = lighter - bid;
  }
  if (Number.isFinite(lighter) && Number.isFinite(ask)) {
    spreadB = ask - lighter;
  }

  // ---- 写入滚动窗口 ----
  addSpreadSample(spreadA, spreadB);

  // ---- 统计 ----
  const statsA = calcStats("spreadA");
  const statsB = calcStats("spreadB");

  // ---- 输出页面 ----
  res.send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BTC 套利监控（后台持续）</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text";margin:0;padding:16px;background:#f5f5f7;}
.card{background:#fff;border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:0 2px 4px rgba(0,0,0,0.05);}
.label{font-size:14px;color:#555;}
.value{font-size:20px;font-weight:600;margin-top:4px;}
.stat-row{margin-top:6px;font-size:16px;}
.small{font-size:12px;color:#777;margin-top:6px;}
.title{font-size:24px;font-weight:700;margin-bottom:16px;}
</style>
</head>
<body>

<div class="title">BTC 套利监控（后台持续）</div>

<div class="card">
  <div class="label">Lighter BTC：</div>
  <div class="value">${fmt(lighter)}</div>
</div>

<div class="card">
  <div class="label">Paradex Bid：</div>
  <div class="value">${fmt(bid)}</div>

  <div class="label" style="margin-top:8px;">Paradex Ask：</div>
  <div class="value">${fmt(ask)}</div>
</div>

<div class="card">
  <div class="label" style="font-size:18px;font-weight:600;">即时价差</div>
  <div class="stat-row">方向 A（L 多 - P 空）： <strong>${fmtSigned(spreadA)}</strong></div>
  <div class="stat-row">方向 B（P 多 - L 空）： <strong>${fmtSigned(spreadB)}</strong></div>
</div>

<div class="card">
  <div class="label" style="font-size:18px;font-weight:600;">15 分钟统计（后台持续）</div>

  <div class="stat-row" style="margin-top:8px;"><strong>方向 A</strong></div>
  ${
    statsA
      ? `
        <div class="stat-row">平均：${fmtSigned(statsA.avg)}</div>
        <div class="stat-row">最高：${fmtSigned(statsA.max)}</div>
        <div class="stat-row">最低：${fmtSigned(statsA.min)}</div>
        <div class="small">样本：${statsA.count} 次</div>
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
        <div class="small">样本：${statsB.count} 次</div>
      `
      : `<div class="stat-row">暂无数据</div>`
  }

  <div class="small">窗口：最近 15 分钟 · 自动刷新每 3 秒</div>
</div>

<script>
setTimeout(()=>location.reload(),3000);
</script>

</body>
</html>
`);
});

// ---- 启动服务 ----
app.listen(PORT, () => {
  console.log("Server RUNNING on port", PORT);
});
