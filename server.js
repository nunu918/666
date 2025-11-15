import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

// Lighter API
const lighterAPI = "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails";

// Paradex API
const paradexAPI = "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP";

app.get("/", async (req, res) => {
  try {
    // ===== Lighter 价格 =====
    const lighterRes = await fetch(lighterAPI);
    const lighterData = await lighterRes.json();
    const lighterDetail = lighterData?.order_book_details?.[0];
    const lighterPrice = Number(lighterDetail?.last_trade_price);

    if (!lighterPrice) throw new Error("Lighter 价格获取失败");

    // ===== Paradex 价格 =====
    const pRes = await fetch(paradexAPI);
    const pData = await pRes.json();
    const pBid = Number(pData?.bid);
    const pAsk = Number(pData?.ask);

    if (!pBid || !pAsk) throw new Error("Paradex 价格获取失败");

    // ===== 两个方向的价差 =====
    // 方向 A：L 多 → P 空  （L 买，P 卖）
    const spreadA = lighterPrice - pBid;

    // 方向 B：P 多 → L 空  （P 买，L 卖）
    const spreadB = pAsk - lighterPrice;

    res.send(`
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>BTC 套利监控</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 20px;
            background: #0b1020;
            color: #f5f5f5;
          }
          h1 {
            font-size: 22px;
            margin-bottom: 16px;
          }
          .row {
            margin-bottom: 14px;
          }
          .label {
            color: #bbbbbb;
            font-size: 14px;
          }
          .value {
            font-size: 18px;
            font-weight: 600;
          }
          .card {
            background: #141a33;
            border-radius: 10px;
            padding: 14px;
            margin-top: 10px;
          }
          .title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 6px;
          }
          .sub {
            font-size: 13px;
            color: #999;
            margin-bottom: 8px;
          }
          .spread-pos {
            color: #2ecc71;
            font-weight: 700;
            font-size: 18px;
          }
          .spread-neg {
            color: #e74c3c;
            font-weight: 700;
            font-size: 18px;
          }
          .small {
            font-size: 12px;
            color: #777;
          }
        </style>
      </head>
      <body>
        <h1>BTC 套利监控（Lighter × Paradex）</h1>

        <div class="row">
          <div class="label">Lighter 价格</div>
          <div class="value">${lighterPrice}</div>
        </div>

        <div class="row">
          <div class="label">Paradex Bid / Ask</div>
          <div class="value">${pBid} / ${pAsk}</div>
        </div>

        <!-- 方向 A：L 多 → P 空 -->
        <div class="card">
          <div class="title">方向 A：L 多 → P 空</div>
          <div class="sub">公式：Lighter 价格 − Paradex Bid</div>
          <div> Lighter：<b>${lighterPrice}</b></div>
          <div> P Bid：<b>${pBid}</b></div>
          <div style="margin-top:6px;">
            价差 A：
            <span class="${spreadA >= 0 ? "spread-pos" : "spread-neg"}">
              ${spreadA.toFixed(2)}
            </span>
          </div>
        </div>

        <!-- 方向 B：P 多 → L 空 -->
        <div class="card">
          <div class="title">方向 B：P 多 → L 空</div>
          <div class="sub">公式：Paradex Ask − Lighter 价格</div>
          <div> P Ask：<b>${pAsk}</b></div>
          <div> Lighter：<b>${lighterPrice}</b></div>
          <div style="margin-top:6px;">
            价差 B：
            <span class="${spreadB >= 0 ? "spread-pos" : "spread-neg"}">
              ${spreadB.toFixed(2)}
            </span>
          </div>
        </div>

        <div class="row" style="margin-top:12px;">
          <span class="small">页面每 3 秒自动刷新一次。</span>
        </div>

        <script>
          setTimeout(() => location.reload(), 3000);
        </script>
      </body>
      </html>
    `);

  } catch (err) {
    res.send("服务器错误：" + err.message);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port", port));
