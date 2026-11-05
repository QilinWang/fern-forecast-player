const dose = document.querySelector("#dose");
const pair = document.querySelector("#pair");
const radius = Math.sqrt(-2 * Math.log(0.1));
const svg = (rx, ry, theta, scale, xlabel, ylabel) => `
  <path d="M25 180H335 M180 25V335" stroke="#49626a" fill="none"/>
  <text x="330" y="200" text-anchor="end" fill="#a9c1c5" font-size="13">${xlabel}</text>
  <text x="190" y="27" fill="#a9c1c5" font-size="13">${ylabel}</text>
  <ellipse cx="180" cy="180" rx="${rx * scale}" ry="${ry * scale}" transform="rotate(${-theta} 180 180)" stroke="#8af0d0" stroke-width="2" fill="#439f95" fill-opacity=".27"/>
  <circle cx="180" cy="180" r="4" fill="#ffac71"/>
  <text x="25" y="351" fill="#a9c1c5" font-size="12">每轴范围 ±${(155 / scale).toFixed(2)}</text>`;

try {
  const response = await fetch("./oracle.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  const eigen = ([a, b, c]) => {
    const delta = Math.hypot(a - c, 2 * b);
    return [(a + c + delta) / 2, (a + c - delta) / 2];
  };
  const extent =
    1.1 *
    radius *
    Math.sqrt(
      Math.max(
        ...rows.flatMap((row) =>
          row.marginals.map((m) => eigen(m.covariance)[0]),
        ),
      ),
    );
  function render() {
    const row = rows[Number(dose.value)];
    const { steps, covariance } = row.marginals[Number(pair.value)];
    const [a, b, c] = covariance;
    const [major, minor] = eigen(covariance);
    const theta = (0.5 * Math.atan2(2 * b, a - c) * 180) / Math.PI;
    const rx = radius * Math.sqrt(major);
    const ry = radius * Math.sqrt(minor);
    document.querySelector("#raw").innerHTML = svg(
      rx,
      ry,
      theta,
      155 / extent,
      `h=${steps[0]}`,
      `h=${steps[1]}`,
    );
    document.querySelector("#white").innerHTML = svg(
      radius,
      radius,
      0,
      155 / 2.5,
      "z₁",
      "z₂",
    );
    document.querySelector("#readout").textContent =
      `90% 半轴 ${rx.toFixed(3)} / ${ry.toFixed(3)} raw units · 相关 ${(b / Math.sqrt(a * c)).toFixed(3)}`;
    document.querySelector("#status").textContent =
      `注射 RMS ${row.dose} · 预测步 ${steps.join(" / ")} · 边际协方差 [${a.toFixed(6)}, ${b.toFixed(6)}, ${c.toFixed(6)}]`;
    document.querySelector("#source").textContent =
      `${row.result} · SHA-256 ${row.resultSha256}`;
  }
  dose.addEventListener("change", render);
  pair.addEventListener("change", render);
  render();
} catch (error) {
  document.querySelector("#status").textContent =
    `无法读取注射记录：${error.message}`;
}
