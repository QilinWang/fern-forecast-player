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

const tabs = [...document.querySelectorAll('[role="tab"]')];
function showTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    field(item.getAttribute("aria-controls")).hidden = !selected;
  }
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => showTab(tab));
  tab.addEventListener("keydown", (event) => {
    const target =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    showTab(tabs[target]);
    tabs[target].focus();
  });
}

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
  const focusRun = field("focus-run");
  for (const card of cards) {
    focusRun.add(
      new Option(
        `${data.models[card.model].label} · seed ${data.seeds[card.seed]}`,
      ),
    );
  }
  field("focus-readouts").innerHTML = [
    ["truth", "当前真值"],
    ["center", "预测中心"],
    ["error", "中心绝对误差"],
    ["width", "模型 90% 带宽"],
    ["lo", "区间下端点"],
    ["hi", "区间上端点"],
    ["coverage", "当前坐标覆盖"],
    ["side", "中心 x 与真值 x"],
  ]
    .map(
      ([name, label]) =>
        `<div><dt>${label}</dt><dd data-field="${name}"></dd></div>`,
    )
    .join("");
  const focus = {
    ...cards[0],
    plot: field("focus-plot"),
    readouts: Object.fromEntries(
      [...field("focus-readouts").querySelectorAll("[data-field]")].map(
        (element) => [element.dataset.field, element],
      ),
    ),
  };
  const allCards = () => [...cards, focus];
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
  let pendingSampleModel;
  const chooseAxis = () => axis.selectedIndex;
  function applyLayers() {
    for (const name of ["truth", "center", "band"]) {
      for (const element of focus.plot.querySelectorAll(
        `[data-layer="${name}"]`,
      )) {
        element.style.display = field(`show-${name}`).checked ? "" : "none";
      }
    }
  }
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
    for (const card of allCards()) {
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
        <polygon data-layer="band" points="${band}" fill="${color}" opacity=".23"/>
        <polyline data-layer="truth" points="${path(values.map((v) => v.truth)).join(" ")}" fill="none" stroke="#f1f6f5" stroke-width="1.4"/>
        <polyline data-layer="center" points="${path(values.map((v) => v.center)).join(" ")}" fill="none" stroke="${color}" stroke-width="1.55" stroke-dasharray="4 2"/>
        <line data-mark="cursor" y1="${top}" y2="${bottom}" stroke="#ffb971" stroke-width="1.3"/>
        <circle data-layer="center" data-mark="center" r="2.6" fill="${color}"/>
        <circle data-layer="truth" data-mark="truth" r="3.8" fill="#091b23" stroke-width="1.7"/>
        <text x="${left}" y="106" fill="#aac0c5" font-size="9">1</text>
        <text x="${right}" y="106" text-anchor="end" fill="#aac0c5" font-size="9">192</text>`;
      card.marks = Object.fromEntries(
        [...card.plot.querySelectorAll("[data-mark]")].map((e) => [
          e.dataset.mark,
          e,
        ]),
      );
    }
    focus.plot.style.setProperty("--series", colors[focus.seed]);
    field("focus-caption").textContent =
      `横轴：预测步 1–192；纵轴：${axis.value} 原始单位。与下面八张图共用尺度。金色竖线是播放位置。`;
    applyLayers();
  }

  function render() {
    const step = Number(cursor.value) - 1;
    const coordinate = chooseAxis();
    field("cursor").textContent = `${step + 1} / ${horizon}`;
    field("current-truth").textContent =
      `h${step + 1} · 真值 ${axis.value} = ${format(data.truth[step][coordinate])} · 原始单位`;
    for (const card of allCards()) {
      const frame = card.series[step];
      const values = frame.axes[coordinate];
      const { readouts, marks } = card;
      for (const [name, value] of Object.entries({
        center: values.center,
        error: values.error,
        width: values.width,
        xyz: frame.error,
        truth: values.truth,
        lo: values.lo,
        hi: values.hi,
      })) {
        if (readouts[name])
          readouts[name].textContent =
            name === "lo" || name === "hi"
              ? value.toPrecision(8)
              : format(value);
      }
      if (readouts.step) readouts.step.textContent = `h${step + 1}`;
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
      card.plot.setAttribute(
        "aria-label",
        `${data.models[card.model].label}，seed ${data.seeds[card.seed]}，${axis.value} 的完整 192 步真值与预测；当前 h${step + 1}，真值${values.covered ? "在带内" : "在带外"}`,
      );
    }
    field("focus-note").textContent =
      `h${step + 1} · ${data.models[focus.model].label} · seed ${data.seeds[focus.seed]}。${focus.model === 0 ? "Huber 尺度头未拟合：细带不能解释为校准好的置信度，端点和带宽以数字为准。" : "带内 / 带外只描述此步、此坐标；覆盖与带宽需要一起看。"}`;
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
  function chooseFocus(index) {
    focusRun.selectedIndex = index;
    const { model, seed, series } = cards[index];
    Object.assign(focus, { model, seed, series });
    field("guide").style.setProperty("--series", colors[seed]);
    drawPlots();
    render();
  }
  focusRun.addEventListener("change", () =>
    chooseFocus(focusRun.selectedIndex),
  );
  for (const name of ["truth", "center", "band"]) {
    field(`show-${name}`).addEventListener("change", applyLayers);
  }
  for (const button of document.querySelectorAll("[data-guide-step]")) {
    button.addEventListener("click", () => {
      stop();
      axis.selectedIndex = 0;
      replayAnchor = Number(button.dataset.guideStep);
      eventSelect.selectedIndex = -1;
      const model = Number(button.dataset.guideModel);
      const seed = Number(button.dataset.guideSeed);
      pendingSampleModel = data.models[model].id;
      if (samples) {
        field("sample-model").value = pendingSampleModel;
        field("sample-model").dispatchEvent(new Event("change"));
      }
      for (const name of ["truth", "center", "band"])
        field(`show-${name}`).checked = true;
      field("event-detail").textContent =
        `导览示例 · ${data.models[model].label} · seed ${data.seeds[seed]} · h${replayAnchor}；下方三维面板保留两个 seed`;
      chooseFocus(model * data.seeds.length + seed);
      seek(replayAnchor);
      showTab(field("tab-cases"));
    });
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
  focusRun.disabled = false;
  field("guide-examples").disabled = false;
  field("status").textContent =
    `同窗 192 步 · 4 种训练 × 2 个 seed · ${splits.length} 个跨 seed 分侧片段 · ${errors.length} 个三维误差峰值`;
  loadSampleView(data)
    .then((view) => {
      samples = view;
      if (pendingSampleModel) {
        field("sample-model").value = pendingSampleModel;
        field("sample-model").dispatchEvent(new Event("change"));
      }
      samples.render(Number(cursor.value) - 1);
      field("guide-samples-state").textContent =
        "32 条样本已就绪；导览示例会同步下方三维面板的训练设置，两个 seed 都保留。";
    })
    .catch((error) => {
      field("sample-status").textContent = `无法读取样本：${error.message}`;
      field("guide-samples-state").textContent =
        "三维样本未能加载，示例仍可操作解析中心、区间和共享游标；刷新后可重试样本。";
    });
} catch (error) {
  field("status").textContent = `无法读取公开预测：${error.message}`;
  field("guide-samples-state").textContent =
    "预测数据未能加载，示例与播放器暂不可用；导览说明仍可切换，刷新后可重试。";
}
