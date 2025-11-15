// server.js  —— 只用一个 Lighter 价格 + Paradex Bid/Ask + 价格曲线

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 价差历史（最近 20 次）
const priceHistory = {
  lighter: [],
  paraBid: [],
  paraAsk: [],
  time: []
};

// 简单格式化显示
function fmt(val) {
  if (val == null) return "—";
  return Number(val).toFixed(2);
}

// 记录一条历史（最多 20 条）
function pushHistory(light, bid, ask) {
  if (light == null && bid == null && ask == null) return;

  const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });

  priceHistory.lighter.push(light);
  priceHistory.paraBid.push(bid);
  priceHistory.paraAsk.push(ask);
  priceHistory.time.push(t);

  if (priceHistory.lighter.length > 20) {
    ["lighter", "paraBid", "paraAsk", "time"].forEach(k => priceHistory[k].shift());
  }
}

app.get("/", async (req, res) => {
  let lighterPrice = null;
  let paraBid = null;
  let paraAsk = null;

  // 1. Lighter —— 只用你给的 last_trade_price 这个“一个价格”
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

  // 2. Paradex —— 用你测试过成功的 bbo 接口
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

  // 3. 价差计算（方向 A / 方向 B）
  let spreadA = null; // L 多 - P 空 = Lighter - P.bid
  let spreadB = null; // P 多 - L 空 = P.ask - Lighter

  if (lighterPrice != null && paraBid != null) {
    spreadA = lighterPrice - paraBid;
  }
  if (lighterPrice != null && paraAsk != null) {
    spreadB = paraAsk - lighterPrice;
  }

  // 4. 推进历史（画曲线用）
  pushHistory(lighterPrice, paraBid, paraAsk);

  // 5. 输出页面（保留你原来的布局，只加一个图表）
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
    canvas {
      width: 100%;
      max-width: 640px;
      margin-top: 8px;
    }
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
    <div class="spread-title">方向 A（L 多 - P 空）： ${fmt(spreadA)}</div>
    <div class="spread-title" style="margin-top:8px;">方向 B（P 多 - L 空）： ${fmt(spreadB)}</div>
  </div>

  <div class="card">
    <div class="label" style="margin-bottom:6px;">价格曲线（最近 20 次）</div>
    <canvas id="priceChart" height="260"></canvas>
  </div>

  <!-- Chart.js CDN -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    const labels = ${JSON.stringify(priceHistory.time)};
    const lighterData = ${JSON.stringify(priceHistory.lighter)};
    const paraBidData = ${JSON.stringify(priceHistory.paraBid)};
    const paraAskData = ${JSON.stringify(priceHistory.paraAsk)};

    const ctx = document.getElementById('priceChart').getContext('2d');

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Lighter',
            data: lighterData,
            borderWidth: 2,
            tension: 0.2,
            spanGaps: true
          },
          {
            label: 'Paradex Bid',
            data: paraBidData,
            borderWidth: 2,
            tension: 0.2,
            spanGaps: true
          },
          {
            label: 'Paradex Ask',
            data: paraAskData,
            borderWidth: 2,
            tension: 0.2,
            spanGaps: true
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: false }
          },
          y: {
            title: { display: false },
            ticks: {
              callback: function(value) {
                return value.toFixed ? value.toFixed(0) : value;
              }
            }
          }
        },
        plugins: {
          legend: {
            position: 'top'
          }
        }
      }
    });

    // 每 3 秒自动刷新一次页面
    setTimeout(function () { location.reload(); }, 3000);
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
