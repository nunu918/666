const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.get("/", async (req, res) => {
  try {
    // ====== Lighter BTC ======
    const lighterRes = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const lighterJson = await lighterRes.json();
    const lighterBTC = lighterJson?.order_book_details?.[0]?.last_trade_price;

    // ====== Paradex ======
    const paraRes = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const paraJson = await paraRes.json();
    const paraBid = paraJson?.bid;
    const paraAsk = paraJson?.ask;

    // ====== spreads ======
    const spreadA = lighterBTC - paraBid; // L 多 / P 空
    const spreadB = paraAsk - lighterBTC; // P 多 / L 空

    res.send(`
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>BTC 套利监控</title>
        <style>
          body { font-family: Arial; padding:20px; background:#f2f2f2 }
          .box{padding:12px;margin:12px 0;background:#fff;border-radius:8px;font-size:20px}
          .title{font-weight:bold;font-size:22px;margin-bottom:10px}
        </style>
      </head>
      <body>

        <div class="title">BTC 套利监控（Lighter × Paradex）</div>

        <div class="box">
          <div>Lighter BTC：${lighterBTC}</div>
        </div>

        <div class="box">
          <div>Paradex Bid：${paraBid}</div>
          <div>Paradex Ask：${paraAsk}</div>
        </div>

        <div class="box">
          <div><b>方向 A（L 多 - P 空）：</b>${spreadA.toFixed(2)}</div>
          <div><b>方向 B（P 多 - L 空）：</b>${spreadB.toFixed(2)}</div>
        </div>
      </body>
      </html>
    `);

  } catch (err) {
    res.send("ERROR: " + err.message);
  }
});

app.listen(3000, () => console.log("Server started on 3000"));
