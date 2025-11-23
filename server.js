// server.js —— BTC 套利监控（无图表版本）
// 后台每 3 秒采样一次（你不开网页也会持续记录）
// 页面支持：手动刷新 + 自动 3 秒刷新
// 显示：即时价差、Lighter、Paradex、15 分钟统计

import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// 15 分钟（毫秒）
const WINDOW_MS = 15 * 60 * 1000;

// 后台采样间隔
const SAMPLE_INTERVAL_MS = 3000;

// 保存历史样本
// { ts, lighter, paraBid, paraAsk }
const samples = [];

// ========================== 工具函数 ==========================

function fmt(v) {
  return v == null || !Number.isFinite(v) ? "—" : Number(v).toFixed(2);
}

function fmtSigned(v) {
  return v == null || !Number.isFinite(v)
    ? "—"
    : (v > 0 ? "+" : "") + Number(v).toFixed(2);
}

// ========================== API 获取价格 ==========================

async function fetchPrices() {
  let lighter = null;
  let paraBid = null;
  let paraAsk = null;

  // Lighter
  try {
    const res = await fetch(
      "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=1"
    );
    const json = await res.json();
    const raw = Number(json?.order_book_details?.[0]?.last_trade_price);
    if (Number.isFinite(raw)) lighter = raw;
  } catch {}

  // Paradex
  try {
    const res = await fetch(
      "https://api.prod.paradex.trade/v1/bbo/BTC-USD-PERP"
    );
    const json = await res.json();
    const rawBid = Number(json?.bid);
    const rawAsk = Number(json?.ask);
    if (Number.isFinite(rawBid)) paraBid = rawBid;
    if (Number.isFinite(rawAsk)) paraAsk = rawAsk;
  } catch {}

  return { lighter, paraBid, paraAsk };
}

// ========================== 采样存储 ==========================

async function takeSample() {
  const p = await fetchPrices();
  const now = Date.now();

  if (p.lighter == null && p.paraBid == null && p.paraAsk == null) return;

  samples.push({
    ts: now,
    lighter: p.lighter,
    paraBid: p.paraBid,
    paraAsk: p.paraAsk
  });

  const cutoff = now - WINDOW_MS;
  while (samples.length && samples[0].ts < cutoff) samples.shift();
}

// 启动立即采一次
takeSample();

// 后台每 3 秒自动采样
setInterval(() => takeSample(), SAMPLE_INTERVAL_MS);

// ========================== 15分钟统计 ==========================

function calcStats(direction) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const vals = [];

  for (const s of samples) {
    if (s.ts < cutoff) continue;

    let spread = null;

    if (direction === "A") {
      // 方向 A：L 多 - P 空
      if (s.lighter != null && s.paraBid != null)
        spread = s.lighter - s.paraBid;
    } else if (direction === "B") {
      // 方向 B：P 多 - L 空
      if (s.lighter != null && s.paraAsk != null)
        spread = s.paraAsk - s.lighter;
    }

    if (spread != null && Number.isFinite(spread)) vals.push(spread);
  }

  if (!vals.length) return null;

  return {
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    max: Math.max(...vals),
    min: Math.min(...vals),
    count: vals.length
  };
}

// ========================== 页面 ==========================

app.get("/", async (req, res) => {
  // 若尚无数据则强制采样一次
  if
