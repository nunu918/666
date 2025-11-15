const express = require("express");
const fetch = require("node-fetch");
const app = express();

// 自动刷新间隔（毫秒）
const REFRESH_MS = 3000;

app.get("/", async (req, res) => {
    try {
        // ===== Lighter BTC =====
        const lighterRes = await fetch(
            "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails"
        );
        const lighterJson = await lighterRes.json();

        // 用 symbol 精准定位 BTC，避免价格取错
        const lighterBTC =
            lighterJson?.order_book_details?.find(i => i.symbol === "BTC")?.last_trade_price || 0;

        // ===== Paradex =====
        const paraRes = await fetch(
            "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
        );
        const paraJson = await paraRes.json();

        const paraBid = paraJson?.bid || 0;
        const paraAsk = paraJson?.ask || 0;

        // ===== 套利方向 =====
        const spreadA = lighterBTC - paraBid;   // L 多 → P 空
        const spreadB = paraAsk - lighterBTC;   // P 多 → L 空

        // HTML 输出 + 自动刷新
        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>BTC 套利监控</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <!-- 自动刷新 -->
    <meta http-equiv="refresh" content="${REFRESH_MS / 1000}">

    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
            padding: 20px;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 15px;
        }
        .box {
            background: #f5f5f5;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 12px;
            font-size: 18px;
        }
    </style>
</head>

<body>

<div class="title">BTC 套利监控（Lighter × Paradex）</div>

<div class="box">Lighter BTC： ${lighterBTC}</div>

<div class="box">Paradex Bid： ${paraBid}<br>
Paradex Ask： ${paraAsk}</div>

<div class="box">方向 A（L 多 - P 空）： <b>${spreadA.toFixed(2)}</b></div>
<div class="box">方向 B（P 多 - L 空）： <b>${spreadB.toFixed(2)}</b></div>

</body>
</html>
        `);
    } catch (err) {
        res.send("ERROR: " + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
