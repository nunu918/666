import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/", async (req, res) => {
    try {
        // ====== Lighter BTC ======
        const lighterRes = await fetch(
            "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails"
        );
        const lighterJson = await lighterRes.json();
        const lighterBTC = lighterJson?.order_book_details?.[0]?.last_trade_price || 0;

        // ====== Paradex ======
        const paraRes = await fetch(
            "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
        );
        const paraJson = await paraRes.json();
        const paraBid = paraJson?.bid || 0;
        const paraAsk = paraJson?.ask || 0;

        // ====== 两个方向价差 ======
        const spreadA = lighterBTC - paraBid;   // L 多 - P 空
        const spreadB = paraAsk - lighterBTC;   // P 多 - L 空

        // ====== 返回 HTML（只新增自动刷新标签） ======
        res.send(`
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- ⭐⭐⭐ 只有这句是新增的：每 3 秒自动刷新 ⭐⭐⭐ -->
    <meta http-equiv="refresh" content="3">

    <title>BTC 套利监控（Lighter × Paradex）</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont; margin: 20px; }
        .title { font-size: 20px; font-weight: 700; margin-bottom: 15px; }
        .item { font-size: 18px; margin: 6px 0; }
    </style>
</head>
<body>

<div class="title">BTC 套利监控（Lighter × Paradex）</div>

<div class="item"><b>Lighter BTC：</b> ${lighterBTC}</div>

<div class="item"><b>Paradex Bid：</b> ${paraBid}</div>
<div class="item"><b>Paradex Ask：</b> ${paraAsk}</div>

<div class="item"><b>方向 A（L 多 - P 空）：</b> ${spreadA.toFixed(2)}</div>
<div class="item"><b>方向 B（P 多 - L 空）：</b> ${spreadB.toFixed(2)}</div>

</body>
</html>
        `);

    } catch (err) {
        res.send("ERROR: " + err.message);
    }
});

app.listen(3000, () => console.log("Server running on port 3000"));
