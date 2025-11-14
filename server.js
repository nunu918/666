import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// ---- 获取 Lighter BTC 价格（用你给我的接口） ----
async function getLighterPrice() {
  try {
    const res = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1", {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)"
      }
    });

    const data = await res.json();

    const details = data.order_book_details?.[0];
    if (!details) return null;

    return details.last_trade_price; // 你浏览器能看到这个字段
  } catch (e) {
    return null;
  }
}

// ---- 获取 Paradex BTC 价格（你测试成功的端口） ----
async function getParadexPrice() {
  try {
    const res = await fetch("https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP", {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        "Accept": "application/json"
      }
    });

    const data = await res.json();

    return {
      bid: parseFloat(data.bid),
      ask: parseFloat(data.ask)
    };

  } catch (e) {
    return null;
  }
}

app.get("/", async (req, res) => {
  const lighter = await getLighterPrice();
  const para = await getParadexPrice();

  if (!lighter) {
    return res.send("Error: Lighter price not found");
  }
  if (!para) {
    return res.send("Error: Paradex price not found");
  }

  const diff = lighter - para.bid;

  res.send(`
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>BTC 套利监控</title>
      <style>
        body { font-family: Arial; padding:20px; font-size:20px; }
        .box { padding:15px; margin-top:15px; background:#f2f2f2; border-radius:8px; }
      </style>
    </head>
    <body>

      <h2>BTC 套利监控（Lighter × Paradex）</h2>

      <div class="box">
        <b>Lighter BTC：</b> ${lighter}
      </div>

      <div class="box">
        <b>Paradex Bid：</b> ${para.bid}<br>
        <b>Paradex Ask：</b> ${para.ask}
      </div>

      <div class="box">
        <b>价差（Lighter - Paradex Bid）：</b> ${diff.toFixed(2)}
      </div>

      <script>
        setTimeout(()=>location.reload(), 3000);
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
