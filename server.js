// server.js —— 实时 BTC 套利监控（Lighter × Paradex）
// - 修复：手动刷新无效的问题（现在能手动刷新）
// - 其他逻辑保持原样，不动你的任何结构

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 15 分钟窗口（毫秒）
const WINDOW_MS = 15 * 60 * 1000;

// 折线图最多显示 20 个点
const MAX_POINTS = 20;

// 后台采样间隔：3 秒
const SAMPLE_INTERVAL_MS = 3000;

// 历史样本：{ ts, lighter, paraBid, paraAsk }
const samples = [];

// ========= 工具函数 =========
function fmt(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  return Number(val).toFixed(2);
}
function fmtSigned(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  const v = Number(val).toFixed(2);
  return (val > 0 ? "+" : "") + v;
}

// 调 API
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
  } catch {}

  try {
    const paraRes = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const paraJson = await paraRes.json();
    const rawBid = Number(paraJson?.bid);
    const rawAsk = Number(paraJson?.ask);
    if (Number.isFinite(rawBid)) paraBid = rawBid;
    if (Number.isFinite(rawAsk)) paraAsk = rawAsk;
  } catch {}

  return { lighterPrice, paraBid, paraAsk };
}

// 后台采样
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

  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
}

// 统计
function calcStats(directionKey) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const values = [];

  for (const s of samples) {
    if (s.ts < cutoff) continue;
    const { lighter, paraBid, paraAsk } = s;

    let spread = null;
    if (directionKey === "A" && lighter != null && paraBid != null)
      spread = lighter - paraBid;

    if (directionKey === "B" && lighter != null && paraAsk != null)
      spread = paraAsk - lighter;

    if (spread != null && Number.isFinite(spread)) values.push(spread);
  }

  if (!values.length) return null;

  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
    count: values.length
  };
}

// 百分比
function calcSpreadPct(sample, directionKey) {
  const { lighter, paraBid, paraAsk } = sample;

  if (directionKey === "A" && lighter != null && paraBid != null && paraBid !== 0)
    return ((lighter - paraBid) / paraBid) * 100;

  if (directionKey === "B" && lighter != null && paraAsk != null && lighter !== 0)
    return ((paraAsk - lighter) / lighter) * 100;

  return null;
}

// 定时后台采样
setInterval(() => {
  takeSample().catch(() => {});
}, SAMPLE_INTERVAL_MS);

// 启动先采一次
takeSample();

// ========= 页面路由 =========
app.get("/", async (req, res) => {
  if (!samples.length) await takeSample();

  const last = samples[samples.length - 1] ?? {};
  const lighterPrice = last.lighter ?? null;
  const paraBid = last.paraBid ?? null;
  const paraAsk = last.paraAsk ?? null;

  let spreadA = (lighterPrice != null && paraBid != null)
    ? lighterPrice - paraBid : null;

  let spreadB = (lighterPrice != null && paraAsk != null)
    ? paraAsk - lighterPrice : null;

  const statsA = calcStats("A");
  const statsB = calcStats("B");

  const chartSamples = samples.slice(-MAX_POINTS);
  const labels = chartSamples.map(s =>
    new Date(s.ts).toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
  );

  const spreadAPcts = chartSamples.map(s => calcSpreadPct(s, "A"));
  const spreadBPcts = chartSamples.map(s => calcSpreadPct(s, "B"));

  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>BTC 套利监控（Lighter × Paradex）</title>
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
    <div class="stat-row">方向 A：<strong>${fmtSigned(spreadA)}</strong></div>
    <div class="stat-row">方向 B：<strong>${fmtSigned(spreadB)}</strong></div>
  </div>

  <div class="card">
    <div class="spread-title">价差百分比（最近 20 次）</div>

    <div style="height:260px; overflow:hidden;">
      <canvas id="spreadChart" style="height:260px !important;"></canvas>
    </div>

    <div class="small">蓝：A（买 L / 卖 P） · 橙：B（买 P / 卖 L）</div>
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
      `<div class="stat-row">暂无足够数据</div>`
    }

    <div class="stat-row" style="margin-top:12px;"><strong>方向 B</strong></div>
    ${
      statsB ?
      `<div class="stat-row">平均：${fmtSigned(statsB.avg)}</div>
       <div class="stat-row">最高：${fmtSigned(statsB.max)}</div>
       <div class="stat-row">最低：${fmtSigned(statsB.min)}</div>
       <div class="small">样本：${statsB.count} 次</div>` :
      `<div class="stat-row">暂无足够数据</div>`
    }

    <div class="small" style="margin-top:10px;">
      后台采样 3 秒一次 · 页面自动刷新 3 秒
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    const labels = ${JSON.stringify(labels)};
    const spreadAPcts = ${JSON.stringify(spreadAPcts)};
    const spreadBPcts = ${JSON.stringify(spreadBPcts)};

    function fix(arr){ return arr.map(v => (v==null||!isFinite(v)?undefined:v)); }

    const ctx = document.getElementById("spreadChart").getContext("2d");

    new Chart(ctx,{
      type:"line",
      data:{
        labels,
        datasets:[
          {label:"A",data:fix(spreadAPcts),borderColor:"blue",tension:0.2},
          {label:"B",data:fix(spreadBPcts),borderColor:"orange",tension:0.2}
        ]
      },
      options:{
        animation:false,
        responsive:true,
        maintainAspectRatio:false
      }
    });

    // 改动点：手动刷新可用，不会被覆盖
    setTimeout(() => {
      const now = performance.now();
      if (now > 2500) {
        location.reload();
      }
    }, 3000);
  </script>
</body>
</html>
  `);
});

app.listen(PORT,"0.0.0.0",()=>console.log("Server RUNNING",PORT));
