const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  creepPercentText,
  ticksForCreepStep,
  initialLoadingState,
  nextLoadingState,
  loadingText,
  loadingWidth,
} = require("../public/loading-progress.js");

// Run the state machine and record the text after every tick.
const runTicks = (n, state = initialLoadingState()) => {
  const texts = [];
  for (let i = 0; i < n; i++) {
    state = nextLoadingState(state);
    texts.push(loadingText(state));
  }
  return { state, texts };
};

// Distinct consecutive values, in order.
const distinct = (texts) => texts.filter((t, i) => i === 0 || t !== texts[i - 1]);

const CREEP_TEXT = /^99(\.9*[1-9])?%$/;

describe("creepPercentText", () => {
  test("adds decimal places one digit at a time", () => {
    const seq = Array.from({ length: 29 }, (_, i) => creepPercentText(i));
    assert.deepEqual(seq, [
      "99",
      "99.1", "99.2", "99.3", "99.4", "99.5", "99.6", "99.7", "99.8", "99.9",
      "99.91", "99.92", "99.93", "99.94", "99.95", "99.96", "99.97", "99.98", "99.99",
      "99.991", "99.992", "99.993", "99.994", "99.995", "99.996", "99.997", "99.998", "99.999",
      "99.9991",
    ]);
  });

  test("builds exact strings far out, with no float noise", () => {
    assert.equal(creepPercentText(9 * 20), `99.${"9".repeat(20)}`);
    assert.equal(creepPercentText(9 * 20 + 1), `99.${"9".repeat(20)}1`);
  });

  test("rejects invalid steps", () => {
    assert.throws(() => creepPercentText(-1), RangeError);
    assert.throws(() => creepPercentText(1.5), RangeError);
  });
});

describe("ticksForCreepStep", () => {
  test("each new decimal place takes longer per step", () => {
    assert.equal(ticksForCreepStep(0), 1);
    assert.equal(ticksForCreepStep(1), 1); // 99.1
    assert.equal(ticksForCreepStep(9), 1); // 99.9
    assert.equal(ticksForCreepStep(10), 2); // 99.91
    assert.equal(ticksForCreepStep(18), 2); // 99.99
    assert.equal(ticksForCreepStep(19), 3); // 99.991
  });
});

describe("loading progress state machine", () => {
  test("starts at 0% with an ease-out phase", () => {
    const start = initialLoadingState();
    assert.equal(loadingText(start), "0%");
    const { texts } = runTicks(5);
    assert.deepEqual(texts, ["5%", "9%", "14%", "18%", "22%"]);
  });

  test("ease-out increments shrink but never drop below 1% per tick", () => {
    let state = initialLoadingState();
    let prevIncrement = Infinity;
    while (state.progress < 99) {
      const next = nextLoadingState(state);
      const step = next.progress - state.progress;
      assert.ok(step <= prevIncrement + 1e-9, "steps should not grow");
      if (next.progress < 99) assert.ok(step >= 1 - 1e-9);
      prevIncrement = step;
      state = next;
    }
  });

  test("reaches 99% and then creeps through the joke sequence", () => {
    const { texts } = runTicks(200);
    const creep = distinct(texts.slice(texts.indexOf("99%")));
    assert.deepEqual(creep.slice(0, 21), [
      "99%",
      "99.1%", "99.2%", "99.3%", "99.4%", "99.5%", "99.6%", "99.7%", "99.8%", "99.9%",
      "99.91%", "99.92%", "99.93%", "99.94%", "99.95%", "99.96%", "99.97%", "99.98%", "99.99%",
      "99.991%", "99.992%",
    ]);
  });

  test("each new decimal place takes longer than the previous one", () => {
    const { texts } = runTicks(2000);
    const decimalsAt = (t) => (t.includes(".") ? t.length - 4 : 0); // "99." + digits + "%"
    const ticksPerPlace = new Map();
    for (const t of texts) {
      if (!CREEP_TEXT.test(t)) continue;
      const d = decimalsAt(t);
      ticksPerPlace.set(d, (ticksPerPlace.get(d) || 0) + 1);
    }
    // Compare only fully completed decimal places.
    const maxPlace = Math.max(...ticksPerPlace.keys());
    for (let d = 2; d < maxPlace; d++) {
      assert.ok(
        ticksPerPlace.get(d) > ticksPerPlace.get(d - 1),
        `place ${d} (${ticksPerPlace.get(d)} ticks) should take longer than place ${d - 1}`
      );
    }
  });

  test("never reaches 100% and keeps moving however long it runs", () => {
    // 20,000 ticks at 500 ms is close to 3 hours of loading.
    const { texts } = runTicks(20000);
    for (const t of texts) {
      assert.ok(!t.startsWith("100"), `unexpected ${t}`);
      assert.match(t, /^(\d|[1-8]\d|9[0-8])%$|^99(\.9*[1-9])?%$/);
    }
    // Still changing near the end: never stuck on one value for long.
    const tail = texts.slice(-1000);
    assert.ok(distinct(tail).length > 1, "should still be moving after hours");
    // Text increases monotonically (as an exact decimal).
    const values = distinct(texts).map((t) => t.slice(0, -1));
    for (let i = 1; i < values.length; i++) {
      const [a, b] = [values[i - 1], values[i]];
      const fa = a.split(".")[1] || "";
      const fb = b.split(".")[1] || "";
      const width = Math.max(fa.length, fb.length);
      const ia = BigInt(a.split(".")[0] + fa.padEnd(width, "0"));
      const ib = BigInt(b.split(".")[0] + fb.padEnd(width, "0"));
      assert.ok(ib > ia, `${b} should be greater than ${a}`);
    }
  });

  test("keeps the bar effectively full once creeping", () => {
    const { state } = runTicks(500);
    assert.equal(loadingWidth(state), 99);
    assert.equal(loadingWidth(initialLoadingState()), 0);
  });

  test("does not mutate the previous state", () => {
    const s0 = initialLoadingState();
    const copy = { ...s0 };
    nextLoadingState(s0);
    assert.deepEqual(s0, copy);
  });
});
