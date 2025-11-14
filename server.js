import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/", async (req, res) => {
  try {

    // === Paradex BTC ===
    const paraRes = await fetch("https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP");
    const paraData = await paraRes.json();
    const paraBid = Number(paraData?.best_bid ?? 0);

    // === Lighter BTC ===
    const lightRes = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/market/1/ticker");
    const lightData = await lightRes.json();
    const lighterPrice = Number(lightData?.last_trade_price ?? 0);

    // === 计算价差 ===
    const diff = (lighterPrice - paraBid).toFixed(2);

    // === 输出 HTML 页面 ===
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`
      <html>
        <head>
          <meta charset="utf-8" />
          <title>BTC 价差监控</title>
        </head>
        <body style="font-family: Arial; padding: 20px;">
          <h2>BTC 价差监控（Paradex × Lighter）</h2>
          <p>Paradex：<b>${paraBid}</b></p>
          <p>Lighter：<b>${lighterPrice}</b></p>
          <hr>
          <p>价差（Lighter - Paradex）：<b>${diff}</b></p>
          <script>
            setTimeout(() => location.reload(), 3000);
          </script>
        </body>
      </html>
    `);

  } catch (err) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("服务器错误： " + err.message);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server Running");
});
