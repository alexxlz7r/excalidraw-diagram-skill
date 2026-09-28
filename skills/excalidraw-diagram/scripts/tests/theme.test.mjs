import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildFlow } from "../flow.mjs";
import { checkTheme, DEFAULT_THEME, HUES, loadTheme, resolveTheme, ThemeError } from "../theme.mjs";
import { buildTypeMap } from "../type_map.mjs";

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);

// A brand blue: a teal hue in five shades, from the palest to the strongest.
const BRAND_BLUE = ["#e6f7f5", "#b3e6df", "#5cc4b6", "#1a9e8c", "#0f6b5f"];

const flow = {
  nodes: [
    { id: "start", kind: "start" },
    { id: "check", label: "Check" },
    { id: "ok", kind: "decision", label: "ok?" },
    { id: "done", kind: "end" },
  ],
  edges: [
    { from: "start", to: "check" },
    { from: "check", to: "ok" },
    { from: "ok", to: "done", label: "yes" },
    { from: "ok", to: "check", label: "no" },
  ],
};

const colorsOf = (scene) => new Set(scene.elements.flatMap((element) => [element.strokeColor, element.backgroundColor]));

test("the default theme is the Excalidraw color picker palette", () => {
  assert.equal(DEFAULT_THEME.black, "#1e1e1e");
  assert.equal(DEFAULT_THEME.white, "#ffffff");
  assert.deepEqual(Object.keys(DEFAULT_THEME.hues), HUES);
  assert.deepEqual(DEFAULT_THEME.hues.green, ["#ebfbee", "#b2f2bb", "#69db7c", "#40c057", "#2f9e44"]);
});

test("the default theme passes the text contrast check", () => {
  const { errors, warnings, minimumTextContrast } = checkTheme(DEFAULT_THEME);
  assert.deepEqual(errors, []);
  assert.ok(minimumTextContrast >= 4.5);
  assert.deepEqual(warnings.map((warning) => warning.split(" ")[0]), ["hues.yellow[5]"], "only the yellow stroke is faint");
});

test("a theme file replaces whole hues and keeps the others", () => {
  const theme = resolveTheme({ background: "#fafafa", hues: { blue: BRAND_BLUE, brand: BRAND_BLUE } });
  assert.equal(theme.background, "#fafafa");
  assert.equal(theme.black, DEFAULT_THEME.black);
  assert.deepEqual(theme.hues.blue, BRAND_BLUE);
  assert.deepEqual(theme.hues.brand, BRAND_BLUE);
  assert.deepEqual(theme.hues.red, DEFAULT_THEME.hues.red);
});

test("a theme is rejected for unknown fields, malformed hues, and low text contrast", () => {
  assert.throws(() => resolveTheme({ canvas: { background: "#ffffff" } }), /unknown theme fields: canvas/);
  assert.throws(() => resolveTheme({ hues: { blue: BRAND_BLUE.slice(1) } }), /hues\.blue must be 5 six-digit hex colors/);
  assert.throws(() => resolveTheme({ hues: { blue: [...BRAND_BLUE.slice(0, 2), "#0f6b5f", ...BRAND_BLUE.slice(3)] } }),
    (error) => error instanceof ThemeError && /black on hues\.blue\[3\] is .*:1/.test(error.message));
  assert.throws(() => resolveTheme({ exportBackground: "no" }), /exportBackground must be true or false/);
});

test("the generators take their colors from the theme", async () => {
  const theme = resolveTheme({ black: "#101820", hues: { blue: BRAND_BLUE } });
  const scene = await buildFlow(flow, { theme });
  const check = scene.elements.find((element) => element.id === "check");
  assert.deepEqual([check.backgroundColor, check.strokeColor], [BRAND_BLUE[0], BRAND_BLUE[4]], "a step takes the theme blue");
  const colors = colorsOf(scene);
  assert.ok(!colors.has(DEFAULT_THEME.hues.blue[0]) && !colors.has(DEFAULT_THEME.black), "no default blue or black is left");
  assert.equal(scene.elements.find((element) => element.id === "e1").strokeColor, "#101820", "ink is the theme black");

  const sketch = await buildFlow({ ...flow, style: "sketch" }, { theme });
  assert.ok(!colorsOf(sketch).has(BRAND_BLUE[0]), "sketch keeps no hue");
});

test("a spec can use a hue that only the theme defines", async () => {
  const theme = resolveTheme({ hues: { brand: BRAND_BLUE } });
  const scene = await buildTypeMap({ types: [{ id: "Order", tone: "brand" }] }, { theme });
  assert.equal(scene.elements.find((element) => element.id === "Order-header").backgroundColor, BRAND_BLUE[1]);
  await assert.rejects(buildTypeMap({ types: [{ id: "Order", tone: "brand" }] }), /Unknown tone "brand"/);
});

test("the style holds no colors", async () => {
  await assert.rejects(buildFlow({ ...flow, style: { preset: "clean", ink: "#000000" } }), /style\.ink is a theme color: set "black"/);
  await assert.rejects(buildFlow({ ...flow, style: { background: "#000000" } }), /style\.background is a theme color/);
});

test("a generator reads the theme file given with --theme", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "theme-test-"));
  const [spec, themeFile, scene] = ["spec.json", "theme.json", "scene.excalidraw"].map((name) => path.join(folder, name));
  await writeFile(spec, JSON.stringify(flow));
  await writeFile(themeFile, JSON.stringify({ background: "#fafafa", exportBackground: false, hues: { blue: BRAND_BLUE } }));
  await run("node", [path.join(SCRIPTS, "flow.mjs"), spec, "--theme", themeFile, "-o", scene]);
  const document = JSON.parse(await readFile(scene, "utf8"));
  assert.deepEqual(document.appState.viewBackgroundColor, "#fafafa");
  assert.equal(document.appState.exportBackground, false);
  assert.ok(colorsOf(document).has(BRAND_BLUE[0]));
  assert.deepEqual(await loadTheme(themeFile), resolveTheme(JSON.parse(await readFile(themeFile, "utf8"))));

  await writeFile(themeFile, JSON.stringify({ hues: { blue: ["#000000"] } }));
  await assert.rejects(run("node", [path.join(SCRIPTS, "flow.mjs"), spec, "--theme", themeFile, "-o", scene]),
    (error) => /ERROR: invalid theme: hues\.blue/.test(error.stderr));
});

test("the theme command prints the resolved theme", async () => {
  const { stdout, stderr } = await run("node", [path.join(SCRIPTS, "theme.mjs")]);
  assert.deepEqual(JSON.parse(stdout), DEFAULT_THEME);
  assert.match(stderr, /Minimum text contrast: \d+\.\d\d:1/);
});
