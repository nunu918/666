// server.js
import express from "express";

const app = express();

app.get("/", async (req, res) => {
  try {
    // 1. Paradex BTC 价格（bbo 接口）
    const paraRes = await fetch("https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP");
    const paraData = await paraRes.json();
    const paraBid = Number(paraData?.best_bid || 0);

    // 2. Lighter BTC 价格（用 ticker，拿 last_trade_price）
    const lightRes = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/market/1/ticker");
    const lightData = await lightRes.json();
    const lighterPrice = Number(lightData?.last_trade_price || 0);

    // 3. 计算价差
    const diff = (lighterPrice - paraBid).toFixed(2);

    // 4. 输出简单网页
    res.send(`
      <html>
        <head>
          <meta charset="utf-8" />
          <title>BTC 价差监控</title>
        </head>
        <body style="font-family: Arial; padding: 20px;">
          <h2>BTC 价差监控（Paradex × Lighter）</h2>
          <p>Paradex BTC：<b>${paraBid}</b></p>
          <p>Lighter BTC：<b>${lighterPrice}</b></p>
          <hr>
          <p>价差（Lighter - Paradex）：<b>${diff}</b></p>
          <script>
            // 每 3 秒刷新一次
            setTimeout(() => location.reload(), 3000);
          </script>
        </body>
      </html>
    `);
  } catch (e) {
    res.send("Error: " + e.message);
  }
});

// Render 必须用这个端口
app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
