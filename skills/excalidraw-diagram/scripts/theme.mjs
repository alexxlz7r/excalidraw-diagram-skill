#!/usr/bin/env node
/** Diagram theme: the colors that the generators and hand-built scenes share. */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_PATH = fileURLToPath(import.meta.url);
export const DEFAULT_THEME_PATH = path.resolve(path.dirname(MODULE_PATH), "../references/default-theme.json");

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const COLOR_FIELDS = ["black", "white", "background"];
const FIELDS = new Set([...COLOR_FIELDS, "exportBackground", "hues"]);

// The generators name these hues in their defaults, so every theme keeps them.
// A theme can change their shades and add other hues.
export const HUES = ["gray", "red", "pink", "grape", "violet", "blue", "cyan", "teal", "green", "yellow", "orange", "bronze"];
export const LEVELS = 5;

// Text is always `black`. It sits on the background, on `white` plates, and on
// fills of levels 1 to 3.
const TEXT_LEVELS = [1, 2, 3];
const STROKE_LEVEL = 5;
const TEXT_CONTRAST = 4.5;
const STROKE_CONTRAST = 3;

export class ThemeError extends Error {}

function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color) {
  if (!HEX_COLOR.test(color)) throw new ThemeError(`Invalid color: ${color}`);
  const channels = color
    .slice(1)
    .match(/../g)
    .map((value) => channelToLinear(Number.parseInt(value, 16)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// Put a partial theme over `base`. A hue in `overrides` replaces the hue of
// `base`; the other hues stay.
export function mergeTheme(overrides, base) {
  if (!isObject(overrides)) throw new ThemeError("a theme must be a JSON object");
  const unknown = Object.keys(overrides).filter((key) => !FIELDS.has(key));
  if (unknown.length > 0) {
    throw new ThemeError(`unknown theme fields: ${unknown.join(", ")}; a theme has ${[...FIELDS].join(", ")}`);
  }
  if (overrides.hues !== undefined && !isObject(overrides.hues)) throw new ThemeError("hues must be an object");
  return { ...base, ...overrides, hues: { ...base.hues, ...overrides.hues } };
}

// Check a complete theme. An error makes the theme unusable: a missing hue, a
// malformed color, or text below 4.5:1. A warning is a stroke below 3:1 on
// the background: the boundary is faint, but the text stays readable.
export function checkTheme(theme) {
  const errors = [];
  const warnings = [];
  for (const field of COLOR_FIELDS) {
    if (typeof theme[field] !== "string" || !HEX_COLOR.test(theme[field])) {
      errors.push(`${field} must be a six-digit hex color`);
    }
  }
  if (typeof theme.exportBackground !== "boolean") errors.push("exportBackground must be true or false");
  for (const name of HUES) {
    if (!Object.hasOwn(theme.hues, name)) errors.push(`hues.${name} is required`);
  }
  for (const [name, shades] of Object.entries(theme.hues)) {
    if (!Array.isArray(shades) || shades.length !== LEVELS || !shades.every((color) => HEX_COLOR.test(color))) {
      errors.push(`hues.${name} must be ${LEVELS} six-digit hex colors, from the palest to the strongest`);
    }
  }
  if (errors.length > 0) return { errors, warnings, minimumTextContrast: null };

  const textPairs = [["background", theme.background], ["white", theme.white]];
  for (const [name, shades] of Object.entries(theme.hues)) {
    for (const level of TEXT_LEVELS) textPairs.push([`hues.${name}[${level}]`, shades[level - 1]]);
  }
  let minimumTextContrast = Infinity;
  for (const [name, color] of textPairs) {
    const ratio = contrastRatio(theme.black, color);
    minimumTextContrast = Math.min(minimumTextContrast, ratio);
    if (ratio < TEXT_CONTRAST) {
      errors.push(`black on ${name} is ${ratio.toFixed(2)}:1; text needs at least ${TEXT_CONTRAST}:1`);
    }
  }
  for (const [name, shades] of Object.entries(theme.hues)) {
    const ratio = contrastRatio(shades[STROKE_LEVEL - 1], theme.background);
    if (ratio < STROKE_CONTRAST) {
      warnings.push(`hues.${name}[${STROKE_LEVEL}] on background is ${ratio.toFixed(2)}:1; a stroke reads best at ${STROKE_CONTRAST}:1`);
    }
  }
  return { errors, warnings, minimumTextContrast };
}

// Put `overrides` over the default theme and check the result.
export function resolveTheme(overrides = {}) {
  const theme = mergeTheme(overrides, DEFAULT_THEME);
  const { errors } = checkTheme(theme);
  if (errors.length > 0) throw new ThemeError(`invalid theme: ${errors.join("; ")}`);
  return theme;
}

// Read a theme file and resolve it. Without a file, return the default theme.
export async function loadTheme(file) {
  if (file === null || file === undefined) return DEFAULT_THEME;
  let overrides;
  try {
    overrides = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ThemeError(`Invalid JSON in ${file}: ${error.message}`);
    throw error;
  }
  return resolveTheme(overrides);
}

export const DEFAULT_THEME = JSON.parse(readFileSync(DEFAULT_THEME_PATH, "utf8"));

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || ["-h", "--help"].includes(args[0])) {
    console.log(`Usage: node scripts/theme.mjs [theme.json]

Puts the theme file over the default theme, checks the colors, and prints the
resolved theme. Without a file, prints the default theme.`);
    return;
  }
  try {
    const theme = await loadTheme(args[0]);
    const { warnings, minimumTextContrast } = checkTheme(theme);
    for (const warning of warnings) console.error(`WARNING: ${warning}`);
    console.error(`Minimum text contrast: ${minimumTextContrast.toFixed(2)}:1`);
    console.log(JSON.stringify(theme, null, 2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(MODULE_PATH)) await main();
