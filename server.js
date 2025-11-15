export default {
  async fetch() {
    try {

      // ============================
      // 1. 获取 Paradex 价格（bid / ask）
      // ============================
      let paraBid = null;
      let paraAsk = null;

      try {
        const res = await fetch("https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP");
        const json = await res.json();

        const rawBid = Number(json?.best_bid);
        const rawAsk = Number(json?.best_ask);

        paraBid = Number.isFinite(rawBid) ? rawBid : null;
        paraAsk = Number.isFinite(rawAsk) ? rawAsk : null;

      } catch (err) {
        console.log("Paradex API Error:", err);
      }


      // ============================
      // 2. 获取 Lighter 价格（只用 last_trade_price）
      // ============================
      let lighterPrice = null;

      try {
        const res = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1");
        const json = await res.json();

        const raw = Number(json?.last_trade_price);
        lighterPrice = Number.isFinite(raw) ? raw : null;

      } catch (err) {
        console.log("Lighter API Error:", err);
      }


      // ============================
      // 3. 计算价差
      // ============================
      const spreadA = (lighterPrice !== null && paraBid !== null)
        ? (lighterPrice - paraBid).toFixed(2)
        : "--";

      const spreadB = (lighterPrice !== null && paraAsk !== null)
        ? (paraAsk - lighterPrice).toFixed(2)
        : "--";

      const fmt = (v) => (v === null ? "--" : v);

      // ============================
      // 4. 网页显示
      // ============================
      return new Response(
        `
        <html>
        <head>
          <meta charset="utf-8"/>
          <title>BTC 套利监控</title>
          <style>
            body { font-family: Arial; background:#fafafa; padding:20px; }
            .box { background:#fff; padding:15px; border-radius:10px; margin:15px 0; }
            .title { font-size:22px; font-weight:bold; }
            .val { font-size:24px; font-weight:bold; }
          </style>
        </head>
        <body>

          <div class="title">BTC 套利监控（Lighter × Paradex）</div>
          <br>

          <div class="box">
            Lighter Price：<span class="val">${fmt(lighterPrice)}</span>
          </div>

          <div class="box">
            Paradex Bid：<span class="val">${fmt(paraBid)}</span><br>
            Paradex Ask：<span class="val">${fmt(paraAsk)}</span>
          </div>

          <div class="box">
            方向 A（L 多 - P 空）：<span class="val">${spreadA}</span>
          </div>

          <div class="box">
            方向 B（P 多 - L 空）：<span class="val">${spreadB}</span>
          </div>

          <script>
            setTimeout(() => location.reload(), 3000);
          </script>

        </body>
        </html>
        `,
        { headers: { "Content-Type": "text/html;charset=UTF-8" } }
      );

    } catch (err) {
      return new Response("Error: " + err.message);
    }
  }
};
