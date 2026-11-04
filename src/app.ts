import { loadExamples, startRealFern } from "./real-fern";

const canvas = document.querySelector<HTMLCanvasElement>("#forecast")!;
const windowSelect = document.querySelector<HTMLSelectElement>("#window")!;
const slider = document.querySelector<HTMLInputElement>("#slider")!;
const play = document.querySelector<HTMLButtonElement>("#play")!;
const speed = document.querySelector<HTMLSelectElement>("#speed")!;
const fullPaths = document.querySelector<HTMLInputElement>("#full-paths")!;
const status = document.querySelector<HTMLElement>("#status")!;
const readout = {
  step: document.querySelector<HTMLElement>("#step"),
  error: document.querySelector<HTMLElement>("#error"),
  spread: null,
  inside: null,
};

try {
  const examples = await loadExamples("./data/lorenz-nll-huber.safetensors");
  const setPlayLabel = (playing: boolean) => {
    play.textContent = playing ? play.dataset.pause! : play.dataset.play!;
  };
  const createPlayer = () => {
    const player = startRealFern(
      canvas,
      examples,
      Number(windowSelect.value),
      readout,
      slider,
      setPlayLabel,
    );
    player.setRate(Number(speed.value));
    player.setFullPaths(fullPaths.checked);
    setPlayLabel(false);
    return player;
  };
  let current = createPlayer();
  status.textContent = "";
  slider.disabled = false;
  play.disabled = false;
  windowSelect.addEventListener("change", () => {
    current.stop();
    current = createPlayer();
  });
  play.addEventListener("click", () => current.toggle());
  speed.addEventListener("change", () => current.setRate(Number(speed.value)));
  fullPaths.addEventListener("change", () =>
    current.setFullPaths(fullPaths.checked),
  );
  document
    .querySelector("#previous")!
    .addEventListener("click", () => current.stepBy(-1));
  document
    .querySelector("#next")!
    .addEventListener("click", () => current.stepBy(1));
  document
    .querySelector("#restart")!
    .addEventListener("click", () => current.seek(0));
  document
    .querySelector("#peak")!
    .addEventListener("click", () => current.seekPeakError());
} catch (error) {
  status.textContent = `Unable to load the forecast: ${error instanceof Error ? error.message : String(error)}`;
}
