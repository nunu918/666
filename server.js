import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", async (req, res) => {
  try {
    // ===== Lighter BTC 价格 =====
    const lighterRes = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails");
    const lighterData = await lighterRes.json();

    const lighterPrice = lighterData?.order_book_details?.[0]?.last_trade_price;

    if (!lighterPrice) throw new Error("Lighter BTC price not found");

    // ===== Paradex BTC 价格 =====
    const paraRes = await fetch("https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP");
    const paraData = await paraRes.json();

    const bid = paraData?.best_bid;
    const ask = paraData?.best_ask;

    if (!bid || !ask) throw new Error("Paradex BTC price not found");

    const paradexPrice = (bid + ask) / 2; // 中间价（最稳）

    // ===== 计算价差 =====
    const spread = lighterPrice - paradexPrice;

    // ===== 输出 HTML =====
    res.send(`
      <html>
        <head><meta charset="utf-8"><title>BTC 价差监控</title></head>
        <body style="font-family:Arial;padding:20px;">
          <h2>BTC 价差监控（Lighter × Paradex）</h2>

          <p>Lighter 价格：<b>${lighterPrice}</b></p>
          <p>Paradex 价格：<b>${paradexPrice.toFixed(2)}</b></p>
          <p>价差（Lighter - Paradex）：<b>${spread.toFixed(2)}</b></p>

          <p style="color:gray;">（每 3 秒自动刷新）</p>

          <script>
            setTimeout(() => location.reload(), 3000);
          </script>
        </body>
      </html>
    `);

  } catch (err) {
    res.send("Error: " + err.message);
  }
});

app.listen(PORT, () => console.log("Server running on port", PORT));
