import express from "express";

const app = express();

// 静态内存保存历史价格（用于画线）
let priceHistory = {
  lighter: [],
  paraBid: [],
  paraAsk: [],
  time: []
};

function pushHistory(light, bid, ask) {
  const now = new Date();
  const t = now.toLocaleTimeString("zh-CN", { hour12: false });

  priceHistory.lighter.push(light ?? 0);
  priceHistory.paraBid.push(bid ?? 0);
  priceHistory.paraAsk.push(ask ?? 0);
  priceHistory.time.push(t);

  if (priceHistory.lighter.length > 20) {
    Object.keys(priceHistory).forEach(k => priceHistory[k].shift());
  }
}

app.get("/", async (req, res) => {
  let lighter = 0;
  let paraBid = 0;
  let paraAsk = 0;

  // ===== 读取 Lighter =====
  try {
    const liteRes = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails");
    const liteJson = await liteRes.json();
    lighter = Number(liteJson?.order_book_details?.[0]?.last_trade_price ?? 0);
  } catch (e) {
    console.log("Lighter API error:", e);
  }

  // ===== 读取 Paradox =====
  try {
    const paraRes = await fetch("https://api.prod.paradex.trade/v1/markets/BTC-USD-PERP/ticker");
    const paraJson = await paraRes.json();
    paraBid = Number(paraJson?.bid ?? 0);
    paraAsk = Number(paraJson?.ask ?? 0);
  } catch (e) {
    console.log("Paradex API error:", e);
  }

  // 保存记录（用于曲线）
  pushHistory(lighter, paraBid, paraAsk);

  // 套利方向计算
  const A = (lighter - paraBid).toFixed(2);
  const B = (paraAsk - lighter).toFixed(2);

  res.send(`
    <html>
    <meta charset="utf-8"/>

    <body style="font-family:Arial;padding:20px;">

    <h2>BTC 套利监控（Lighter × Paradex）</h2>

    <div><b>Lighter BTC：</b> ${lighter}</div>
    <div><b>Paradex Bid：</b> ${paraBid}</div>
    <div><b>Paradex Ask：</b> ${paraAsk}</div>

    <br>
    <div><b>方向 A（L 多 - P 空）：</b> ${A}</div>
    <div><b>方向 B（P 多 - L 空）：</b> ${B}</div>

    <br><br>

    <h3>价格曲线（最近 20 次）</h3>
    <canvas id="chart" width="380" height="260"></canvas>

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
      const data = ${JSON.stringify(priceHistory)};

      new Chart(
        document.getElementById('chart'),
        {
          type: 'line',
          data: {
            labels: data.time,
            datasets: [
              { label:'Lighter', data:data.lighter, borderColor:'blue'},
              { label:'Paradex Bid', data:data.paraBid, borderColor:'green'},
              { label:'Paradex Ask', data:data.paraAsk, borderColor:'red'}
            ]
          }
        }
      );
    </script>

    </body></html>
  `);
});

// 必须有这个!! 否则 Render 会 "Application exited early"
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on port", PORT));
