import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/", async (req, res) => {
  try {
    // 1. Paradex
    const p = await fetch("https://api.paradex.trade/v1/markets/order_book_stats");
    const pjson = await p.json();
    const btcPara = pjson.order_book_stats.find(i => i.symbol === "BTC");
    const paraPrice = Number(btcPara?.last_trade_price);

    // 2. Lighter
    const l = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1");
    const ljson = await l.json();
    const bid = Number(ljson?.bids?.[0]?.price);
    const ask = Number(ljson?.asks?.[0]?.price);
    const lighterPrice = (bid + ask) / 2;

    // 3. Spread
    const spread = lighterPrice - paraPrice;

    res.send(`
      <h2>BTC 价差监控（最简）</h2>
      <p>Paradex BTC：<b>${paraPrice}</b></p>
      <p>Lighter BTC：<b>${lighterPrice.toFixed(2)}</b></p>
      <hr>
      <p>价差（Lighter - Paradex）：<b>${spread.toFixed(2)}</b></p>
      <script>setTimeout(()=>location.reload(),3000)</script>
    `);

  } catch (e) {
    res.send("Error: " + e.message);
  }
});

app.listen(3000);
