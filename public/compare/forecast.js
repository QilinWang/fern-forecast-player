export const horizon = 192;
const normal90 = 1.6448536269514722;

export function describeForecast(truth, { mean, std }) {
  return truth.map((target, step) => ({
    error: Math.hypot(...target.map((v, c) => mean[step][c] - v)),
    axes: target.map((value, axis) => {
      const center = mean[step][axis];
      const halfWidth = normal90 * std[step][axis];
      const lo = center - halfWidth;
      const hi = center + halfWidth;
      return {
        truth: value,
        center,
        lo,
        hi,
        width: 2 * halfWidth,
        error: Math.abs(center - value),
        covered: value >= lo && value <= hi,
      };
    }),
  }));
}

export function locateEvents(matrix) {
  const splits = [];
  const errors = [];
  for (const [model, [first, second]] of matrix.entries()) {
    let episode;
    for (let step = 0; step < horizon; step++) {
      const a = first[step].axes[0].center;
      const b = second[step].axes[0].center;
      if (Math.sign(a) * Math.sign(b) !== -1) {
        episode = undefined;
        continue;
      }
      const value = Math.abs(a - b);
      if (!episode) {
        episode = { model, start: step, end: step, peak: step, value };
        splits.push(episode);
      }
      episode.end = step;
      if (value > episode.value) {
        episode.peak = step;
        episode.value = value;
      }
    }
    for (const [seed, series] of [first, second].entries()) {
      const peak = series.reduce(
        (best, entry, step) => (entry.error > series[best].error ? step : best),
        0,
      );
      errors.push({
        model,
        seed,
        start: peak,
        end: peak,
        peak,
        value: series[peak].error,
      });
    }
  }
  return {
    splits: splits.sort((a, b) => b.value - a.value),
    errors: errors.sort((a, b) => b.value - a.value),
  };
}
