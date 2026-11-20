// Pure loading-bar progress logic, shared by the browser (window.LoadingProgress)
// and the node:test suite (module.exports).
//
// Progress is a function of elapsed time only, so a throttled background tab
// still shows the right value when it next renders. The remaining distance to
// 100% decays geometrically: we model the number of leading nines,
//
//   nines(t) = C * ln(1 + t/B + (t/K)^2)      (t in seconds)
//   percent  = 100 - 100 * 10^(-nines)
//
// so 90% is one nine, 99% two, 99.9% three, and so on. The constants are
// chosen so the speed in %/s falls continuously from the very start (that
// needs K >= ~81 here), and once the quadratic term dominates each extra nine
// takes about e^(1/(2C)) ~ 1.47x as long as the previous one, so the bar keeps
// slowing smoothly and never reaches 100%. With these values:
//   25% ~ 10 s, 50% ~ 22 s, 90% ~ 65 s, 99% ~ 2 min 14 s, 99.9% ~ 3 min 46 s,
//   99.99% ~ 5 min 56 s ...
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LoadingProgress = api;
})(typeof self !== "undefined" ? self : this, function () {
  const C = 1.3;
  const B = 115;
  const K = 85;

  const ninesAt = (seconds) => {
    const t = Math.max(0, Number(seconds) || 0);
    return C * Math.log(1 + t / B + (t / K) ** 2);
  };

  // Inverse of ninesAt: seconds needed to reach `nines` (e.g. 2 -> 99%).
  const secondsToReachNines = (nines) => {
    const g = Math.expm1(nines / C); // t/B + (t/K)^2 = g
    const a = 1 / K ** 2;
    const b = 1 / B;
    return (-b + Math.sqrt(b * b + 4 * a * g)) / (2 * a);
  };

  // Exact display text (without "%") for a number of nines. Built from
  // digits, never from float formatting, so there is no float noise and it
  // can never round up to 100:
  //   < 90%            -> integer percent ("0".."89")
  //   one nine         -> "90".."98"
  //   two or more      -> "99", "99.1".."99.8", "99.9", "99.91".."99.98",
  //                       "99.99", "99.991" ...
  const formatNines = (nines) => {
    if (!(nines > 0)) return "0";
    if (nines < 1) {
      const percent = Math.floor(100 * -Math.expm1(-nines * Math.LN10));
      return String(Math.min(89, Math.max(0, percent)));
    }
    const whole = Math.floor(nines);
    // Next digit after the run of nines: floor(10 * (1 - 10^-fraction)).
    const fraction = nines - whole;
    const nextDigit = Math.min(
      8,
      Math.max(0, Math.floor(10 * -Math.expm1(-fraction * Math.LN10)))
    );
    const digits = "9".repeat(whole) + (nextDigit > 0 ? String(nextDigit) : "");
    if (digits.length <= 2) return digits.padEnd(2, "0");
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  };

  const loadingText = (seconds) => `${formatNines(ninesAt(seconds))}%`;

  // Bar width in percent. Visually full long before the text stops moving.
  const loadingWidth = (seconds) =>
    Math.min(99.9, 100 * -Math.expm1(-ninesAt(seconds) * Math.LN10));

  return {
    ninesAt,
    secondsToReachNines,
    formatNines,
    loadingText,
    loadingWidth,
  };
});
