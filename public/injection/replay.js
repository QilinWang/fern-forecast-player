const field = (id) => document.getElementById(id);
const cursor = field("score-window");
const pairSelect = field("replay-pair");
const buttons = [...document.querySelectorAll(".replay-key")];
const radius = Math.sqrt(-2 * Math.log(0.1));
const degrees = 180 / Math.PI;

function ellipse([a, b, c]) {
  const gap = Math.hypot(a - c, 2 * b);
  return {
    major: (a + c + gap) / 2,
    minor: (a + c - gap) / 2,
    angle: Math.atan2(2 * b, a - c) / 2,
  };
}

function project([x, y], [[a, b], [c, d]]) {
  return [a * x + b * y, c * x + d * y];
}

function projectCovariance([a, b, c], [u, v]) {
  const bilinear = (x, y) =>
    x[0] * (a * y[0] + b * y[1]) + x[1] * (b * y[0] + c * y[1]);
  return [bilinear(u, u), bilinear(u, v), bilinear(v, v)];
}

function inside([x, y], [mx, my], [a, b, c]) {
  const dx = x - mx;
  const dy = y - my;
  return (
    (c * dx ** 2 - 2 * b * dx * dy + a * dy ** 2) / (a * c - b ** 2) <=
    radius ** 2
  );
}

function outline(center, covariance, color, scale) {
  const [x, y] = center.map((v) => v * scale);
  const { major, minor, angle } = ellipse(covariance);
  return `<ellipse cx="${x}" cy="${-y}" rx="${radius * Math.sqrt(major) * scale}" ry="${radius * Math.sqrt(minor) * scale}" transform="rotate(${-angle * degrees} ${x} ${-y})" fill="none" stroke="${color}" stroke-width="1.6"/>`;
}

function plot(
  { target, mean, samples, covariance },
  oracle,
  extent,
  axes,
  covered,
) {
  const scale = 113 / extent;
  const [tx, ty] = target.map((v) => v * scale);
  const [mx, my] = mean.map((v) => v * scale);
  return `<svg viewBox="-128 -130 256 260" role="img" aria-label="${axes.join(" / ")}，带噪真值、Fern 样本、真值与模型的二维边际">
    <path d="M-113 0H113 M0 -113V113" stroke="#49626a" fill="none"/>
    ${outline([0, 0], oracle, "#8af0d0", scale)}
    ${outline(mean, covariance, "#a6b9ff", scale)}
    ${samples.map(([x, y]) => `<circle cx="${x * scale}" cy="${-y * scale}" r="2.3" fill="#a6b9ff" opacity=".7"/>`).join("")}
    <path d="M${mx - 4} ${-my}h8 M${mx} ${-my - 4}v8" stroke="#fff" stroke-width="1.4"/>
    <rect x="${tx - 3.4}" y="${-ty - 3.4}" width="6.8" height="6.8" fill="${covered ? "#ffd776" : "#ff7281"}" transform="rotate(45 ${tx} ${-ty})"/>
    <text x="110" y="15" text-anchor="end" fill="#a9c1c5" font-size="11">${axes[0]}</text>
    <text x="7" y="-108" fill="#a9c1c5" font-size="11">${axes[1]}</text>
    <text x="-110" y="124" fill="#a9c1c5" font-size="11">每轴 ±${extent.toFixed(2)}</text>
  </svg>`;
}

function extent(models, oracle) {
  return (
    1.1 *
    Math.max(
      radius * Math.sqrt(ellipse(oracle).major),
      ...models.map(({ mean, covariance, samples, target }) =>
        Math.max(
          Math.max(...mean.map(Math.abs)) +
            radius * Math.sqrt(ellipse(covariance).major),
          ...target.map(Math.abs),
          ...samples.flat().map(Math.abs),
        ),
      ),
    )
  );
}

try {
  const response = await fetch("./replay-data.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.schema !== "fern.lab.gaussian-replay.v1")
    throw new Error("数据版本不匹配");
  for (const pair of data.pairs)
    pairSelect.add(new Option(pair.steps.join(" / ")));
  pairSelect.disabled = false;
  const rows = field("replay-panels");
  function render() {
    const ordinal = Number(cursor.value);
    const window = data.windows.find((item) => item.ordinal === ordinal);
    for (const button of buttons) {
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.ordinal) === ordinal),
      );
    }
    rows.replaceChildren();
    if (!window) {
      field("replay-state").textContent =
        `当前序号 ${ordinal}。重放样本只保留了 1441 和 1394，点击上方按钮查看。`;
      return;
    }
    const i = pairSelect.selectedIndex;
    const { steps, covariance: oracle } = data.pairs[i];
    const { major, minor, angle } = ellipse(oracle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const whitening = [
      [cos / Math.sqrt(major), sin / Math.sqrt(major)],
      [-sin / Math.sqrt(minor), cos / Math.sqrt(minor)],
    ];
    const whiten = (m) => ({
      target: project(m.target, whitening),
      mean: project(m.mean, whitening),
      samples: m.samples.map((sample) => project(sample, whitening)),
      covariance: projectCovariance(m.covariance, whitening),
    });
    const allModels = data.windows.flatMap(({ models }) =>
      models.map(({ marginals }) => marginals[i]),
    );
    const rawExtent = extent(allModels, oracle);
    const whiteExtent = extent(allModels.map(whiten), [1, 0, 1]);
    field("replay-state").textContent =
      `序号 ${ordinal} · 测试键 (0, ${ordinal - 1}) · seed 86467 · 两窗口及三个模型共享坐标范围 · 白化轴为真值主轴`;
    for (const { label, marginals } of window.models) {
      const raw = marginals[i];
      const white = whiten(raw);
      const covered = inside(raw.target, raw.mean, raw.covariance);
      const fitted = ellipse(raw.covariance);
      const offset = Math.hypot(...white.mean);
      const axisGap = Math.abs(
        (((fitted.angle - angle) * degrees + 270) % 180) - 90,
      );
      const [a, b, c] = raw.covariance;
      const article = document.createElement("article");
      article.style.marginBottom = "14px";
      const title = document.createElement("h3");
      title.textContent = label;
      article.append(title);
      article.insertAdjacentHTML(
        "beforeend",
        `
        <p>中心偏移 ${offset.toFixed(2)} 个白化单位 · 原始主轴差 ${axisGap.toFixed(1)}° · 相关 ${(b / Math.sqrt(a * c)).toFixed(3)} · 轴比 ${Math.sqrt(fitted.major / fitted.minor).toFixed(2)} · 带噪真值${covered ? "在模型椭圆内" : "在模型椭圆外"}</p>
        <div class="panels">
          <div><h4>原始残差</h4>${plot(
            raw,
            oracle,
            rawExtent,
            steps.map((h) => `h=${h}`),
            covered,
          )}</div>
          <div><h4>用真值白化</h4>${plot(white, [1, 0, 1], whiteExtent, ["z₁", "z₂"], covered)}</div>
        </div>`,
      );
      rows.append(article);
    }
  }
  for (const button of buttons) {
    button.addEventListener("click", () => {
      cursor.value = button.dataset.ordinal;
      cursor.dispatchEvent(new Event("input"));
    });
  }
  cursor.addEventListener("window-rendered", render);
  pairSelect.addEventListener("change", render);
  render();
} catch (error) {
  field("replay-state").textContent =
    `此预览暂无重放数据（${error.message}）。逐窗历史分数仍可查看。`;
}
