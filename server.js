// server.js —— 实时 BTC 套利监控（Lighter × Paradex）
// - Lighter 只用 last_trade_price 一个价格
// - 后台每 3 秒自动拉一次数据（就算你不打开网页也在跑）
// - 15 分钟滚动统计（方向 A / B）
// - 新增：价差百分比折线图（最近 20 次，方向 A / B）

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_POINTS = 20;
const SAMPLE_INTERVAL_MS = 3000;

const samples = [];

function fmt(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  return Number(val).toFixed(2);
}
function fmtSigned(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  const v = Number(val).toFixed(2);
  return (val > 0 ? "+" : "") + v;
}

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
  } catch (err) {
    console.log("Lighter API Error:", err.message || err);
  }

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

  return { lighterPrice, paraBid, paraAsk };
}

async function takeSample() {
  const { lighterPrice, paraBid, paraAsk } = await fetchPrices();
  const now = Date.now();

  if (lighterPrice == null && paraBid == null && paraAsk == null) return;

  samples.push({ ts: now, lighter: lighterPrice, paraBid, paraAsk });

  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
}

function calcStats(key) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const values = [];

  for (const s of samples) {
    if (s.ts < cutoff) continue;
    const { lighter, paraBid, paraAsk } = s;

    let spread = null;
    if (key === "A" && lighter != null && paraBid != null)
      spread = lighter - paraBid;
    if (key === "B" && lighter != null && paraAsk != null)
      spread = paraAsk - lighter;

    if (spread != null && Number.isFinite(spread)) values.push(spread);
  }

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  return {
    avg: sum / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
    count: values.length
  };
}

function calcSpreadPct(s, key) {
  const { lighter, paraBid, paraAsk } = s;

  if (key === "A" && lighter != null && paraBid != null && paraBid !== 0)
    return ((lighter - paraBid) / paraBid) * 100;

  if (key === "B" && lighter != null && paraAsk != null && lighter !== 0)
    return ((paraAsk - lighter) / lighter) * 100;

  return null;
}

setInterval(() => {
  takeSample().catch((err) => console.log("takeSample Error:", err.message));
}, SAMPLE_INTERVAL_MS);

takeSample().catch(() => {});

app.get("/", async (req, res) => {
  if (samples.length === 0) await takeSample().catch(() => {});

  const last = samples[samples.length - 1] || {};
  const lighterPrice = last.lighter ?? null;
  const paraBid = last.paraBid ?? null;
  const paraAsk = last.paraAsk ?? null;

  let spreadA = null;
  let spreadB = null;
  if (lighterPrice != null && paraBid != null)
    spreadA = lighterPrice - paraBid;
  if (lighterPrice != null && paraAsk != null)
    spreadB = paraAsk - lighterPrice;

  const statsA = calcStats("A");
  const statsB = calcStats("B");

  const chartSamples = samples.slice(-MAX_POINTS);
  const labels = chartSamples.map((s) =>
    new Date(s.ts).toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  );

  const spreadAPcts = chartSamples.map((s) => calcSpreadPct(s, "A"));
  const spreadBPcts = chartSamples.map((s) => calcSpreadPct(s, "B"));

  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>BTC 套利监控（Lighter × Paradex）</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui;
    margin:0; padding:16px; background:#f5f5f7;
  }
  .title { font-size:24px; font-weight:700; margin-bottom:16px; }
  .card {
    background:#fff; border-radius:12px; padding:12px 16px; margin-bottom:12px;
    box-shadow:0 2px 4px rgba(0,0,0,0.03);
  }
  .label { font-size:14px; color:#555; }
  .value { font-size:18px; font-weight:600; margin-top:4px; }
  .spread-title { font-size:16px; font-weight:600; }
  .stat-row { margin-top:6px; font-size:14px; }
  .small { font-size:12px; color:#888; margin-top:4px; }
  #spreadChart { width:100%; max-width:640px; height:260px; margin-top:8px; }
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
  <div class="stat-row">方向 A（L 多 - P 空）： <strong>${fmtSigned(spreadA)}</strong></div>
  <div class="stat-row">方向 B（P 多 - L 空）： <strong>${fmtSigned(spreadB)}</strong></div>
</div>

<div class="card">
  <div class="spread-title">价差百分比（最近 20 次，单位 %）</div>
  <canvas id="spreadChart"></canvas>
  <div class="small">蓝线：方向 A（买 L / 卖 P） · 橙线：方向 B（买 P / 卖 L）</div>
</div>

<div class="card">
  <div class="spread-title">15 分钟统计（后台持续）</div>

  <div class="stat-row" style="margin-top:8px;"><strong>方向 A</strong></div>
  ${
    statsA
      ? `
    <div class="stat-row">平均：${fmtSigned(statsA.avg)}</div>
    <div class="stat-row">最高：${fmtSigned(statsA.max)}</div>
    <div class="stat-row">最低：${fmtSigned(statsA.min)}</div>
    <div class="small">样本数：${statsA.count} 次</div>
    `
      : `<div class="stat-row">暂无足够数据</div>`
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
      : `<div class="stat-row">暂无足够数据</div>`
  }

  <div class="small" style="margin-top:10px;">
    窗口长度：最近 15 分钟 · 后台采样：每 3 秒一次 · 页面：每 3 秒自动刷新
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  const labels = ${JSON.stringify(labels)};
  const spreadAPcts = ${JSON.stringify(spreadAPcts)};
  const spreadBPcts = ${JSON.stringify(spreadBPcts)};

  function fix(arr){
    return arr.map(v => (v == null || !isFinite(v)) ? undefined : v);
  }

  const dataA = fix(spreadAPcts);
  const dataB = fix(spreadBPcts);

  const ctx = document.getElementById('spreadChart').getContext('2d');

  new Chart(ctx, {
    type:"line",
    data:{
      labels,
      datasets:[
        {
          label:"方向 A（买 L / 卖 P）",
          data:dataA,
          borderColor:"blue",
          backgroundColor:"blue",
          tension:0.2,
          borderWidth:2,
          pointRadius:1.5,
          spanGaps:false
        },
        {
          label:"方向 B（买 P / 卖 L）",
          data:dataB,
          borderColor:"orange",
          backgroundColor:"orange",
          tension:0.2,
          borderWidth:2,
          pointRadius:1.5,
          spanGaps:false
        }
      ]
    },
    options:{
      animation:false,
      responsive:true,
      maintainAspectRatio:false,
      scales:{
        y:{
          ticks:{
            callback:(v)=>{
              if(typeof v==="number") return v.toFixed(3)+"%";
              return v+"%";
            }
          }
        }
      }
    }
  });

  // ⭐⭐⭐ 修复刷新后页面往下掉（强制固定在顶部）
  window.scrollTo(0,0);

  setTimeout(()=>{ location.reload(); },3000);
</script>

</body></html>
  `);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server RUNNING on port", PORT);
});
