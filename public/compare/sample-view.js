import { horizon } from "./forecast.js";

const drawCount = 32;
const sideColors = ["#73c7ff", "#bac7cc", "#ffad72"];
const initialYaw = -0.35;
const initialPitch = 0.4;
const field = (id) => document.getElementById(id);
const colorFor = (x) => sideColors[Math.sign(x) + 1];
const sideLabel = (x) => (x < 0 ? "负侧" : x > 0 ? "正侧" : "零点");

export function countSides(draws, step) {
  const counts = [0, 0, 0];
  for (const path of draws) counts[Math.sign(path[step][0]) + 1]++;
  return counts;
}

function sameTruth(saved, truth) {
  return (
    saved.length === truth.length &&
    truth.every(
      (point, h) =>
        saved[h].length === point.length &&
        point.every((v, c) => v === saved[h][c]),
    )
  );
}

function pathIsValid(path) {
  return (
    Array.isArray(path) &&
    path.length === horizon &&
    path.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 3 &&
        point.every(Number.isFinite),
    )
  );
}

function worldBounds(data, models) {
  const low = [0, Infinity, Infinity];
  const high = [0, -Infinity, -Infinity];
  const include = (point) =>
    point.forEach((v, c) => {
      low[c] = Math.min(low[c], v);
      high[c] = Math.max(high[c], v);
    });
  data.truth.forEach(include);
  for (const { id, runs } of data.models) {
    for (const [i, run] of runs.entries()) {
      run.mean.forEach(include);
      for (const path of models[id][i].draws) path.forEach((p) => include(p));
    }
  }
  const center = low.map((v, c) => (v + high[c]) / 2);
  const radius = Math.hypot(...high.map((v, c) => v - center[c]));
  const plane = [
    [0, low[1], low[2]],
    [0, high[1], low[2]],
    [0, high[1], high[2]],
    [0, low[1], high[2]],
  ];
  return { center, radius, plane, low, high };
}

export async function loadSampleView(data) {
  const response = await fetch("./samples.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const saved = await response.json();
  if (
    saved.schema !== "fern.lab.lorenz-draws.v1" ||
    saved.key?.join() !== data.key.join() ||
    saved.seeds?.join() !== data.seeds.join() ||
    !sameTruth(saved.truth, data.truth) ||
    !data.models.every(
      ({ id }) =>
        saved.models[id]?.length === data.seeds.length &&
        saved.models[id].every(
          ({ draws }) => draws.length === drawCount && draws.every(pathIsValid),
        ),
    )
  ) {
    throw new Error("样本窗口、seed、真值或数组形状不匹配");
  }

  const modelField = field("sample-model");
  for (const { id, label } of data.models)
    modelField.add(new Option(label, id));
  modelField.value = "mix";
  const bounds = worldBounds(data, saved.models);
  const panels = data.seeds.map((seed) => {
    const card = document.createElement("article");
    card.className = "sample-panel";
    card.dataset.seed = String(seed);
    card.innerHTML = `<h3>Seed ${seed}</h3>
      <p class="sample-counts"></p>
      <canvas role="img" aria-label="真值与 32 条预测样本的旋转三维投影"></canvas>
      <p class="sample-truth"></p>`;
    const canvas = card.querySelector("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建三维投影画布");
    field("sample-panels").append(card);
    return {
      canvas,
      context,
      counts: card.querySelector(".sample-counts"),
      truth: card.querySelector(".sample-truth"),
    };
  });

  let yaw = initialYaw;
  let pitch = initialPitch;
  let step = 45;
  let drag;

  function drawPanel(panel, run, mean) {
    const { canvas, context: ctx } = panel;
    const { width, height } = canvas.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const pixelRatio = Math.min(2, devicePixelRatio || 1);
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const scale = (Math.min(width, height) * 0.47) / bounds.radius;
    const project = (point) => {
      const [x, y, z] = point.map((v, c) => v - bounds.center[c]);
      const side = x * sinYaw + y * cosYaw;
      return [
        width / 2 + scale * (x * cosYaw - y * sinYaw),
        height / 2 - scale * (z * cosPitch - side * sinPitch),
        side * cosPitch + z * sinPitch,
      ];
    };
    const trace = (points, color, lineWidth, fill) => {
      ctx.beginPath();
      for (const [i, point] of points.entries()) {
        const [x, y] = project(point);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (fill) {
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };
    const label = (text, point, color) => {
      const [x, y] = project(point);
      ctx.fillStyle = color;
      ctx.font = "11px system-ui";
      ctx.fillText(text, x + 4, y - 4);
    };

    trace(bounds.plane, "#648895", 1, "#35546542");
    label("x=0", bounds.plane[2], "#aac0c5");
    const { low, high } = bounds;
    label("y+", bounds.plane[1], "#aac0c5");
    label("z+", bounds.plane[3], "#aac0c5");
    trace(
      [
        [low[0], 0, low[2]],
        [high[0], 0, low[2]],
      ],
      "#78929e",
      1,
    );
    label("x−", [low[0], 0, low[2]], sideColors[0]);
    label("x+", [high[0], 0, low[2]], sideColors[2]);
    trace(data.truth, "#dce9ed3a", 1);
    const start = Math.max(0, step - 8);
    for (const draw of run.draws) {
      trace(draw.slice(start, step + 1), `${colorFor(draw[step][0])}60`, 1);
    }
    trace(data.truth.slice(start, step + 1), "#ffffff", 2);

    const points = run.draws
      .map((path) => ({ value: path[step], screen: project(path[step]) }))
      .sort((a, b) => a.screen[2] - b.screen[2]);
    for (const {
      value,
      screen: [x, y],
    } of points) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = colorFor(value[0]);
      ctx.fill();
    }
    const truth = data.truth[step];
    const [tx, ty] = project(truth);
    ctx.beginPath();
    ctx.moveTo(tx, ty - 6);
    ctx.lineTo(tx + 6, ty);
    ctx.lineTo(tx, ty + 6);
    ctx.lineTo(tx - 6, ty);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    const [mx, my] = project(mean);
    ctx.beginPath();
    ctx.moveTo(mx - 5, my);
    ctx.lineTo(mx + 5, my);
    ctx.moveTo(mx, my - 5);
    ctx.lineTo(mx, my + 5);
    ctx.strokeStyle = "#ffda75";
    ctx.lineWidth = 2;
    ctx.stroke();

    const [negative, zero, positive] = countSides(run.draws, step);
    panel.counts.textContent = `h${step + 1} · x<0  ${negative}/32 · x>0  ${positive}/32 · x=0  ${zero}/32`;
    panel.truth.textContent = `真值 x=${truth[0].toFixed(3)}（${sideLabel(truth[0])}） · 解析中心 x=${mean[0].toFixed(3)}（${sideLabel(mean[0])}）`;
  }

  function render(index) {
    step = index;
    const model = data.models[modelField.selectedIndex];
    panels.forEach((panel, i) =>
      drawPanel(panel, saved.models[model.id][i], model.runs[i].mean[step]),
    );
  }

  function rotate(delta) {
    yaw += delta;
    render(step);
  }
  for (const { canvas } of panels) {
    canvas.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerId !== drag?.id) return;
      yaw += (event.clientX - drag.x) * 0.012;
      pitch = Math.max(
        -1.35,
        Math.min(1.35, pitch + (event.clientY - drag.y) * 0.012),
      );
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      render(step);
    });
    canvas.addEventListener("lostpointercapture", () => {
      drag = undefined;
    });
  }
  const resize = new ResizeObserver(() => render(step));
  for (const { canvas } of panels) resize.observe(canvas);
  modelField.addEventListener("change", () => render(step));
  field("sample-left").addEventListener("click", () => rotate(-0.25));
  field("sample-right").addEventListener("click", () => rotate(0.25));
  field("sample-reset").addEventListener("click", () => {
    yaw = initialYaw;
    pitch = initialPitch;
    render(step);
  });
  field("sample-controls").disabled = false;
  field("sample-status").textContent =
    "测试键 (0,1608) · 八组各 32 条保存样本 · 两视角共享相机与尺度";
  return { render };
}
