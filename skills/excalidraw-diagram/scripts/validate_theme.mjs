#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_PATH = fileURLToPath(import.meta.url);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color) {
  if (!HEX_COLOR.test(color)) throw new Error(`Invalid color: ${color}`);
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

function get(theme, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], theme);
}

export function validateTheme(theme) {
  const errors = [];
  const requiredColors = [
    "canvas.background",
    "text.primary",
    "text.secondary",
    "text.onFill",
    "lines.arrow",
    "lines.structural",
    "evidence.background",
    "evidence.codeText",
    "evidence.dataText",
    "evidence.mutedText",
  ];
  for (const group of ["accents", "states"]) {
    for (const [name, values] of Object.entries(theme?.[group] ?? {})) {
      requiredColors.push(`${group}.${name}.fill`, `${group}.${name}.stroke`);
      if (group === "states" && typeof values.cue !== "string") {
        errors.push(`${group}.${name}.cue must describe a non-color cue`);
      }
    }
  }
  for (const colorPath of requiredColors) {
    const color = get(theme, colorPath);
    if (typeof color !== "string" || !HEX_COLOR.test(color)) {
      errors.push(`${colorPath} must be a six-digit hex color`);
    }
  }
  for (const name of ["primary", "secondary", "tertiary"]) {
    if (!theme?.accents?.[name]) errors.push(`accents.${name} is required`);
  }
  for (const name of ["start", "success", "warning", "decision", "ai", "error", "inactive"]) {
    if (!theme?.states?.[name]) errors.push(`states.${name} is required`);
  }
  if (typeof theme?.canvas?.exportBackground !== "boolean") {
    errors.push("canvas.exportBackground must be boolean");
  }
  if (![0, 1, 2].includes(theme?.style?.roughness)) {
    errors.push("style.roughness must be 0, 1, or 2");
  }
  if (theme?.style?.opacity !== 100) errors.push("style.opacity must be 100");
  const widths = theme?.style?.strokeWidth;
  if (
    !widths ||
    ![widths.structural, widths.standard, widths.emphasis].every((value) =>
      [1, 2, 3].includes(value),
    )
  ) {
    errors.push("style.strokeWidth values must be 1, 2, or 3");
  }

  if (errors.length > 0) return { errors, ratios: [] };
  const pairs = [
    ["text.primary", theme.text.primary, "canvas.background", theme.canvas.background],
    ["text.secondary", theme.text.secondary, "canvas.background", theme.canvas.background],
  ];
  for (const group of ["accents", "states"]) {
    for (const [name, values] of Object.entries(theme[group])) {
      pairs.push(["text.onFill", theme.text.onFill, `${group}.${name}.fill`, values.fill]);
    }
  }
  for (const name of ["codeText", "dataText", "mutedText"]) {
    pairs.push([
      `evidence.${name}`,
      theme.evidence[name],
      "evidence.background",
      theme.evidence.background,
    ]);
  }
  const ratios = pairs.map(([foregroundName, foreground, backgroundName, background]) => ({
    pair: `${foregroundName} / ${backgroundName}`,
    ratio: contrastRatio(foreground, background),
  }));
  for (const result of ratios) {
    if (result.ratio < 4.5) {
      errors.push(`${result.pair} is ${result.ratio.toFixed(2)}:1; require at least 4.5:1`);
    }
  }
  return { errors, ratios };
}

async function main() {
  const input = process.argv[2];
  if (!input || process.argv.length !== 3) {
    console.error("Usage: node scripts/validate_theme.mjs <diagram-theme.json>");
    process.exitCode = 1;
    return;
  }
  try {
    const theme = JSON.parse(await readFile(path.resolve(input), "utf8"));
    const result = validateTheme(theme);
    if (result.errors.length > 0) {
      for (const error of result.errors) console.error(`ERROR: ${error}`);
      process.exitCode = 1;
      return;
    }
    const minimum = Math.min(...result.ratios.map(({ ratio }) => ratio));
    console.log(`Theme is valid. Minimum text contrast: ${minimum.toFixed(2)}:1`);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(MODULE_PATH)) await main();
