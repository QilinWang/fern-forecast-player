import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const { chromium } = await import(
  process.env.FERN_PLAYWRIGHT
    ? pathToFileURL(process.env.FERN_PLAYWRIGHT).href
    : "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-compositing",
    "--no-sandbox",
  ],
});
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".safetensors": "application/octet-stream",
};
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (!process.env.FERN_PREVIEW_URL)
      await page.route("https://fern-space.test/**", async (route) => {
        const url = new URL(route.request().url());
        const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const path = resolve(root, rel);
        if (!path.startsWith(root + "/")) throw new Error("Unexpected path");
        try {
          await route.fulfill({
            status: 200,
            contentType: types[extname(path)] || "application/octet-stream",
            body: await readFile(path),
          });
        } catch {
          await route.fulfill({ status: 404, body: "Not found" });
        }
      });
    await page.goto(
      process.env.FERN_PREVIEW_URL || "https://fern-space.test/",
      { waitUntil: "load" },
    );
    await page.waitForFunction(
      () => !document.querySelector("#play").disabled,
      null,
      { timeout: 30000 },
    );
    assert.match(await page.locator("h1").innerText(), /forecast/i);
    assert.equal(await page.locator("#status").innerText(), "");
    assert.match(await page.locator("#step").innerText(), /1 of 192/);
    assert.match(await page.locator("#play").innerText(), /Play/);
    assert.match(await page.locator("#error").innerText(), /^\d/);
    assert.equal(await page.locator("#window").inputValue(), "1");
    assert.equal(await page.locator("#error").innerText(), "1.28");
    await page.locator("#peak").click();
    assert.equal(await page.locator("#step").innerText(), "34 of 192");
    assert.equal(await page.locator("#error").innerText(), "19.33");
    await page.locator("#previous").click();
    assert.equal(await page.locator("#step").innerText(), "33 of 192");
    await page.locator("#next").click();
    assert.equal(await page.locator("#step").innerText(), "34 of 192");
    await page.locator("#full-paths").check();
    assert.equal(await page.locator("#step").innerText(), "34 of 192");
    await page.locator("#full-paths").uncheck();
    await page.locator("#restart").click();
    assert.equal(await page.locator("#step").innerText(), "1 of 192");
    await page.locator("#speed").selectOption("2");
    await page.locator("#slider").fill("190");
    await page.locator("#play").click();
    await page.waitForFunction(() =>
      document.querySelector("#play").innerText.includes("Play"),
    );
    assert.equal(await page.locator("#step").innerText(), "192 of 192");
    assert.equal(await page.locator("#error").innerText(), "3.85");
    await page.locator("#speed").selectOption("1");
    const canvas = await page.locator("canvas").boundingBox();
    assert.ok(
      canvas.width > 250 && canvas.height > 300,
      JSON.stringify(canvas),
    );
    for (const value of ["1", "2", "0", "1"]) {
      await page.locator("#window").selectOption(value);
      assert.match(await page.locator("#step").innerText(), /1 of 192/);
    }
    await page.locator("#slider").fill("60");
    assert.match(await page.locator("#step").innerText(), /61 of 192/);
    assert.match(await page.locator("#play").innerText(), /Play/);
    await page.locator("#play").click();
    assert.match(await page.locator("#play").innerText(), /Pause/);
    await page.locator("#slider").focus();
    await page.waitForFunction(
      () => Number(document.querySelector("#slider").value) > 60,
      null,
      { timeout: 30000 },
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(
      () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    // Allow the browser to dispatch the first MediaQueryList change before reversing it.
    await page.waitForTimeout(250);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() =>
      document.querySelector("#play").innerText.includes("Play"),
    );
    const pausedStep = await page.locator("#slider").inputValue();
    await page.waitForTimeout(500);
    assert.equal(
      await page.locator("#slider").inputValue(),
      pausedStep,
      "reduced motion must pause playback",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "horizontal overflow",
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `/tmp/fern-hf-space-${name}.png`,
      fullPage: true,
    });
    console.log(
      `${name}: loaded; 4 window switches, scrub, play/pause, canvas and layout passed`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
