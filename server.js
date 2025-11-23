// server.js —— 方案 A：前端不 reload，后台 API 刷新数据

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 15 分钟窗口
const WINDOW_MS = 15 * 60 * 1000;
// 后端采样频率：3 秒
const SAMPLE_INTERVAL_MS = 3000;
// 最大图表样本数（虽然你取消图表，但保留结构）
const MAX_POINTS = 20;

// 存储样本
const samples = [];

/* --------------------------
 工具函数
--------------------------- */
function fmt(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  return Number(v).toFixed(2);
}
function fmtSigned(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Number(v).toFixed(2);
  return (v > 0 ? "+" : "") + n;
}

/* --------------------------
 拉取价格（Lighter + Paradex）
--------------------------- */
async function fetchPrices() {
  let lighter = null;
  let bid = null;
  let ask = null;

  try {
    const r = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const j = await r.json();
    const raw = Number(j?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(raw)) lighter = raw;
  } catch {}

  try {
    const r = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const j = await r.json();
    const rawBid = Number(j?.bid);
    const rawAsk = Number(j?.ask);
    if (Number.isFinite(rawBid)) bid = rawBid;
    if (Number.isFinite(rawAsk)) ask = rawAsk;
  } catch {}

  return { lighter, bid, ask };
}

/* --------------------------
 后端采样
--------------------------- */
async function takeSample() {
  const { lighter, bid, ask } = await fetchPrices();
  const now = Date.now();

  if (lighter == null && bid == null && ask == null) return;

  samples.push({ ts: now, lighter, bid, ask });

  // 删除过期数据（15 分钟窗口）
  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
}
setInterval(takeSample, SAMPLE_INTERVAL_MS);
takeSample();

/* --------------------------
 计算统计
--------------------------- */
function computeStats(samples) {
  let A = [];
  let B = [];

  for (const s of samples) {
    if (s.lighter != null && s.bid != null)
      A.push(s.lighter - s.bid);

    if (s.lighter != null && s.ask != null)
      B.push(s.ask - s.lighter);
  }

  function stat(arr) {
    if (!arr.length) return null;
    return {
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      max: Math.max(...arr),
      min: Math.min(...arr),
      count: arr.length
    };
  }

  return { statsA: stat(A), statsB: stat(B) };
}

/* --------------------------
  API：前端每 3 秒请求一次
--------------------------- */
app.get("/api/data", (req, res) => {
  const last = samples[samples.length - 1] ?? {};

  const lighter = last.lighter ?? null;
  const bid = last.bid ?? null;
  const ask = last.ask ?? null;

  const spreadA =
    lighter != null && bid != null ? lighter - bid : null;

  const spreadB =
    lighter != null && ask != null ? ask - lighter : null;

  const { statsA, statsB } = computeStats(samples);

  res.json({
    lighter,
    bid,
    ask,
    spreadA,
    spreadB,
    statsA,
    statsB
  });
});

/* --------------------------
 页面（前端 AJAX 自动更新）
--------------------------- */
app.get("/", (req, res) => {
  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>BTC 套利监控（Lighter × Paradex）</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body { 
  font-family:-apple-system, BlinkMacSystemFont; 
  margin:0; padding:16px; background:#f5f5f7;
}
.card {
  background:#fff; padding:16px; border-radius:12px;
  margin-bottom:12px; box-shadow:0 2px 4px rgba(0,0,0,0.05);
}
.label { font-size:14px; color:#555; }
.value { font-size:20px; font-weight:600; margin-top:4px; }
.spread-title { font-size:16px; font-weight:600; margin-bottom:6px; }
.stat-row { margin-top:6px; font-size:14px; }
.small { font-size:12px; color:#888; margin-top:6px; }
</style>
</head>
<body>

<h2>BTC 套利监控（Lighter × Paradex）</h2>

<div class="card">
  <div class="label">Lighter BTC：</div>
  <div class="value" id="lighter">—</div>
</div>

<div class="card">
  <div class="label">Paradex Bid：</div>
  <div class="value" id="bid">—</div>
  <div class="label" style="margin-top:8px;">Paradex Ask：</div>
  <div class="value" id="ask">—</div>
</div>

<div class="card">
  <div class="spread-title">即时价差</div>
  <div class="stat-row">方向 A：<strong id="spreadA">—</strong></div>
  <div class="stat-row">方向 B：<strong id="spreadB">—</strong></div>
</div>

<div class="card">
  <div class="spread-title">15 分钟统计</div>

  <div class="stat-row"><strong>方向 A</strong></div>
  <div class="stat-row" id="statsA">暂无数据</div>

  <div class="stat-row" style="margin-top:12px;"><strong>方向 B</strong></div>
  <div class="stat-row" id="statsB">暂无数据</div>

  <div class="small">后台采样：3 秒 / 页面无刷新自动更新</div>
</div>

<script>
function fmt(v){ return (v==null||isNaN(v)) ? "—" : Number(v).toFixed(2); }
function fmtS(v){ return (v==null||isNaN(v)) ? "—" : ((v>0?"+":"")+Number(v).toFixed(2)); }

async function update(){
  const res = await fetch("/api/data");
  const j = await res.json();

  document.getElementById("lighter").innerText = fmt(j.lighter);
  document.getElementById("bid").innerText = fmt(j.bid);
  document.getElementById("ask").innerText = fmt(j.ask);

  document.getElementById("spreadA").innerText = fmtS(j.spreadA);
  document.getElementById("spreadB").innerText = fmtS(j.spreadB);

  if (j.statsA)
    document.getElementById("statsA").innerText =
      "平均：" + fmtS(j.statsA.avg) +
      "　最高：" + fmtS(j.statsA.max) +
      "　最低：" + fmtS(j.statsA.min) +
      "　样本：" + j.statsA.count;

  if (j.statsB)
    document.getElementById("statsB").innerText =
      "平均：" + fmtS(j.statsB.avg) +
      "　最高：" + fmtS(j.statsB.max) +
      "　最低：" + fmtS(j.statsB.min) +
      "　样本：" + j.statsB.count;
}

// 自动更新（不刷新页面）
setInterval(update, 3000);
update();
</script>

</body>
</html>
`);
});

/* --------------------------
 Render 启动
--------------------------- */
app.listen(PORT, "0.0.0.0", () =>
  console.log("Server running on", PORT)
);
