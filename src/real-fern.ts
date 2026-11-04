// Real Fern forecasts on Lorenz-63, drawn in x, y, z (local preview only).
// CHG: this standalone Space ships only the owner's approved metadata-free example;
// it loads that file from its own data/ directory instead of the local /lab/file route.
//
// Input: a forecast-examples.safetensors file written by a cell whose report declares predictions: true
// (python/fern_train/result_artifacts.py), fetched through /lab/file:
//   history [N, L, C]     the window's past, C = 3 channels (x, y, z), raw Lorenz units
//   target  [N, H, C]     what actually happened
//   point   [N, H, C]     Fern's point forecast
//   samples [N, S, H, C]  S draws of Fern's forecast
// Fern forecasts each channel from its own history; a draw in x, y, z is draw s of each channel taken together.
//
// Drawn for one window n:
//   history line (ink), truth line and the truth point at the cursor (ochre),
//   point forecast line and the S sample paths (frost), the S sample points at the cursor step k,
//   and the ellipsoid that contains 90% of a Gaussian with the samples' mean and 3 × 3 covariance at step k
//   (Mahalanobis radius sqrt(6.251), the 90% quantile of a chi-square with 3 degrees of freedom).

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  NormalBlending,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";

type Tensor = { shape: number[]; data: Float64Array };
export type Examples = {
  history: Tensor;
  target: Tensor;
  point: Tensor;
  samples: Tensor;
};

const CHI2_3_90 = 6.251;

export async function loadExamples(url: string): Promise<Examples> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`cannot read forecast examples: HTTP ${response.status}`);
  return parseExamples(await response.arrayBuffer());
}

// Parsing is separate so a local viewer can verify the exact bytes before use.
export function parseExamples(buf: ArrayBuffer): Examples {
  const view = new DataView(buf);
  const len = Number(view.getBigUint64(0, true));
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf, 8, len)),
  );
  const base = 8 + len;
  const get = (name: string): Tensor => {
    const t = header[name];
    if (!t) throw new Error(`the file has no tensor named ${name}`);
    const [a, b] = t.data_offsets;
    const n = t.shape.reduce((x: number, y: number) => x * y, 1);
    const out = new Float64Array(n);
    const dv = new DataView(buf, base + a, b - a);
    if (t.dtype === "F32")
      for (let i = 0; i < n; i++) out[i] = dv.getFloat32(4 * i, true);
    else if (t.dtype === "F64")
      for (let i = 0; i < n; i++) out[i] = dv.getFloat64(8 * i, true);
    else if (t.dtype === "BF16")
      for (let i = 0; i < n; i++)
        out[i] = new Float32Array(
          new Uint32Array([dv.getUint16(2 * i, true) << 16]).buffer,
        )[0];
    else
      throw new Error(
        `tensor ${name} has dtype ${t.dtype}, which this view does not read`,
      );
    return { shape: t.shape, data: out };
  };
  return {
    history: get("history"),
    target: get("target"),
    point: get("point"),
    samples: get("samples"),
  };
}

// Symmetric 3 × 3 eigen-decomposition by Jacobi rotations: eigenvalues and column eigenvectors.
function eig3(A: number[]): { values: number[]; vectors: number[] } {
  const a = A.slice();
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 30; sweep++) {
    const off = a[1] * a[1] + a[2] * a[2] + a[5] * a[5];
    if (off < 1e-24 * (a[0] * a[0] + a[4] * a[4] + a[8] * a[8] + 1e-300)) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = a[3 * p + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (a[4 * q] - a[4 * p]) / (2 * apq);
      const t =
        Math.sign(theta || 1) /
        (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1),
        s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[3 * k + p],
          akq = a[3 * k + q];
        a[3 * k + p] = c * akp - s * akq;
        a[3 * k + q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[3 * p + k],
          aqk = a[3 * q + k];
        a[3 * p + k] = c * apk - s * aqk;
        a[3 * q + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[3 * k + p],
          vkq = v[3 * k + q];
        v[3 * k + p] = c * vkp - s * vkq;
        v[3 * k + q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: [a[0], a[4], a[8]], vectors: v };
}

function sphereWire(lat = 5, lon = 8, seg = 48): Float32Array {
  const pts: number[] = [];
  for (let i = 1; i <= lat; i++) {
    const phi = (i / (lat + 1)) * Math.PI;
    for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * 2 * Math.PI,
        a1 = ((j + 1) / seg) * 2 * Math.PI;
      pts.push(
        Math.sin(phi) * Math.cos(a0),
        Math.sin(phi) * Math.sin(a0),
        Math.cos(phi),
        Math.sin(phi) * Math.cos(a1),
        Math.sin(phi) * Math.sin(a1),
        Math.cos(phi),
      );
    }
  }
  for (let j = 0; j < lon; j++) {
    const a = (j / lon) * Math.PI;
    for (let i = 0; i < seg; i++) {
      const p0 = (i / seg) * 2 * Math.PI,
        p1 = ((i + 1) / seg) * 2 * Math.PI;
      pts.push(
        Math.sin(p0) * Math.cos(a),
        Math.sin(p0) * Math.sin(a),
        Math.cos(p0),
        Math.sin(p1) * Math.cos(a),
        Math.sin(p1) * Math.sin(a),
        Math.cos(p1),
      );
    }
  }
  return new Float32Array(pts);
}

function cssColor(name: string) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const m = raw.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
    return new Color(r / 255, g / 255, b / 255);
  }
  return new Color(raw || "#ffffff");
}
const isDark = () =>
  document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;

export interface Readout {
  step: HTMLElement | null;
  error: HTMLElement | null;
  spread: HTMLElement | null;
  inside: HTMLElement | null;
}

export interface Playback {
  toggle(): void;
  seek(step: number): void;
  stepBy(delta: number): void;
  setRate(rate: number): void;
  setFullPaths(show: boolean): void;
  seekPeakError(): void;
  stop(): void;
}

export function startRealFern(
  canvas: HTMLCanvasElement,
  ex: Examples,
  windowIndex: number,
  readout: Readout,
  slider: HTMLInputElement | null,
  onPlaying: (playing: boolean) => void,
): Playback {
  const [N, L, C] = ex.history.shape;
  const [, S, H] = ex.samples.shape;
  if (C !== 3)
    throw new Error(`this view needs 3 channels (x, y, z); the file has ${C}`);
  const n = Math.min(Math.max(windowIndex, 0), N - 1);
  const at = (t: Tensor, i: number, j: number) =>
    [0, 1, 2].map((c) => t.data[(n * t.shape[1] + i) * 3 + c]) as [
      number,
      number,
      number,
    ];
  const sampleAt = (s: number, k: number) =>
    [0, 1, 2].map((c) => ex.samples.data[((n * S + s) * H + k) * 3 + c]) as [
      number,
      number,
      number,
    ];

  // centre and scale of the scene from this window's history and target
  const all: number[][] = [];
  for (let i = 0; i < L; i++) all.push(at(ex.history, i, 0));
  for (let k = 0; k < H; k++) all.push(at(ex.target, k, 0));
  const lo = [0, 1, 2].map((c) => Math.min(...all.map((p) => p[c])));
  const hi = [0, 1, 2].map((c) => Math.max(...all.map((p) => p[c])));
  const centre = new Vector3(
    (lo[0] + hi[0]) / 2,
    (lo[1] + hi[1]) / 2,
    (lo[2] + hi[2]) / 2,
  );
  const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-6);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, extent / 100, extent * 20);
  camera.up.set(0, 0, 1);

  const lineOf = (pts: number[][], mat: LineBasicMaterial) => {
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array(
          pts.flatMap((p) => [
            p[0] - centre.x,
            p[1] - centre.y,
            p[2] - centre.z,
          ]),
        ),
        3,
      ),
    );
    const l = new Line(g, mat);
    scene.add(l);
    return l;
  };
  const histMat = new LineBasicMaterial({ transparent: true });
  const truthMat = new LineBasicMaterial({ transparent: true });
  const pointMat = new LineBasicMaterial({ transparent: true });
  const sampleMat = new LineBasicMaterial({
    transparent: true,
    depthWrite: false,
  });
  lineOf(
    Array.from({ length: L }, (_, i) => at(ex.history, i, 0)),
    histMat,
  );
  // the target starts where the history ends, so the two read as one trajectory
  // CHG: keep history separate and reveal only the saved forecast steps.
  const paths = [
    lineOf(
      Array.from({ length: H }, (_, k) => at(ex.target, k, 0)),
      truthMat,
    ),
    lineOf(
      Array.from({ length: H }, (_, k) => at(ex.point, k, 0)),
      pointMat,
    ),
  ];
  for (let s = 0; s < S; s++)
    paths.push(
      lineOf(
        Array.from({ length: H }, (_, k) => sampleAt(s, k)),
        sampleMat,
      ),
    );

  const cloudPos = new Float32Array(3 * S);
  const cloudGeo = new BufferGeometry();
  cloudGeo.setAttribute("position", new BufferAttribute(cloudPos, 3));
  const cloudMat = new PointsMaterial({
    size: 4,
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
  });
  const cloud = new Points(cloudGeo, cloudMat);
  cloud.renderOrder = 3;
  scene.add(cloud);
  const truthDotGeo = new BufferGeometry();
  truthDotGeo.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(3), 3),
  );
  const truthDotMat = new PointsMaterial({
    size: 9,
    sizeAttenuation: false,
    transparent: true,
  });
  const truthDot = new Points(truthDotGeo, truthDotMat);
  truthDot.renderOrder = 4;
  scene.add(truthDot);
  const pointDotGeo = new BufferGeometry();
  pointDotGeo.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(3), 3),
  );
  const pointDotMat = new PointsMaterial({
    size: 9,
    sizeAttenuation: false,
    depthTest: false,
  });
  const pointDot = new Points(pointDotGeo, pointDotMat);
  pointDot.frustumCulled = false;
  truthDot.frustumCulled = false;
  cloud.frustumCulled = false;
  pointDot.renderOrder = 5;
  scene.add(pointDot);
  const wireGeo = new BufferGeometry();
  wireGeo.setAttribute("position", new BufferAttribute(sphereWire(), 3));
  const wireMat = new LineBasicMaterial({
    transparent: true,
    depthWrite: false,
  });
  const wire = new LineSegments(wireGeo, wireMat);
  wire.matrixAutoUpdate = false;
  wire.renderOrder = 2;
  scene.add(wire);

  function theme() {
    const dark = isDark();
    histMat.color.copy(cssColor("--ink"));
    histMat.opacity = 0.45;
    truthMat.color.copy(cssColor("--ochre"));
    truthMat.opacity = 0.95;
    pointMat.color.copy(cssColor("--frost"));
    pointMat.opacity = 1;
    sampleMat.color.copy(cssColor("--frost"));
    sampleMat.opacity = dark ? 0.16 : 0.2;
    sampleMat.blending = dark ? AdditiveBlending : NormalBlending;
    cloudMat.color.copy(cssColor("--frost"));
    cloudMat.opacity = 0.9;
    truthDotMat.color.copy(cssColor("--ochre"));
    pointDotMat.color.copy(cssColor("--frost"));
    wireMat.color.copy(cssColor("--frost"));
    wireMat.opacity = 0.6;
    for (const m of [
      histMat,
      truthMat,
      pointMat,
      sampleMat,
      cloudMat,
      truthDotMat,
      wireMat,
    ])
      m.needsUpdate = true;
  }
  theme();
  // CHG: the standalone Space can switch windows repeatedly; release each view's listeners.
  const events = new AbortController();
  window.addEventListener("fern-theme", theme, { signal: events.signal });

  // per-step statistics, computed once: mean, covariance, and whether the truth is inside the 90% ellipsoid
  const steps = Array.from({ length: H }, (_, k) => {
    const pts = Array.from({ length: S }, (_, s) => sampleAt(s, k));
    const mean = [0, 1, 2].map(
      (c) => pts.reduce((acc, p) => acc + p[c], 0) / S,
    );
    const cov = Array(9).fill(0);
    for (const p of pts)
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          cov[3 * i + j] +=
            ((p[i] - mean[i]) * (p[j] - mean[j])) / Math.max(S - 1, 1);
    const { values, vectors } = eig3(cov);
    const truth = at(ex.target, k, 0);
    // Mahalanobis distance through the eigenbasis; directions with no spread are skipped
    let d2 = 0;
    for (let e = 0; e < 3; e++) {
      const proj = [0, 1, 2].reduce(
        (acc, i) => acc + vectors[3 * i + e] * (truth[i] - mean[i]),
        0,
      );
      d2 +=
        values[e] > 1e-12
          ? (proj * proj) / values[e]
          : proj * proj > 1e-12
            ? Infinity
            : 0;
    }
    const pointK = at(ex.point, k, 0);
    const err = Math.hypot(
      pointK[0] - truth[0],
      pointK[1] - truth[1],
      pointK[2] - truth[2],
    );
    return {
      mean,
      values,
      vectors,
      truth,
      inside: d2 <= CHI2_3_90,
      err,
      std: [0, 4, 8].map((i) => Math.sqrt(Math.max(cov[i], 0))),
    };
  });
  const insideCount = steps.filter((s) => s.inside).length;
  // CHG 2026-10-25: the Chinese page (<html lang="zh-Hans">) gets Chinese readouts.
  const zh = document.documentElement.lang.startsWith("zh");
  if (readout.inside)
    readout.inside.textContent = zh
      ? `${H} 步中的 ${insideCount} 步`
      : `${insideCount} of ${H} steps`;

  let k = 0;
  let fullPaths = false;
  const peakError = steps.reduce(
    (peak, step, index) => (step.err > steps[peak].err ? index : peak),
    0,
  );
  const m4 = new Matrix4();
  function setStep(kk: number) {
    k = Math.min(Math.max(Math.round(kk), 0), H - 1);
    const st = steps[k];
    for (let s = 0; s < S; s++) {
      const p = sampleAt(s, k);
      cloudPos[3 * s] = p[0] - centre.x;
      cloudPos[3 * s + 1] = p[1] - centre.y;
      cloudPos[3 * s + 2] = p[2] - centre.z;
    }
    cloudGeo.attributes.position.needsUpdate = true;
    const tp = truthDotGeo.attributes.position as BufferAttribute;
    tp.setXYZ(
      0,
      st.truth[0] - centre.x,
      st.truth[1] - centre.y,
      st.truth[2] - centre.z,
    );
    tp.needsUpdate = true;
    const p = at(ex.point, k, 0);
    const pp = pointDotGeo.attributes.position as BufferAttribute;
    pp.setXYZ(0, p[0] - centre.x, p[1] - centre.y, p[2] - centre.z);
    pp.needsUpdate = true;
    for (const path of paths)
      path.geometry.setDrawRange(0, fullPaths ? H : k + 1);
    const r = Math.sqrt(CHI2_3_90);
    const ax = st.values.map((v) => r * Math.sqrt(Math.max(v, 0)));
    const V = st.vectors;
    m4.set(
      V[0] * ax[0],
      V[1] * ax[1],
      V[2] * ax[2],
      st.mean[0] - centre.x,
      V[3] * ax[0],
      V[4] * ax[1],
      V[5] * ax[2],
      st.mean[1] - centre.y,
      V[6] * ax[0],
      V[7] * ax[1],
      V[8] * ax[2],
      st.mean[2] - centre.z,
      0,
      0,
      0,
      1,
    );
    wire.matrix.copy(m4);
    wire.matrixWorldNeedsUpdate = true;
    if (readout.step)
      readout.step.textContent = zh
        ? `第 ${k + 1} 步，共 ${H} 步`
        : `${k + 1} of ${H}`;
    if (readout.error) readout.error.textContent = st.err.toFixed(2);
    if (readout.spread)
      readout.spread.textContent = st.std.map((v) => v.toFixed(2)).join(", ");
    // CHG: keep the focused slider in sync while playback advances or a window changes.
    if (slider) slider.value = String(k);
  }

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let zoom = 1;
  let az = -0.8,
    el = 0.35,
    playing = false;
  let rate = 1;
  let lastTick: number | undefined;
  let elapsed = 0;
  function setPlaying(value: boolean) {
    playing = value;
    lastTick = undefined;
    elapsed = 0;
    onPlaying(value);
  }
  // CHG: stop an already playing forecast when reduced motion is enabled.
  motion.addEventListener(
    "change",
    (event) => {
      if (event.matches) setPlaying(false);
    },
    { signal: events.signal },
  );
  function render() {
    const R = extent * 2.4 * zoom;
    camera.position.set(
      R * Math.cos(el) * Math.cos(az),
      R * Math.cos(el) * Math.sin(az),
      R * Math.sin(el),
    );
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1), false);
    camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(() => {
    resize();
    render();
  });
  observer.observe(canvas);
  let dragging = false,
    lx = 0,
    ly = 0;
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!dragging) return;
      az -= (e.clientX - lx) * 0.006;
      el = Math.max(-0.3, Math.min(1.2, el + (e.clientY - ly) * 0.004));
      lx = e.clientX;
      ly = e.clientY;
      render();
    },
    { signal: events.signal },
  );
  canvas.addEventListener("pointerup", () => (dragging = false), {
    signal: events.signal,
  });
  canvas.addEventListener("pointercancel", () => (dragging = false), {
    signal: events.signal,
  });
  // CHG: the Space advertises wheel zoom; clamp the camera distance for readability.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = Math.max(0.65, Math.min(2, zoom * Math.exp(e.deltaY * 0.001)));
      render();
    },
    { signal: events.signal, passive: false },
  );
  slider?.setAttribute("max", String(H - 1));
  slider?.addEventListener(
    "input",
    () => {
      seek(Number(slider.value));
    },
    { signal: events.signal },
  );

  function seek(step: number) {
    setPlaying(false);
    setStep(step);
    render();
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      lastTick = undefined;
    },
    { signal: events.signal },
  );

  let raf = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    // CHG: hold the camera steady for comparison and advance at 16 saved steps/s at 1×.
    if (document.hidden || !playing) return;
    if (lastTick !== undefined) elapsed += now - lastTick;
    lastTick = now;
    const interval = 1000 / (16 * rate);
    const advance = Math.floor(elapsed / interval);
    if (!advance) return;
    elapsed -= advance * interval;
    setStep(k + advance);
    if (k === H - 1) setPlaying(false);
    render();
  };
  resize();
  setStep(0);
  render();
  raf = requestAnimationFrame(loop);
  return {
    toggle() {
      if (!playing && k === H - 1) setStep(0);
      setPlaying(!playing);
      render();
    },
    seek,
    stepBy(delta) {
      seek(k + delta);
    },
    setRate(value) {
      rate = value;
      lastTick = undefined;
      elapsed = 0;
    },
    setFullPaths(show) {
      fullPaths = show;
      setStep(k);
      render();
    },
    seekPeakError() {
      seek(peakError);
    },
    stop() {
      cancelAnimationFrame(raf);
      events.abort();
      observer.disconnect();
      scene.traverse((object) => {
        if (
          object instanceof Line ||
          object instanceof LineSegments ||
          object instanceof Points
        ) {
          object.geometry.dispose();
        }
      });
      for (const material of [
        histMat,
        truthMat,
        pointMat,
        sampleMat,
        cloudMat,
        truthDotMat,
        pointDotMat,
        wireMat,
      ])
        material.dispose();
      renderer.dispose();
    },
  };
}
