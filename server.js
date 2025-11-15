// server.js —— 只修复曲线部分，不修改你其他逻辑

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 最近 20 次价格记录
const priceHistory = {
  lighter: [],
  paraBid: [],
  paraAsk: [],
  time: []
};

function fmt(val) {
  if (val == null) return "—";
  return Number(val).toFixed(2);
}

function pushHistory(light, bid, ask) {
  const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });

  priceHistory.lighter.push(light ?? null);
  priceHistory.paraBid.push(bid ?? null);
  priceHistory.paraAsk.push(ask ?? null);
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

  // 1. Lighter
  try {
    const lightRes = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const lightJson = await lightRes.json();

    const rawL = Number(lightJson?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(rawL)) lighterPrice = rawL;
  } catch (err) {
    console.log("Lighter API Error:", err);
  }

  // 2. Paradex
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
    console.log("Paradex API Error:", err);
  }

  // 3. 价差
  let spreadA = lighterPrice != null && paraBid != null ? lighterPrice - paraBid : null;
  let spreadB = lighterPrice != null && paraAsk != null ? paraAsk - lighterPrice : null;

  // 4. 记录历史
  pushHistory(lighterPrice, paraBid, paraAsk);

  // 5. 输出页面
  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>BTC 套利监控（Lighter × Paradex）</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text";padding:16px;background:#f5f5f7;}
.title{font-size:24px;font-weight:700;margin-bottom:16px;}
.card{background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,0.06);}
.label{font-size:14px;color:#555;}
.value{margin-top:6px;font-size:20px;font-weight:600;}
canvas{width:100%;height:260px;}
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
  <div class="label">方向 A（L 多 - P 空）： ${fmt(spreadA)}</div>
  <div class="label" style="margin-top:8px;">方向 B（P 多 - L 空）： ${fmt(spreadB)}</div>
</div>

<div class="card">
  <div class="label">价格曲线（最近 20 次）</div>
  <canvas id="priceChart"></canvas>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
// 修复：Chart.js 要求颜色 + 修复 null 值断线
const labels = ${JSON.stringify(priceHistory.time)};
const lighterData = ${JSON.stringify(priceHistory.lighter)};
const paraBidData = ${JSON.stringify(priceHistory.paraBid)};
const paraAskData = ${JSON.stringify(priceHistory.paraAsk)};

// 替换 null → undefined（Chart.js 才能画断点）
function fixNull(arr){
  return arr.map(v => v == null ? undefined : v);
}

const ctx = document.getElementById('priceChart').getContext('2d');

new Chart(ctx, {
  type: 'line',
  data: {
    labels: labels,
    datasets: [
      {
        label: "Lighter",
        data: fixNull(lighterData),
        borderColor: "blue",
        backgroundColor: "blue",
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 2,
        spanGaps: false
      },
      {
        label: "Paradex Bid",
        data: fixNull(paraBidData),
        borderColor: "green",
        backgroundColor: "green",
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 2,
        spanGaps: false
      },
      {
        label: "Paradex Ask",
        data: fixNull(paraAskData),
        borderColor: "red",
        backgroundColor: "red",
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 2,
        spanGaps: false
      }
    ]
  },
  options:{
    responsive:true,
    maintainAspectRatio:false,
    animation:false
  }
});

// 自动刷新
setTimeout(()=>location.reload(),3000);
</script>

</body>
</html>
  `);
});

app.listen(PORT, ()=>console.log("Server listening on", PORT));
