import assert from "node:assert/strict";
import test from "node:test";

import { calcStats, fmt, fmtSigned } from "../server.js";

test("fmt handles null and numbers", () => {
  assert.equal(fmt(null), "—");
  assert.equal(fmt(Number.NaN), "—");
  assert.equal(fmt(1.239), "1.24");
});

test("fmtSigned prefixes positives and formats numbers", () => {
  assert.equal(fmtSigned(null), "—");
  assert.equal(fmtSigned(-1.234), "-1.23");
  assert.equal(fmtSigned(1.234), "+1.23");
});

test("calcStats computes stats for direction A and B", () => {
  const now = 100000;
  const sampleData = [
    { ts: now - 1000, lighter: 100, paraBid: 98, paraAsk: 102 },
    { ts: now - 2000, lighter: 105, paraBid: 103, paraAsk: 106 }
  ];

  const statsA = calcStats("A", sampleData, now);
  assert.equal(statsA.count, 2);
  assert.equal(statsA.avg, 2);
  assert.equal(statsA.max, 2);
  assert.equal(statsA.min, 2);

  const statsB = calcStats("B", sampleData, now);
  assert.equal(statsB.count, 2);
  assert.equal(statsB.avg, 1.5);
  assert.equal(statsB.max, 2);
  assert.equal(statsB.min, 1);
});
