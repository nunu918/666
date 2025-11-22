// server.js —— 实时套利监控（方案 A 修复版）
// - 自动刷新不干扰手动刷新（延迟启动）
// - 图表高度固定，不再跳动
// - 后台采样逻辑保持不变

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// ===================== 配置 =====================
const WINDOW_MS = 15 * 60 * 1000;       // 15分钟统计窗口
const SAMPLE_INTERVAL_MS = 3000;        // 后台采样间隔
const MAX_POINTS = 20;                  // 曲线最多 20 个数据点

// ===================== 采样存储 =====================
const samples = [];

// ===================== 工具函数 =====================
function fmt(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return Number(v).toFixed(2);
}

function fmtSigned(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Number(v).toFixed(2);
  return (v > 0 ? "+" : "") + n;
}

async function fetchPrices() {
  let lighterPrice = null, paraBid = null, paraAsk = null;

  try {
    const r1 = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const j1 = await r1.json();
    const raw = Number(j1?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(raw)) lighterPrice = raw;
  } catch {}

  try {
    const r2 = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const j2 = await r2.json();
    const b = Number(j2?.bid);
    const a = Number(j2?.ask);
    if (Number.isFinite(b)) paraBid = b;
    if (Number.isFinite(a)) paraAsk = a;
  } catch {}

  return { lighterPrice, paraBid, paraAsk };
}

async function takeSample() {
  const p = await fetchPrices();
  const now = Date.now();

  if (!p.lighterPrice && !p.paraBid && !p.paraAsk) return;

  samples.push({ ts: now, ...p });

  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
}

function calcStats(type) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = [];

  for (const s of samples) {
    if (s.ts < cutoff) continue;

    let spread = null;
    if (type === "A" && s.lighter != null && s.paraBid != null)
      spread = s.lighter - s.paraBid;

    if (type === "B" && s.lighter != null && s.paraAsk != null)
      spread = s.paraAsk - s.lighter;

    if (spread != null && Number.isFinite(spread)) arr.push(spread);
  }

  if (!arr.length) return null;

  return {
    avg: arr.reduce((a, b) => a + b) / arr.length,
    max: Math.max(...arr),
    min: Math.min(...arr),
    count: arr.length
  };
}

function calcSpreadPct(s, type) {
  if (type === "A" && s.lighter != null && s.paraBid != null && s.paraBid !== 0)
    return ((s.lighter - s.paraBid) / s.paraBid) * 100;

  if (type === "B" && s.lighter != null && s.paraAsk != null && s.lighter !== 0)
    return ((s.paraAsk - s.lighter) / s.lighter) * 100;

  return null;
}

// ===================== 后台采样定时器 =====================
setInterval(() => takeSample(), SAMPLE_INTERVAL_MS);
takeSample();

// ===================== 页面路由 =====================
app.get("/", async (req, res) => {
  if (!samples.length) await takeSample();

  const last = samples[samples.length - 1] ?? {};
  const lighter = last.lighter ?? null;
  const paraBid = last.paraBid ?? null;
  const paraAsk = last.paraAsk ?? null;

  const spreadA = (lighter != null && paraBid != null) ? lighter - paraBid : null;
  const spreadB = (lighter != null && paraAsk != null) ? paraAsk - lighter : null;

  const statsA = calcStats("A");
  const statsB = calcStats("B");

  const chartSamples = samples.slice(-MAX_POINTS);

  const labels = chartSamples.map(s =>
    new Date(s.ts).toLocaleTimeString("zh-CN", {
      hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
    })
  );

  const pctA = chartSamples.map(s => calcSpreadPct(s, "A"));
  const pctB = chartSamples.map(s => calcSpreadPct(s, "B"));

  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>L × P 套利监控</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body {
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui;
  margin:0;padding:16px;background:#f5f5f7;
}
.title {font-size:24px;font-weight:700;margin-bottom:16px;}
.card {
  background:#fff;border-radius:12px;padding:12px 16px;margin-bottom:12px;
  box-shadow:0 2px 4px rgba(0,0,0,0.03);
}
.label {font-size:14px;color:#555;}
.value {font-size:18px;font-weight:600;margin-top:4px;}
.spread-title {font-size:16px;font-weight:600;}
.stat-row {margin-top:6px;font-size:14px;}
.small {font-size:12px;color:#888;margin-top:4px;}
/* 关键：彻底固定图表高度 */
.chart-box {
  height: 280px;
  overflow: hidden;
}
#spreadChart {
  height: 280px !important;
}
</style>
</head>
<body>

<div class="title">BTC 套利监控（L × P）</div>

<div class="card">
  <div class="label">Lighter BTC：</div>
  <div class="value">${fmt(lighter)}</div>
</div>

<div class="card">
  <div class="label">Paradex Bid：</div>
  <div class="value">${fmt(paraBid)}</div>
  <div class="label" style="margin-top:8px;">Paradex Ask：</div>
  <div class="value">${fmt(paraAsk)}</div>
</div>

<div class="card">
  <div class="spread-title">即时价差</div>
  <div class="stat-row">方向 A：${fmtSigned(spreadA)}</div>
  <div class="stat-row">方向 B：${fmtSigned(spreadB)}</div>
</div>

<!-- 价差百分比图表（固定高度） -->
<div class="card">
  <div class="spread-title">价差百分比（最近 20 次）</div>
  <div class="chart-box">
    <canvas id="spreadChart"></canvas>
  </div>
</div>

<div class="card">
  <div class="spread-title">15 分钟统计</div>

  <div class="stat-row"><strong>方向 A</strong></div>
  ${
    statsA ?
    `<div class="stat-row">平均：${fmtSigned(statsA.avg)}</div>
     <div class="stat-row">最高：${fmtSigned(statsA.max)}</div>
     <div class="stat-row">最低：${fmtSigned(statsA.min)}</div>
     <div class="small">样本：${statsA.count} 次</div>` :
    `<div class="stat-row">暂无数据</div>`
  }

  <div class="stat-row" style="margin-top:12px;"><strong>方向 B</strong></div>
  ${
    statsB ?
    `<div class="stat-row">平均：${fmtSigned(statsB.avg)}</div>
     <div class="stat-row">最高：${fmtSigned(statsB.max)}</div>
     <div class="stat-row">最低：${fmtSigned(statsB.min)}</div>
     <div class="small">样本：${statsB.count} 次</div>` :
    `<div class="stat-row">暂无数据</div>`
  }

  <div class="small" style="margin-top:10px;">
    后台采样：3 秒一次 · 页面：延迟 3 秒后自动刷新
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
const labels = ${JSON.stringify(labels)};
const pctA = ${JSON.stringify(pctA)};
const pctB = ${JSON.stringify(pctB)};

function fix(arr) { return arr.map(v => (v==null||!isFinite(v)?undefined:v)); }

const ctx = document.getElementById("spreadChart").getContext("2d");

new Chart(ctx, {
  type:"line",
  data:{
    labels,
    datasets:[
      {label:"方向 A", data:fix(pctA), borderColor:"blue", tension:0.2},
      {label:"方向 B", data:fix(pctB), borderColor:"orange", tension:0.2}
    ]
  },
  options:{
    animation:false,
    responsive:true,
    maintainAspectRatio:false,
  }
});

// 🔥 自动刷新延迟 3 秒启动（手动刷新不会被打断）
setTimeout(() => {
  setInterval(() => location.reload(), 3000);
}, 3000);
</script>

</body>
</html>
`);
});

// =====================
app.listen(PORT,"0.0.0.0",()=>console.log("RUNNING",PORT));
