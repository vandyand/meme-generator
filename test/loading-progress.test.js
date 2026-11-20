const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  ninesAt,
  secondsToReachNines,
  formatNines,
  loadingText,
  loadingWidth,
} = require("../public/loading-progress.js");

// Exact comparison of two display strings like "99.91" as decimals.
const compareDecimal = (a, b) => {
  const [ia, fa = ""] = a.split(".");
  const [ib, fb = ""] = b.split(".");
  const w = Math.max(fa.length, fb.length);
  const x = BigInt(ia + fa.padEnd(w, "0"));
  const y = BigInt(ib + fb.padEnd(w, "0"));
  return x < y ? -1 : x > y ? 1 : 0;
};

const VALID_TEXT = /^(\d|[1-8]\d|9[0-8])%$|^99(\.9*[1-8]?)?%$/;
const percentAt = (s) => 100 * (1 - 10 ** -ninesAt(s));

describe("loading curve milestones", () => {
  test("starts at 0%", () => {
    assert.equal(loadingText(0), "0%");
    assert.equal(loadingWidth(0), 0);
  });

  test("starts slower than before (old curve: 5% at 0.5 s, ~50% at 6 s)", () => {
    assert.ok(percentAt(0.5) < 2, `${percentAt(0.5)}% at 0.5 s`);
    assert.ok(percentAt(6) < 20, `${percentAt(6)}% at 6 s`);
  });

  const within = (actual, lo, hi, label) =>
    assert.ok(actual >= lo && actual <= hi, `${label}: ${actual.toFixed(1)} s`);

  test("25% at about 10 s", () => within(secondsToReachNines(Math.log10(4 / 3)), 8, 12, "25%"));
  test("50% at about 25 s", () => within(secondsToReachNines(Math.log10(2)), 20, 28, "50%"));
  test("90% at about 60-75 s", () => within(secondsToReachNines(1), 58, 75, "90%"));
  test("99% at about 2 min", () => within(secondsToReachNines(2), 110, 140, "99%"));

  test("secondsToReachNines inverts ninesAt", () => {
    for (const n of [0.1, 0.5, 1, 2, 3.7, 8]) {
      assert.ok(Math.abs(ninesAt(secondsToReachNines(n)) - n) < 1e-9);
    }
  });
});

describe("slows down smoothly the whole way", () => {
  test("each extra 9 takes longer than the one before", () => {
    const times = Array.from({ length: 13 }, (_, n) => secondsToReachNines(n));
    const durations = times.slice(1).map((t, i) => t - times[i]);
    for (let i = 1; i < durations.length; i++) {
      assert.ok(
        durations[i] > durations[i - 1],
        `nine #${i + 1} took ${durations[i].toFixed(1)} s vs ${durations[i - 1].toFixed(1)} s`
      );
    }
  });

  test("each further 1% (and each further step past 99%) takes longer", () => {
    // Time for each successive 1% up to 99%.
    let prev = 0;
    let prevDuration = 0;
    for (let p = 1; p <= 99; p++) {
      const t = secondsToReachNines(-Math.log10(1 - p / 100));
      assert.ok(t - prev > prevDuration, `step to ${p}% sped up`);
      prevDuration = t - prev;
      prev = t;
    }
  });

  test("speed in %/s decreases continuously, including across 99%", () => {
    // speed = d/dt (100 - 100 * 10^-n) = 100 * ln10 * 10^-n * dn/dt, compared in
    // log space so float rounding near 100% doesn't matter.
    const logSpeed = (t) => {
      const h = 1e-4;
      const dn = (ninesAt(t + h) - ninesAt(Math.max(0, t - h))) / (t > h ? 2 * h : h);
      return Math.log(dn) - ninesAt(t) * Math.LN10;
    };
    let prev = Infinity;
    for (let t = 0; t <= 24 * 3600; t += t < 600 ? 0.25 : 30) {
      const v = logSpeed(t);
      assert.ok(v < prev + 1e-9, `speed rose at ${t} s`);
      prev = v;
    }
  });
});

describe("display text", () => {
  test("is monotonically non-decreasing and never reaches 100%", () => {
    let prev = "0";
    // Every 100 ms for the first 10 minutes, then sparser out to ~1 week.
    const times = [];
    for (let t = 0; t <= 600; t += 0.1) times.push(t);
    for (let t = 600; t <= 7 * 24 * 3600; t *= 1.01) times.push(t);
    for (const t of times) {
      const text = loadingText(t);
      assert.match(text, VALID_TEXT, `bad text at ${t} s`);
      assert.ok(!text.startsWith("100"));
      const value = text.slice(0, -1);
      assert.ok(compareDecimal(value, prev) >= 0, `${value} < ${prev} at ${t} s`);
      prev = value;
    }
  });

  test("keeps moving however long it runs", () => {
    for (const hours of [1, 6, 24]) {
      const t = hours * 3600;
      const later = secondsToReachNines(ninesAt(t) + 1);
      assert.notEqual(loadingText(t), loadingText(later), `stuck after ${hours} h`);
    }
  });

  test("passes through the joke sequence past 99%, digit by digit", () => {
    const seen = [];
    for (let t = secondsToReachNines(2) - 1; t < secondsToReachNines(4.05); t += 0.05) {
      const text = loadingText(t);
      if (seen[seen.length - 1] !== text) seen.push(text);
    }
    assert.deepEqual(seen, [
      "98%",
      "99%", "99.1%", "99.2%", "99.3%", "99.4%", "99.5%", "99.6%", "99.7%", "99.8%",
      "99.9%", "99.91%", "99.92%", "99.93%", "99.94%", "99.95%", "99.96%", "99.97%", "99.98%",
      "99.99%", "99.991%",
    ]);
  });

  test("formatNines builds exact digits with no float noise", () => {
    assert.equal(formatNines(0), "0");
    assert.equal(formatNines(Math.log10(2)), "50");
    assert.equal(formatNines(1), "90");
    assert.equal(formatNines(1.5), "96");
    assert.equal(formatNines(2), "99");
    assert.equal(formatNines(3), "99.9");
    assert.equal(formatNines(3.5), "99.96");
    assert.equal(formatNines(13), `99.${"9".repeat(11)}`); // 99.99999999999
    assert.equal(formatNines(40.3), `99.${"9".repeat(38)}4`);
    assert.equal(formatNines(1 - 1e-12), "89");
  });

  test("bar width stays below 100 and is effectively full past 99%", () => {
    assert.ok(loadingWidth(secondsToReachNines(2)) >= 98.99);
    assert.ok(loadingWidth(1e9) < 100);
  });
});
