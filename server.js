// server.js —— 修复曲线下移 + 固定高度 + 不动你业务逻辑

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 价格历史（最近 20 条）
const priceHistory = {
  lighter: [],
  paraBid: [],
  paraAsk: [],
  time: []
};

// 格式化输出
function fmt(v) {
  if (v == null) return "—";
  return Number(v).toFixed(2);
}

// 推入历史
function pushHistory(l, b, a) {
  const light = Number.isFinite(l) && l > 1000 ? l : null;
  const bid = Number.isFinite(b) && b > 1000 ? b : null;
  const ask = Number.isFinite(a) && a > 1000 ? a : null;

  if (!light && !bid && !ask) return;

  const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });

  priceHistory.lighter.push(light);
  priceHistory.paraBid.push(bid);
  priceHistory.paraAsk.push(ask);
  priceHistory.time.push(t);

  if (priceHistory.lighter.length > 20) {
    ["lighter", "paraBid", "paraAsk", "time"].forEach(k =>
      priceHistory[k].shift()
    );
  }
}

app.get("/", async (req, res) => {
  let lighterPrice = null;
  let paraBid = null;
  let paraAsk = null;

  // Lighter
  try {
    const r = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const j = await r.json();
    const v = Number(j?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(v)) lighterPrice = v;
  } catch (e) {
    console.log("lighter error", e.message);
  }

  // Paradex
  try {
    const r = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const j = await r.json();
    const b = Number(j?.bid);
    const a = Number(j?.ask);
    if (Number.isFinite(b)) paraBid = b;
    if (Number.isFinite(a)) paraAsk = a;
  } catch (e) {
    console.log("paradex error", e.message);
  }

  // 价差
  let spreadA = null;
  let spreadB = null;

  if (lighterPrice != null && paraBid != null)
    spreadA = lighterPrice - paraBid;

  if (lighterPrice != null && paraAsk != null)
    spreadB = paraAsk - lighterPrice;

  // 推入历史
  pushHistory(lighterPrice, paraBid, paraAsk);

  // HTML 页面
  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BTC 套利监控</title>

<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, system-ui;
  margin: 0;
  padding: 16px;
  background: #f5f5f7;
}
.card {
  background: #fff;
  margin-bottom: 12px;
  padding: 12px 16px;
  border-radius: 12px;
}
canvas {
  width: 100% !important;
  height: 260px !important;   /* 固定高度 */
}
</style>

</head>
<body>

<h2>BTC 套利监控（Lighter × Paradex）</h2>

<div class="card">
  <div>Lighter BTC：<b>${fmt(lighterPrice)}</b></div>
</div>

<div class="card">
  <div>Paradex Bid：<b>${fmt(paraBid)}</b></div>
  <div>Paradex Ask：<b>${fmt(paraAsk)}</b></div>
</div>

<div class="card">
  <div>方向 A（L 多 - P 空）：<b>${fmt(spreadA)}</b></div>
  <div>方向 B（P 多 - L 空）：<b>${fmt(spreadB)}</b></div>
</div>

<div class="card">
  <div style="margin-bottom:6px;">价格曲线（最近 20 次）</div>
  <canvas id="priceChart"></canvas>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
const labels = ${JSON.stringify(priceHistory.time)};
const rawL = ${JSON.stringify(priceHistory.lighter)};
const rawB = ${JSON.stringify(priceHistory.paraBid)};
const rawA = ${JSON.stringify(priceHistory.paraAsk)};

function fix(v){ return (v==null||!isFinite(v))?undefined:v; }

const lighterData = rawL.map(fix);
const paraBidData = rawB.map(fix);
const paraAskData = rawA.map(fix);

// 计算稳定 Y轴范围
const all = rawL.concat(rawB, rawA).filter(v => typeof v==="number");
let yMin, yMax;
if (all.length > 0){
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max-min)*0.2 || 20;
  yMin = min - pad;
  yMax = max + pad;
}

let chart;

function renderChart(){
  if(chart) chart.destroy();   // 关键：销毁旧图避免下移累积

  const ctx = document.getElementById("priceChart").getContext("2d");

  chart = new Chart(ctx,{
    type:"line",
    data:{
      labels,
      datasets:[
        { label:"Lighter", data: lighterData, borderColor:"blue", backgroundColor:"blue", tension:0.25 },
        { label:"Paradex Bid", data: paraBidData, borderColor:"green", backgroundColor:"green", tension:0.25 },
        { label:"Paradex Ask", data: paraAskData, borderColor:"red", backgroundColor:"red", tension:0.25 }
      ]
    },
    options:{
      responsive:true,
      animation:false,
      maintainAspectRatio:false,
      scales:{
        y:{ min:yMin, max:yMax }
      }
    }
  });
}

renderChart();

// 自动刷新
setTimeout(()=>location.reload(), 3000);
</script>

</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log("server running", PORT);
});
