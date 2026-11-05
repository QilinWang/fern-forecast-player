# Fern Forecast Player

[Open the live forecast player](https://fern-forecast-player.netlify.app/).
Play saved Fern forecasts on Lorenz-63. Switch between three retained test windows, step through 192 predictions, and compare the point forecast and 32 predictive samples with the true simulated trajectory.

The current-step wire ellipsoid is the 90% region of a Gaussian fitted to those 32 samples. It is a visualization of sample spread. The point error is the Euclidean distance between the saved point forecast and the simulated truth in raw Lorenz units. The middle window peaks at step 34 (19.33 units).

The data are from a trained NLL + Huber variant with independently forecast x, y and z coordinates, paired by sample index in the visualization. The ICML paper covers the separate point-forecasting model. The player reads saved predictions in your browser.

[Paper](https://proceedings.mlr.press/v306/wang26ax.html) · [Paper code](https://github.com/QilinWang/Fern-icml2026) · [Fern site](https://fern-forecasting.netlify.app/)

Netlify serves `public/`. The TypeScript sources are in `src/`; `npm install` and `npm run build` rebuild the browser bundle. Set `FERN_PREVIEW_URL` to an HTTP URL serving `public/index.html` when running the browser test. Three.js is distributed under the included license.

## Research explorer

- [Four training settings × two seeds](https://fern-forecast-player.netlify.app/compare/). Synchronize the same Lorenz window across Huber, NLL + Huber, NLL and soft-clip NLL, with 32 retained trajectories per run, a shared three-dimensional view and event jumps.
- [Gaussian injection](https://fern-forecast-player.netlify.app/injection/). Compare two Rössler windows in raw and truth-whitened coordinates, using saved scores, reconstructed noisy targets and fixed-checkpoint samples.
- [Radial, angular and Student-W](https://fern-forecast-player.netlify.app/shape/). Inspect saved paired-seed scores and degrees-of-freedom readouts.

The new views preserve a single matched Lorenz test window (0,1608), two training seeds, raw units, and 192 forecast steps. They use the previously saved fixed-weight replay outputs. The marginal bands in the comparison are analytic Gaussian intervals. Huber's scale head was unfitted, and soft-clip changes scale parameterization. The XYZ samples pair independent channel outputs by saved sample index. Sign counts describe x side. The data do not establish a ranking over unseen windows or seeds.

The Gaussian explorer uses Rössler x, Gaussian RMS 0.5, 192-step futures and 3,217 saved test-window scores. The sample overlay has only the two recovered windows, 1441 and 1394. Replay Joint KL differs from the producer's scores by at most 0.011 nats on those windows. The shape view presents saved score and parameter summaries with missing or failed pairs retained in its coverage.

Qilin developed the Fern models and directed the research questions and scientific settings. AI coding agents implemented the visualization and publication adaptation, with numerical and browser checks against the saved artifacts.

The six exported JSON payloads total approximately 4 MB and are served in the static snapshot. public/release.json lists their exact sizes and SHA-256 digests. The browser fetches relative data URLs, so a later R2/B2 origin can be added through routing without changing the forecasting computations. The public export contains only the display code and selected results.
