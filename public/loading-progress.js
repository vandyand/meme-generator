// Pure loading-bar progress logic, shared by the browser (window.LoadingProgress)
// and the node:test suite (module.exports).
//
// The bar eases out towards 99%, then never reaches 100%: it keeps creeping
// with ever more decimal places (99.1 ... 99.9, 99.91 ... 99.99, 99.991 ...),
// each new decimal place taking a little longer than the last.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LoadingProgress = api;
})(typeof self !== "undefined" ? self : this, function () {
  const CREEP_START = 99;
  const INITIAL_INCREMENT = 5;
  const MIN_INCREMENT = 1;
  const EASE_FACTOR = 0.95;

  // Text (without "%") for creep step n: 0 -> "99", 1..9 -> "99.1".."99.9",
  // 10..18 -> "99.91".."99.99", 19.. -> "99.991"... Built from digits, so no
  // float noise.
  const creepPercentText = (step) => {
    if (!Number.isInteger(step) || step < 0) {
      throw new RangeError("step must be a non-negative integer");
    }
    if (step === 0) return String(CREEP_START);
    const decimals = Math.floor((step - 1) / 9) + 1;
    const lastDigit = ((step - 1) % 9) + 1;
    return `${CREEP_START}.${"9".repeat(decimals - 1)}${lastDigit}`;
  };

  // Ticks spent on creep step n before moving to the next: one tick per
  // step at the first decimal place, two at the second, and so on.
  const ticksForCreepStep = (step) =>
    step === 0 ? 1 : Math.floor((step - 1) / 9) + 1;

  const initialLoadingState = () => ({
    progress: 0,
    increment: INITIAL_INCREMENT,
    creepStep: 0,
    ticksInStep: 0,
  });

  const isCreeping = (state) => state.progress >= CREEP_START;

  const nextLoadingState = (state) => {
    if (!isCreeping(state)) {
      // Ease-out phase: same feel as before, slowing to a steady 1% per tick.
      return {
        ...state,
        progress: Math.min(CREEP_START, state.progress + state.increment),
        increment: Math.max(MIN_INCREMENT, state.increment * EASE_FACTOR),
      };
    }
    const ticksInStep = state.ticksInStep + 1;
    if (ticksInStep >= ticksForCreepStep(state.creepStep)) {
      return { ...state, creepStep: state.creepStep + 1, ticksInStep: 0 };
    }
    return { ...state, ticksInStep };
  };

  const loadingText = (state) =>
    isCreeping(state)
      ? `${creepPercentText(state.creepStep)}%`
      : `${Math.floor(state.progress)}%`;

  // The bar itself stays effectively full once creeping.
  const loadingWidth = (state) => Math.min(state.progress, CREEP_START);

  return {
    CREEP_START,
    creepPercentText,
    ticksForCreepStep,
    initialLoadingState,
    nextLoadingState,
    loadingText,
    loadingWidth,
  };
});
