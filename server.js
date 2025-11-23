// server.js —— 实时 BTC 套利监控（重点数字放大版）
// - 只放大关键数字：Lighter、Paradex、方向A/B价差
// - 其他逻辑（采样/统计/刷新）完全保持你当前成功版本

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 15 分钟窗口
const WINDOW_MS = 15 * 60 * 1000;
const MAX_POINTS = 20;
const SAMPLE_INTERVAL_MS = 3000;

const samples = [];

// 工具
function fmt(v){ return (v==null||!isFinite(v)) ? "—" : Number(v).toFixed(2); }
function fmtSigned(v){
  if(v==null||!isFinite(v)) return "—";
  const n = Number(v).toFixed(2);
  return (v>0?"+":"") + n;
}

// 获取价格
async function fetchPrices(){
  let lighterPrice=null, paraBid=null, paraAsk=null;

  try{
    const r = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1");
    const j = await r.json();
    const raw = Number(j?.order_book_details?.[0]?.last_trade_price);
    if(isFinite(raw)) lighterPrice = raw;
  }catch{}

  try{
    const r = await fetch("https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP");
    const j = await r.json();
    const bid = Number(j?.bid);
    const ask = Number(j?.ask);
    if(isFinite(bid)) paraBid = bid;
    if(isFinite(ask)) paraAsk = ask;
  }catch{}

  return { lighterPrice, paraBid, paraAsk };
}

// 采样
async function takeSample(){
  const { lighterPrice, paraBid, paraAsk } = await fetchPrices();
  const now = Date.now();
  if(lighterPrice==null && paraBid==null && paraAsk==null) return;
  samples.push({ ts:now, lighter:lighterPrice, paraBid, paraAsk });

  const cutoff = now - WINDOW_MS;
  while(samples.length && samples[0].ts < cutoff) samples.shift();
}
setInterval(()=>takeSample(), SAMPLE_INTERVAL_MS);
takeSample();

// 统计
function calcStats(dir){
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const values=[];

  for(const s of samples){
    if(s.ts < cutoff) continue;
    let spread=null;

    if(dir==="A" && s.lighter!=null && s.paraBid!=null)
      spread = s.lighter - s.paraBid;

    if(dir==="B" && s.lighter!=null && s.paraAsk!=null)
      spread = s.paraAsk - s.lighter;

    if(spread!=null && isFinite(spread)) values.push(spread);
  }
  if(!values.length) return null;

  return {
    avg: values.reduce((a,b)=>a+b,0)/values.length,
    max: Math.max(...values),
    min: Math.min(...values),
    count: values.length
  };
}

// 页面
app.get("/", async (req,res)=>{
  if(!samples.length) await takeSample();

  const last = samples[samples.length-1] ?? {};
  const lighter = last.lighter ?? null;
  const bid = last.paraBid ?? null;
  const ask = last.paraAsk ?? null;

  const spreadA = (lighter!=null&&bid!=null) ? lighter - bid : null;
  const spreadB = (lighter!=null&&ask!=null) ? ask - lighter : null;

  const statsA = calcStats("A");
  const statsB = calcStats("B");

  res.send(`
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>BTC 套利监控</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text"; margin:0; padding:16px; background:#f5f5f7; }
  .title { font-size:24px; font-weight:700; margin-bottom:16px; }
  .card { background:#fff; border-radius:12px; padding:12px 16px; margin-bottom:12px; box-shadow:0 2px 4px rgba(0,0,0,0.03); }
  .label { font-size:14px; color:#555; margin-bottom:4px; }

  /* 🔥 重点数字放大版 */
  .big-value {
    font-size:32px;      /* 放大数字 */
    font-weight:700;
    color:#000;
    margin-top:2px;
  }

  .spread-big {
    font-size:32px;
    font-weight:800;
    color:#007AFF;       /* iOS 蓝色 */
    margin-top:4px;
  }
  .spread-b { color:#FF3B30; } /* 红色 */

  .small { font-size:12px; color:#888; margin-top:4px; }
</style>
</head>

<body>
  <div class="title">BTC 套利监控（L × P）</div>

  <!-- Lighter -->
  <div class="card">
    <div class="label">Lighter BTC</div>
    <div class="big-value">${fmt(lighter)}</div>
  </div>

  <!-- Paradex -->
  <div class="card">
    <div class="label">Paradex Bid</div>
    <div class="big-value">${fmt(bid)}</div>

    <div class="label" style="margin-top:12px;">Paradex Ask</div>
    <div class="big-value">${fmt(ask)}</div>
  </div>

  <!-- 即时价差 A/B -->
  <div class="card">
    <div class="label">即时价差</div>

    <div class="spread-big">
      A（L 多 - P 空）：
      <span>${fmtSigned(spreadA)}</span>
    </div>

    <div class="spread-big spread-b">
      B（P 多 - L 空）：
      <span>${fmtSigned(spreadB)}</span>
    </div>
  </div>

  <!-- 15 min stats -->
  <div class="card">
    <div class="label">15 分钟统计</div>

    <div class="label" style="margin-top:8px;"><strong>方向 A</strong></div>
    ${ statsA ? `
      <div>平均：${fmtSigned(statsA.avg)}</div>
      <div>最高：${fmtSigned(statsA.max)}</div>
      <div>最低：${fmtSigned(statsA.min)}</div>
      <div class="small">样本：${statsA.count} 次</div>
    ` : `<div class="small">暂无数据</div>` }

    <div class="label" style="margin-top:12px;"><strong>方向 B</strong></div>
    ${ statsB ? `
      <div>平均：${fmtSigned(statsB.avg)}</div>
      <div>最高：${fmtSigned(statsB.max)}</div>
      <div>最低：${fmtSigned(statsB.min)}</div>
      <div class="small">样本：${statsB.count} 次</div>
    ` : `<div class="small">暂无数据</div>` }

    <div class="small" style="margin-top:10px;">
      后台每 3 秒采样 · 页面每 3 秒刷新
    </div>
  </div>

  <script>
    setTimeout(()=>location.reload(),3000);
  </script>

</body>
</html>
  `);
});

app.listen(PORT,"0.0.0.0",()=>console.log("Server RUNNING on",PORT));
