// server.js —— 实时 BTC 套利监控（Lighter × Paradex）
// 需求：
// - Lighter 用 last_trade_price
// - 后台每 3 秒采样
// - 每次打开 / 刷新页面，先采一次再渲染（手动刷新一定更新）
// - 页面每 3 秒自动刷新
// - 保留 15 分钟统计 & 百分比曲线

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 配置 =====
const WINDOW_MS = 15 * 60 * 1000;     // 15 分钟窗口
const SAMPLE_INTERVAL_MS = 3000;      // 后台采样间隔
const MAX_POINTS = 20;                // 图表最多点数

// 历史样本：{ ts, lighter, paraBid, paraAsk }
const samples = [];

// ===== 工具函数 =====
function fmt(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  return Number(val).toFixed(2);
}

function fmtSigned(val) {
  if (val == null || !Number.isFinite(val)) return "—";
  const v = Number(val).toFixed(2);
  return (val > 0 ? "+" : "") + v;
}

// 拉取 L / P 当前价格
async function fetchPrices() {
  let lighterPrice = null;
  let paraBid = null;
  let paraAsk = null;

  // Lighter
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

  // Paradex
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

// 后台采样一次
async function takeSample() {
  const { lighterPrice, paraBid, paraAsk } = await fetchPrices();
  const now = Date.now();

  if (lighterPrice == null && paraBid == null && paraAsk == null) return;

  samples.push({
    ts: now,
    lighter: lighterPrice,
    paraBid,
    paraAsk,
  });

  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) {
    samples.shift();
  }
}

// 15 分钟统计
function calcStats(directionKey) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const values = [];

  for (const s of samples) {
    if (s.ts < cutoff) continue;
    const { lighter, paraBid, paraAsk } = s;

    let spread = null;
    if (directionKey === "A" && lighter != null && paraBid != null) {
      // L 多 - P 空
      spread = lighter - paraBid;
    }
    if (directionKey === "B" && lighter != null && paraAsk != null) {
      // P 多 - L 空
      spread = paraAsk - lighter;
    }

    if (spread != null && Number.isFinite(spread)) {
      values.push(spread);
    }
  }

  if (!values.length) return null;

  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);

  return { avg, max, min, count: values.length };
}

// 百分比
function calcSpreadPct(sample, directionKey) {
  const { lighter, paraBid, paraAsk } = sample;

  if (directionKey === "A") {
    if (lighter != null && paraBid != null && paraBid !== 0) {
      return ((lighter - paraBid) / paraBid) * 100;
    }
  } else if (directionKey === "B") {
    if (lighter != null && paraAsk != null && lighter !== 0) {
      return ((paraAsk - lighter) / lighter) * 100;
    }
  }
  return null;
}

// ===== 后台定时采样 =====
setInterval(() => {
  takeSample().catch((err) =>
    console.log("takeSample error:", err?.message || err)
  );
}, SAMPLE_INTERVAL_MS);

// 启动时先采一次
takeSample().catch(() => {});

// ===== 页面路由 =====
app.get("/", async (req, res) => {
  // ✅ 每次打开 / 刷新页面，都强制采一次（保证手动刷新一定更新）
  await takeSample().catch(() => {});

  const last = samples[samples.length - 1] ?? {};
  const lighterPrice = last.lighter ?? null;
  const paraBid = last.paraBid ?? null;
  const paraAsk = last.paraAsk ?? null;

  let spreadA = null;
  let spreadB = null;

  if (lighterPrice != null && paraBid != null) {
    spreadA = lighterPrice - paraBid;
  }
  if (lighterPrice != null && paraAsk != null) {
    spreadB = paraAsk - lighterPrice;
  }

  const statsA = calcStats("A");
  const statsB = calcStats("B");

  const chartSamples = samples.slice(-MAX_POINTS);
  const labels = chartSamples.map((s) =>
    new Date(s.ts).toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );

  const spreadAPcts = chartSamples.map((s) => calcSpreadPct(s, "A"));
  const spreadBPcts = chartSamples.map((s) => calcSpreadPct(s, "B"));

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
      statsA
        ? `<div class="stat-row">平均：${fmtSigned(statsA.avg)}</div>
           <div class="stat-row">最高：${fmtSigned(statsA.max)}</div>
           <div class="stat-row">最低：${fmtSigned(statsA.min)}</div>
           <div class="small">样本：${statsA.count} 次</div>`
        : `<div class="stat-row">暂无足够数据</div>`
    }

    <div class="stat-row" style="margin-top:12px;"><strong>方向 B</strong></div>
    ${
      statsB
        ? `<div class="stat-row">平均：${fmtSigned(statsB.avg)}</div>
           <div class="stat-row">最高：${fmtSigned(statsB.max)}</div>
           <div class="stat-row">最低：${fmtSigned(statsB.min)}</div>
           <div class="small">样本：${statsB.count} 次</div>`
        : `<div class="stat-row">暂无足够数据</div>`
    }

    <div class="small" style="margin-top:10px;">
      后台采样 3 秒一次 · 页面自动刷新 3 秒 · 手动刷新也会强制更新
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

    // 自动刷新：保持 3 秒一次
    setTimeout(() => {
      location.reload();
    }, 3000);
  </script>
</body>
</html>
  `);
});

// 监听
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server RUNNING on port", PORT);
});
