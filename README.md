# Fern Forecast Player

Play saved Fern forecasts on Lorenz-63. Switch between three retained test windows, step through 192 predictions, and compare the point forecast and 32 predictive samples with the true simulated trajectory.

The current-step wire ellipsoid is the 90% region of a Gaussian fitted to those 32 samples. It is a visualization of sample spread. The point error is the Euclidean distance between the saved point forecast and the simulated truth in raw Lorenz units. The middle window peaks at step 34 (19.33 units).

The data are from a trained NLL + Huber variant with independently forecast x, y and z coordinates, paired by sample index in the visualization. The ICML paper covers the separate point-forecasting model. The player reads saved predictions in your browser.

[Paper](https://proceedings.mlr.press/v306/wang26ax.html) · [Paper code](https://github.com/QilinWang/Fern-icml2026) · [Fern site](https://fern-forecasting.netlify.app/)

Netlify serves `public/`. The TypeScript sources are in `src/`; `npm install` and `npm run build` rebuild the browser bundle. Set `FERN_PREVIEW_URL` to an HTTP URL serving `public/index.html` when running the browser test. Three.js is distributed under the included license.
