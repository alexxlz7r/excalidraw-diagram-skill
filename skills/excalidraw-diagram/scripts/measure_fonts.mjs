#!/usr/bin/env node
/**
 * Measure the advance width of every character that layout.mjs knows, for each
 * font family that the export embeds. Writes font-metrics.json.
 *
 * Run it again after an Excalidraw upgrade: node scripts/measure_fonts.mjs
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(SCRIPT_DIR, "font-metrics.json");
// A large size keeps the rounding of the canvas below 0.001 em.
const SIZE = 1000;

// Helvetica (2) is left out: the export does not embed it, so its width
// depends on the machine that renders the SVG.
const FAMILIES = {
  1: "Virgil",
  3: "Cascadia",
  5: "Excalifont",
  6: "Nunito",
  7: "Lilita One",
  8: "Comic Shanns",
  9: "Liberation Sans",
};

// Basic Latin, Latin-1, Cyrillic, and the punctuation and arrows that labels use.
const RANGES = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x400, 0x45f],
  [0x2010, 0x2027],
  [0x2190, 0x2193],
];

const characters = RANGES.flatMap(([first, last]) =>
  Array.from({ length: last - first + 1 }, (_, index) => String.fromCodePoint(first + index)));

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(SCRIPT_DIR, "render_template.html")).href);
  await page.waitForFunction(() => window.__moduleReady === true, null, { timeout: 15_000 });
  const widths = await page.evaluate(async ([families, characters, size]) => {
    // The export embeds the font faces in the SVG; the SVG in the page registers them.
    const text = characters.join("");
    const elements = Object.keys(families).map((family, index) => ({
      id: `t${family}`, type: "text", x: 0, y: index * 40, width: 100, height: 25, angle: 0,
      strokeColor: "#000000", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1,
      strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null,
      seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null, updated: 1,
      link: null, locked: false, text, originalText: text, fontSize: 20, fontFamily: Number(family),
      textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25,
    }));
    const svg = await window.ExcalidrawLib.exportToSvg({ elements, appState: { exportBackground: false }, files: {} });
    document.getElementById("root").appendChild(svg);
    const faces = [...document.fonts].map((face) => face.family.replaceAll('"', ""));
    const context = document.createElement("canvas").getContext("2d");
    const result = {};
    for (const [family, name] of Object.entries(families)) {
      await document.fonts.load(`${size}px "${name}"`, text);
      if (!faces.includes(name)) throw new Error(`the export did not embed ${name}`);
      context.font = `${size}px "${name}"`;
      result[family] = characters.map((character) => Math.round((context.measureText(character).width / size) * 10000) / 10000);
    }
    return result;
  }, [FAMILIES, characters, SIZE]);

  const metrics = { characters: characters.join(""), families: {} };
  for (const [family, name] of Object.entries(FAMILIES)) {
    metrics.families[family] = { name, widths: widths[family] };
  }
  await writeFile(OUTPUT, `${JSON.stringify(metrics)}\n`);
  for (const [family, { name, widths: row }] of Object.entries(metrics.families)) {
    const mean = row.reduce((sum, width) => sum + width, 0) / row.length;
    console.log(`${family} ${name.padEnd(16)} mean ${mean.toFixed(3)} em`);
  }
  console.log(OUTPUT);
} finally {
  await browser.close();
}
