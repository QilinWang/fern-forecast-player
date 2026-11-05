const byId = (id) => document.getElementById(id);
const shape = byId("shape");
const route = byId("route");
const cov = byId("cov");

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function metric(title, values) {
  const group = element("div", "", "metric");
  group.append(element("strong", title));
  const maximum = Math.max(...values);
  values.forEach((value, index) => {
    const row = element("div", "", "axis");
    const rail = element("div", "", "rail");
    const fill = element("div", "", index ? "fill new" : "fill");
    fill.style.width = `${(value / maximum) * 100}%`;
    rail.append(fill);
    row.append(
      element("span", index ? "加模块" : "普通 Student"),
      rail,
      element("strong", value.toFixed(6)),
    );
    group.append(row);
  });
  return group;
}

try {
  const response = await fetch("./results.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  for (const name of [...new Set(data.pairs.map((pair) => pair.route))])
    route.add(new Option(name, name));
  route.value = "直接乘 G";
  const renderShape = () => {
    const pair = data.pairs.find(
      (row) => row.shape === shape.value && row.route === route.value,
    );
    const target = byId("shape-result");
    target.replaceChildren();
    if (!pair.n) {
      target.append(element("p", "没有两边均完成的 seed。"));
      return;
    }
    target.append(
      metric("Joint KL / H 估计（nats/坐标，越低越好）", pair.kl),
      metric("Clean MSE（raw Rössler x²，越低越好）", pair.mse),
      element(
        "p",
        `${pair.n} 个配对 seed · ${pair.klImproved}/${pair.n} 的 KL 下降。条长只在同一对内比较。`,
      ),
    );
  };
  const renderStudent = () => {
    const target = byId("nu-result");
    target.replaceChildren();
    for (const row of data.student.filter((row) => row.cov === cov.value)) {
      const card = element("div", "", "nurow");
      const track = element("div", "", "nuplot");
      const dot = element("i", "", "nuDot");
      dot.style.left = `${(row.nu / 18) * 100}%`;
      track.append(element("i", "", "truthline"), dot);
      card.append(
        element("strong", `${row.setting} · ν ${row.nu.toFixed(4)}`),
        track,
        element(
          "span",
          `Home ${row.study} · 选中 epoch ${row.selected}（从 0 计） · 共训练 ${row.epochs} epochs`,
        ),
      );
      target.append(card);
    }
  };
  byId("shape-source").textContent =
    data.shapeSource + " · 同一 seed 上，radial/angular 的改善是否成立";
  byId("student-source").textContent = data.studentSource + " · Table 1";
  shape.addEventListener("change", renderShape);
  route.addEventListener("change", renderShape);
  cov.addEventListener("change", renderStudent);
  renderShape();
  renderStudent();
} catch (error) {
  byId("shape-result").textContent = `无法加载实验结果：${error.message}`;
}
