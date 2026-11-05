import { describeForecast, horizon, locateEvents } from "./forecast.js";
import { loadSampleView } from "./sample-view.js";

const field = (id) => document.getElementById(id);
const cursor = field("step");
const axis = field("axis");
const play = field("play");
const eventSelect = field("events");
const colors = ["#8af0d0", "#b6bdff"];
const left = 31;
const right = 308;
const top = 8;
const bottom = 91;
const x = (step) => left + (step * (right - left)) / (horizon - 1);
const format = (v) =>
  v !== 0 && Math.abs(v) < 0.001 ? v.toExponential(2) : v.toFixed(3);
const vectors = (values, valid = Number.isFinite) =>
  Array.isArray(values) &&
  values.length === horizon &&
  values.every(
    (row) => Array.isArray(row) && row.length === 3 && row.every(valid),
  );

try {
  const response = await fetch("./data.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (
    data.schema !== "fern.lab.lorenz-seeds.v1" ||
    data.key?.join() !== "0,1608" ||
    data.seeds?.join() !== "1894620157,219590520" ||
    data.models?.map(({ id }) => id).join() !== "huber,mix,nll,clip" ||
    !vectors(data.truth) ||
    !data.models.every(
      ({ runs }) =>
        runs.length === 2 &&
        runs.every(
          ({ mean, std }) =>
            vectors(mean) && vectors(std, (v) => Number.isFinite(v) && v > 0),
        ),
    )
  ) {
    throw new Error("测试键、模型、seed 或预测数组不匹配");
  }
  const matrix = data.models.map(({ runs }) =>
    runs.map((run) => describeForecast(data.truth, run)),
  );
  const { splits, errors } = locateEvents(matrix);
  const events = [...splits, ...errors];
  const cards = [];
  for (const [model, { label }] of data.models.entries()) {
    const article = document.createElement("article");
    const title = document.createElement("h2");
    title.textContent = label;
    article.append(title);
    for (const [seedIndex, seed] of data.seeds.entries()) {
      const section = document.createElement("section");
      section.className = "run";
      section.dataset.model = data.models[model].id;
      section.dataset.seed = String(seed);
      section.innerHTML = `<header><h3>Seed ${seed}</h3><span class="muted" data-field="step"></span></header>
        <svg viewBox="0 0 320 112" role="img" aria-label="预测中心、真值和边际区间的 192 步轨迹"></svg>
        <dl>
          <div><dt>解析中心</dt><dd data-field="center"></dd></div>
          <div><dt>中心绝对误差</dt><dd data-field="error"></dd></div>
          <div><dt>90% 区间宽度</dt><dd data-field="width"></dd></div>
          <div><dt>真值覆盖</dt><dd data-field="coverage"></dd></div>
          <div><dt>三维中心误差</dt><dd data-field="xyz"></dd></div>
          <div><dt>x 与真值的位置</dt><dd data-field="side"></dd></div>
        </dl>`;
      article.append(section);
      cards.push({
        model,
        seed: seedIndex,
        series: matrix[model][seedIndex],
        plot: section.querySelector("svg"),
        readouts: Object.fromEntries(
          [...section.querySelectorAll("[data-field]")].map((e) => [
            e.dataset.field,
            e,
          ]),
        ),
      });
    }
    field("matrix").append(article);
  }
  for (const e of events) {
    const span =
      e.start === e.end ? `h${e.start + 1}` : `h${e.start + 1}–${e.end + 1}`;
    const name = data.models[e.model].label;
    const label =
      e.seed === undefined
        ? `分侧 · ${name} · ${span} · 峰 h${e.peak + 1}`
        : `三维误差 · ${name} · seed ${data.seeds[e.seed]} · ${span}`;
    eventSelect.add(new Option(label));
  }
  field("max-split").disabled = splits.length === 0;
  if (splits.length)
    field("max-split").textContent += ` · h${splits[0].peak + 1}`;
  field("max-error").textContent += ` · h${errors[0].peak + 1}`;

  let frame;
  let y;
  let samples;
  let replayAnchor;
  const chooseAxis = () => axis.selectedIndex;
  function drawPlots() {
    const c = chooseAxis();
    const bounds = cards.flatMap(({ series }) =>
      series.flatMap(({ axes }) => {
        const { lo, hi, truth } = axes[c];
        return [lo, hi, truth];
      }),
    );
    const lo = Math.min(0, ...bounds);
    const hi = Math.max(0, ...bounds);
    const padding = (hi - lo || 1) * 0.06;
    y = (value) =>
      bottom -
      ((value - lo + padding) * (bottom - top)) / (hi - lo + 2 * padding);
    const event = events[eventSelect.selectedIndex];
    const path = (values) =>
      values.map((v, k) => `${x(k).toFixed(2)},${y(v).toFixed(2)}`);
    const ticks = [...new Set([lo, 0, hi])]
      .map(
        (value) => `
      <path d="M${left} ${y(value)}H${right}" stroke="#3c5560"/>
      <text x="${left - 4}" y="${y(value) + 3}" text-anchor="end" fill="#aac0c5" font-size="9">${value.toFixed(1)}</text>`,
      )
      .join("");
    for (const card of cards) {
      const values = card.series.map(({ axes }) => axes[c]);
      const band = [
        ...path(values.map((v) => v.lo)),
        ...path(values.map((v) => v.hi)).reverse(),
      ].join(" ");
      const color = colors[card.seed];
      const highlight =
        event?.model === card.model &&
        (event.seed === undefined || event.seed === card.seed)
          ? `<rect x="${x(event.start) - 1}" y="${top}" width="${Math.max(2, x(event.end) - x(event.start) + 2)}" height="${bottom - top}" fill="#ffb971" opacity=".19"/>`
          : "";
      card.plot.innerHTML = `${ticks}${highlight}
        <polygon points="${band}" fill="${color}" opacity=".23"/>
        <polyline points="${path(values.map((v) => v.truth)).join(" ")}" fill="none" stroke="#f1f6f5" stroke-width="1.4"/>
        <polyline points="${path(values.map((v) => v.center)).join(" ")}" fill="none" stroke="${color}" stroke-width="1.55"/>
        <line data-mark="cursor" y1="${top}" y2="${bottom}" stroke="#ffb971" stroke-width="1.3"/>
        <circle data-mark="center" r="2.6" fill="${color}"/>
        <circle data-mark="truth" r="3.8" fill="#091b23" stroke-width="1.7"/>
        <text x="${left}" y="106" fill="#aac0c5" font-size="9">1</text>
        <text x="${right}" y="106" text-anchor="end" fill="#aac0c5" font-size="9">192</text>`;
      card.marks = Object.fromEntries(
        [...card.plot.querySelectorAll("[data-mark]")].map((e) => [
          e.dataset.mark,
          e,
        ]),
      );
    }
  }

  function render() {
    const step = Number(cursor.value) - 1;
    const coordinate = chooseAxis();
    field("cursor").textContent = `${step + 1} / ${horizon}`;
    field("current-truth").textContent =
      `h${step + 1} · 真值 ${axis.value} = ${format(data.truth[step][coordinate])} · 原始单位`;
    for (const card of cards) {
      const frame = card.series[step];
      const values = frame.axes[coordinate];
      const { readouts, marks } = card;
      for (const [name, value] of Object.entries({
        center: values.center,
        error: values.error,
        width: values.width,
        xyz: frame.error,
      })) {
        readouts[name].textContent = format(value);
      }
      readouts.step.textContent = `h${step + 1}`;
      readouts.coverage.textContent = values.covered ? "在带内" : "在带外";
      readouts.coverage.className = values.covered ? "hit" : "miss";
      const side =
        Math.sign(frame.axes[0].center) * Math.sign(frame.axes[0].truth);
      readouts.side.textContent =
        side > 0 ? "同侧" : side < 0 ? "异侧" : "在零点";
      marks.cursor.setAttribute("x1", x(step));
      marks.cursor.setAttribute("x2", x(step));
      marks.center.setAttribute("cx", x(step));
      marks.center.setAttribute("cy", y(values.center));
      marks.truth.setAttribute("cx", x(step));
      marks.truth.setAttribute("cy", y(values.truth));
      marks.truth.setAttribute(
        "stroke",
        values.covered ? "#8af0d0" : "#ffb971",
      );
    }
    samples?.render(step);
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = undefined;
    play.textContent = "▶ 播放";
  }
  function seek(step) {
    cursor.value = String(Math.max(1, Math.min(horizon, step)));
    render();
  }
  function start(first, last) {
    stop();
    seek(first);
    play.textContent = "❚❚ 暂停";
    let clock;
    function tick(now) {
      clock ??= now;
      const step = Math.min(last, first + Math.floor((now - clock) / 100));
      if (step !== Number(cursor.value)) seek(step);
      if (step === last) stop();
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  function select(index, showX = false) {
    stop();
    eventSelect.selectedIndex = index;
    if (showX) axis.selectedIndex = 0;
    const event = events[index];
    replayAnchor = event.peak + 1;
    const name = data.models[event.model].label;
    const detail =
      event.seed === undefined
        ? `${name} · x 异号 h${event.start + 1}–h${event.end + 1} · 两中心最大差 ${format(event.value)}，在 h${event.peak + 1}`
        : `${name} · seed ${data.seeds[event.seed]} · 三维中心峰值误差 ${format(event.value)}，在 h${event.peak + 1}`;
    field("event-detail").textContent = detail;
    drawPlots();
    seek(event.peak + 1);
  }
  axis.addEventListener("change", () => {
    drawPlots();
    render();
  });
  cursor.addEventListener("input", () => {
    stop();
    render();
  });
  field("previous").addEventListener("click", () => {
    stop();
    seek(Number(cursor.value) - 1);
  });
  field("next").addEventListener("click", () => {
    stop();
    seek(Number(cursor.value) + 1);
  });
  play.addEventListener("click", () => {
    if (frame !== undefined) stop();
    else
      start(
        Number(cursor.value) === horizon ? 1 : Number(cursor.value),
        horizon,
      );
  });
  field("max-split").addEventListener("click", () => select(0, true));
  field("max-error").addEventListener("click", () => select(splits.length));
  eventSelect.addEventListener("change", () =>
    select(eventSelect.selectedIndex),
  );
  field("replay").addEventListener("click", () => {
    start(Math.max(1, replayAnchor - 8), Math.min(horizon, replayAnchor + 8));
  });
  for (const button of document.querySelectorAll("[data-sample-step]")) {
    button.addEventListener("click", () => {
      stop();
      replayAnchor = Number(button.dataset.sampleStep);
      eventSelect.selectedIndex = -1;
      field("event-detail").textContent = `样本观察 · h${replayAnchor}`;
      drawPlots();
      seek(replayAnchor);
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  select(0);
  field("controls").disabled = false;
  field("status").textContent =
    `同窗 192 步 · 4 种训练 × 2 个 seed · ${splits.length} 个跨 seed 分侧片段 · ${errors.length} 个三维误差峰值`;
  loadSampleView(data)
    .then((view) => {
      samples = view;
      samples.render(Number(cursor.value) - 1);
    })
    .catch((error) => {
      field("sample-status").textContent = `无法读取样本：${error.message}`;
    });
} catch (error) {
  field("status").textContent = `无法读取公开预测：${error.message}`;
}
