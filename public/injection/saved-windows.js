const field = (id) => document.getElementById(id);
const modelSelect = field("score-model");
const metricSelect = field("score-metric");
const cursor = field("score-window");
const locate = field("score-peak");
const replay = field("score-replay");
const colors = ["#ffac71", "#8af0d0", "#a6b9ff"];
let timer;

try {
  const response = await fetch("./window-scores.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const size = data.evaluation.windows;
  cursor.max = String(size);
  const truthVariance = data.dose ** 2;
  const limits = Object.fromEntries(
    Array.from(metricSelect.options, ({ value }) => [
      value,
      Math.max(...data.models.map((model) => Math.max(...model.values[value]))),
    ]),
  );
  for (const model of data.models)
    modelSelect.add(new Option(model.label, model.id));
  const maximum = () => {
    const values =
      data.models[modelSelect.selectedIndex].values[metricSelect.value];
    return values.indexOf(Math.max(...values));
  };
  function stop() {
    clearInterval(timer);
    timer = undefined;
    replay.textContent = "播放峰值前后 8 窗";
  }
  function render() {
    const index = Number(cursor.value) - 1;
    const peak = maximum();
    field("score-ordinal").textContent =
      `${index + 1} / ${size} · 测试键 (0, ${index})`;
    field("score-peak-ordinal").textContent = `所选峰值：保存序号 ${peak + 1}`;
    const start = Math.max(0, index - 8);
    const end = Math.min(size - 1, index + 8);
    const values = data.models.map((model) =>
      model.values[metricSelect.value].slice(start, end + 1),
    );
    const max = limits[metricSelect.value];
    const x = (i) => 28 + (674 * (i - start)) / (end - start);
    const y = (value) => 131 - (112 * value) / max;
    const lines = values
      .map(
        (series, m) =>
          `<polyline fill="none" stroke="${colors[m]}" stroke-width="2.5" points="${series.map((v, i) => `${x(i + start)},${y(v)}`).join(" ")}"/>`,
      )
      .join("");
    field("score-trace").innerHTML =
      `<line x1="28" x2="702" y1="131" y2="131" stroke="#49626a"/>${lines}<line x1="${x(index)}" x2="${x(index)}" y1="10" y2="132" stroke="#fff" stroke-opacity=".55"/><text x="28" y="14" fill="#a9c1c5" font-size="13">${max.toFixed(2)} nats</text><text x="28" y="151" fill="#a9c1c5" font-size="14">${start + 1}</text><text x="702" y="151" text-anchor="end" fill="#a9c1c5" font-size="14">${end + 1}</text>`;
    const rows = data.models.map((model, m) => {
      const { values: v } = model;
      const tr = document.createElement("tr");
      for (const [column, value] of [
        model.label,
        v.forward_kl[index].toFixed(3),
        v.mean_kl[index].toFixed(3),
        v.covariance_kl[index].toFixed(3),
        `${(v.model_covariance_trace_over_horizon[index] / truthVariance).toFixed(3)}×`,
        v.clean_mse[index].toFixed(4),
      ].entries()) {
        const cell = document.createElement(column ? "td" : "th");
        cell.textContent = value;
        if (!column) {
          cell.scope = "row";
          cell.style.color = colors[m];
        }
        tr.append(cell);
      }
      return tr;
    });
    field("score-table").replaceChildren(...rows);
    cursor.dispatchEvent(new Event("window-rendered"));
  }
  function seek(i) {
    cursor.value = String(i + 1);
    render();
  }
  const jump = () => {
    stop();
    seek(maximum());
  };
  for (const select of [modelSelect, metricSelect])
    select.addEventListener("change", jump);
  locate.addEventListener("click", jump);
  cursor.addEventListener("input", () => {
    stop();
    render();
  });
  replay.addEventListener("click", () => {
    if (timer !== undefined) {
      stop();
      return;
    }
    const peak = maximum();
    const end = Math.min(size - 1, peak + 8);
    let index = Math.max(0, peak - 8);
    seek(index);
    replay.textContent = "暂停窗口回放";
    timer = setInterval(() => {
      seek(++index);
      if (index === end) stop();
    }, 170);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  field("score-provenance").textContent = data.models
    .map((m) => `${m.label} · ${m.result} · SHA-256 ${m.sha256}`)
    .join("\n");
  field("score-controls").disabled = false;
  field("score-state").textContent =
    "3 份记录 · 3,217 个测试窗口 · 相同评估身份 · seed 86467";
  jump();
} catch (error) {
  field("score-state").textContent = `无法读取逐窗记录：${error.message}`;
}
