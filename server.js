const express = require("express");
const fetch = require("node-fetch");

const app = express();

app.get("/", async (req, res) => {
  try {
    // ========== 1. 获取 Lighter BTC 价格 ==========
    const lighterRes = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1");
    const lighterJson = await lighterRes.json();

    const lighterBTC =
      lighterJson?.order_book_details?.[0]?.last_trade_price ||
      lighterJson?.order_book_details?.[0]?.index_price ||
      0;

    if (!lighterBTC) console.log("lighterBTC not found");

    // ========== 2. 获取 Paradex BTC ==========
    const paraRes = await fetch("https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP");
    const paraJson = await paraRes.json();

    const paraBid = paraJson?.best_bid || 0;
    const paraAsk = paraJson?.best_ask || 0;

    // ========== 3. 价差方向 ==========
    const spreadA = lighterBTC - paraBid; // L多 - P空
    const spreadB = paraAsk - lighterBTC; // P多 - L空

    // ========== 4. 返回 HTML ==========
    res.send(`
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BTC 套利监控（Lighter × Paradex）</title>

  <!-- 自动刷新 -->
  <meta http-equiv="refresh" content="3">

  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial;
      margin: 16px;
      background: #f5f5f5;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 14px;
    }
    .item {
      font-size: 18px;
      margin: 6px 0;
    }
    .box {
      background: #ffffff;
      padding: 12px;
      border-radius: 10px;
      margin-bottom: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .chart-box {
      background: #ffffff;
      padding: 10px;
      border-radius: 10px;
      margin-top: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      height: 260px;
    }
    .chart-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>

  <div class="title">BTC 套利监控（Lighter × Paradex）</div>

  <div class="box">
    <div class="item"><b>Lighter BTC：</b> ${lighterBTC}</div>
  </div>

  <div class="box">
    <div class="item"><b>Paradex Bid：</b> ${paraBid}</div>
    <div class="item"><b>Paradex Ask：</b> ${paraAsk}</div>
  </div>

  <div class="box">
    <div class="item"><b>方向 A（L多 - P空）：</b> ${spreadA.toFixed(2)}</div>
    <div class="item"><b>方向 B（P多 - L空）：</b> ${spreadB.toFixed(2)}</div>
  </div>

  <!-- 曲线图（在底部，你选择的位置 3） -->
  <div class="chart-box">
    <div class="chart-title">价格曲线（L vs P Bid / Ask）</div>
    <canvas id="priceChart"></canvas>
  </div>

  <!-- Chart.js CDN -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

  <script>
    // 当前值
    const lighterPrice = Number(${lighterBTC});
    const paraBid = Number(${paraBid});
    const paraAsk = Number(${paraAsk});

    // 时间点
    const now = new Date();
    const label = now.getHours().toString().padStart(2, "0") + ":" +
                  now.getMinutes().toString().padStart(2, "0") + ":" +
                  now.getSeconds().toString().padStart(2, "0");

    const MAX_POINTS = 60;

    let history = [];
    try {
      history = JSON.parse(localStorage.getItem("btc_price_history") || "[]");
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }

    // 加入新点
    history.push({
      time: label,
      lighter: lighterPrice,
      bid: paraBid,
      ask: paraAsk
    });

    if (history.length > MAX_POINTS) {
      history = history.slice(history.length - MAX_POINTS);
    }

    localStorage.setItem("btc_price_history", JSON.stringify(history));

    const labels = history.map(p => p.time);
    const lighterData = history.map(p => p.lighter);
    const bidData = history.map(p => p.bid);
    const askData = history.map(p => p.ask);

    const ctx = document.getElementById("priceChart").getContext("2d");

    new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Lighter", data: lighterData, borderColor: "blue", tension: 0.2 },
          { label: "Paradex Bid", data: bidData, borderColor: "green", tension: 0.2 },
          { label: "Paradex Ask", data: askData, borderColor: "red", tension: 0.2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: false } }
      }
    });
  </script>

</body>
</html>
  `);

  } catch (err) {
    res.send("Error: " + err.message);
  }
});

// 监听
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
