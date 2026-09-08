#!/usr/bin/env node

/** Export Excalidraw JSON as an editable SVG or PNG image. */

import { fileURLToPath, pathToFileURL } from "node:url";
import {
  access,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const MODULE_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(MODULE_PATH);
const FORMATS = new Set(["svg", "png"]);
const SCALES = new Set([1, 2, 3]);
const MAX_DELIVERY_SCALE = 1.15;

export class ExportError extends Error {}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateExcalidraw(data) {
  const errors = [];
  if (!isObject(data)) return ["Scene must be a JSON object"];
  if (data.type !== "excalidraw") {
    errors.push(`Expected type 'excalidraw', got '${data.type}'`);
  }
  if (!Array.isArray(data.elements)) {
    errors.push("'elements' must be an array");
    return errors;
  }
  if (data.elements.length === 0) {
    errors.push("'elements' array is empty — nothing to export");
  }
  if (data.appState !== undefined && !isObject(data.appState)) {
    errors.push("'appState' must be an object");
  }
  if (data.files !== undefined && !isObject(data.files)) {
    errors.push("'files' must be an object");
  }

  const ids = new Set();
  for (const [index, element] of data.elements.entries()) {
    const label = `elements[${index}]`;
    if (!isObject(element)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof element.id !== "string" || element.id.length === 0) {
      errors.push(`${label}.id must be a non-empty string`);
    } else if (ids.has(element.id)) {
      errors.push(`${label}.id duplicates '${element.id}'`);
    } else {
      ids.add(element.id);
    }
    if (typeof element.type !== "string" || element.type.length === 0) {
      errors.push(`${label}.type must be a non-empty string`);
    }
    for (const property of ["x", "y", "width", "height"]) {
      if (!isFiniteNumber(element[property])) {
        errors.push(`${label}.${property} must be a finite number`);
      }
    }
    if (["arrow", "line"].includes(element.type)) {
      if (
        !Array.isArray(element.points) ||
        element.points.length < 2 ||
        element.points.some(
          (point) =>
            !Array.isArray(point) ||
            point.length !== 2 ||
            !point.every(isFiniteNumber),
        )
      ) {
        errors.push(`${label}.points must contain at least two [x, y] pairs`);
      }
    }
  }

  const files = isObject(data.files) ? data.files : {};
  for (const [index, element] of data.elements.entries()) {
    if (!isObject(element)) continue;
    const label = `elements[${index}]`;
    for (const bindingName of ["startBinding", "endBinding"]) {
      const binding = element[bindingName];
      if (binding && !ids.has(binding.elementId)) {
        errors.push(`${label}.${bindingName} references missing '${binding.elementId}'`);
      }
    }
    if (element.containerId && !ids.has(element.containerId)) {
      errors.push(`${label}.containerId references missing '${element.containerId}'`);
    }
    if (Array.isArray(element.boundElements)) {
      for (const binding of element.boundElements) {
        if (!isObject(binding) || !ids.has(binding.id)) {
          errors.push(`${label}.boundElements references a missing element`);
        }
      }
    }
    if (element.type === "image" && element.fileId && !files[element.fileId]) {
      errors.push(`${label}.fileId references missing '${element.fileId}'`);
    }
  }
  return errors;
}

export function defaultOutputPath(inputPath, outputFormat) {
  const directory = path.dirname(inputPath);
  let name = path.basename(inputPath);
  for (const suffix of [".excalidraw.json", ".excalidraw"]) {
    if (name.toLowerCase().endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      return path.join(directory, `${name}.excalidraw.${outputFormat}`);
    }
  }
  name = path.parse(name).name;
  return path.join(directory, `${name}.excalidraw.${outputFormat}`);
}

export function inferFormat(outputPath) {
  const extension = path.extname(outputPath).toLowerCase().slice(1);
  return FORMATS.has(extension) ? extension : null;
}

export function computeBoundingBox(elements) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of elements) {
    if (element.isDeleted) continue;
    const { x = 0, y = 0, width = 0, height = 0 } = element;
    if (["arrow", "line"].includes(element.type) && Array.isArray(element.points)) {
      for (const [pointX, pointY] of element.points) {
        minX = Math.min(minX, x + pointX);
        minY = Math.min(minY, y + pointY);
        maxX = Math.max(maxX, x + pointX);
        maxY = Math.max(maxY, y + pointY);
      }
    } else {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + Math.abs(width));
      maxY = Math.max(maxY, y + Math.abs(height));
    }
  }
  return minX === Infinity ? [0, 0, 800, 600] : [minX, minY, maxX, maxY];
}

export function buildDeliveryReport(elements, targetWidth = null) {
  const [minX, minY, maxX, maxY] = computeBoundingBox(elements);
  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY);
  if (targetWidth === null) {
    return { width, height, ratio: null, warning: null };
  }

  const ratio = width / targetWidth;
  let warning = null;
  if (ratio > MAX_DELIVERY_SCALE) {
    const fontSizes = elements
      .filter((element) => !element.isDeleted && element.type === "text")
      .map((element) => element.fontSize)
      .filter(isFiniteNumber);
    const smallestFontSize = fontSizes.length > 0 ? Math.min(...fontSizes) : null;
    const textEffect = smallestFontSize === null
      ? ""
      : ` Smallest text at ${smallestFontSize} px will render at ${(smallestFontSize / ratio).toFixed(1)} px.`;
    warning =
      `warning: export is ${ratio.toFixed(2)}× the target width ${targetWidth} px.` +
      textEffect +
      " Make the scene denser or give the destination more room.";
  }
  return { width, height, ratio, warning };
}

function setupError(message) {
  return new ExportError(`${message}\nRun: ${path.join(SCRIPT_DIR, "setup_renderer.sh")}`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function exportDiagram(
  excalidrawPath,
  {
    outputPath = null,
    outputFormat = null,
    scale = 1,
    maxWidth = 1920,
    previewPath = null,
    targetWidth = null,
    reporter = null,
  } = {},
) {
  const inputPath = path.resolve(excalidrawPath);
  let data;
  try {
    data = JSON.parse(await readFile(inputPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ExportError(`Invalid JSON in ${inputPath}: ${error.message}`);
    }
    throw error;
  }

  const validationErrors = validateExcalidraw(data);
  if (validationErrors.length > 0) {
    throw new ExportError(
      `Invalid Excalidraw scene:\n${validationErrors.map((error) => `  - ${error}`).join("\n")}`,
    );
  }

  const resolvedOutput = outputPath ? path.resolve(outputPath) : null;
  const explicitFormat = resolvedOutput ? inferFormat(resolvedOutput) : null;
  if (outputFormat && explicitFormat && outputFormat !== explicitFormat) {
    throw new ExportError(
      `--format ${outputFormat} conflicts with output file ${resolvedOutput}`,
    );
  }
  const format = outputFormat ?? explicitFormat ?? "svg";
  if (!FORMATS.has(format)) throw new ExportError("Output format must be svg or png");
  if (!SCALES.has(scale)) throw new ExportError("Scale must be 1, 2, or 3");
  if (!Number.isInteger(maxWidth) || maxWidth < 320) {
    throw new ExportError("Preview width must be an integer of at least 320");
  }
  if (targetWidth !== null && (!Number.isInteger(targetWidth) || targetWidth <= 0)) {
    throw new ExportError("Target width must be a positive integer");
  }
  const finalOutput = resolvedOutput ?? defaultOutputPath(inputPath, format);
  const expectedSuffix = `.excalidraw.${format}`;
  if (!finalOutput.toLowerCase().endsWith(expectedSuffix)) {
    throw new ExportError(
      `Output filename must end with ${expectedSuffix} for VS Code compatibility`,
    );
  }
  const resolvedPreview = previewPath ? path.resolve(previewPath) : null;
  if (resolvedPreview && path.extname(resolvedPreview).toLowerCase() !== ".png") {
    throw new ExportError("Preview filename must end with .png");
  }

  const templatePath = path.join(SCRIPT_DIR, "render_template.html");
  const bundlePath = path.join(SCRIPT_DIR, "vendor", "excalidraw-bundle.js");
  if (!(await exists(templatePath))) throw setupError(`Template not found at ${templatePath}`);
  if (!(await exists(bundlePath))) throw setupError(`Excalidraw bundle not found at ${bundlePath}`);

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw setupError("Playwright runtime is not installed");
  }

  const elements = data.elements.filter((element) => !element.isDeleted);
  const [minX, minY, maxX, maxY] = computeBoundingBox(elements);
  const deliveryReport = buildDeliveryReport(elements, targetWidth);
  const padding = 80;
  const viewportWidth = Math.max(
    320,
    Math.min(Math.ceil(maxX - minX + padding * 2), maxWidth),
  );
  const viewportHeight = Math.max(Math.ceil(maxY - minY + padding * 2), 600);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (/executable doesn't exist|browserType\.launch/i.test(error.message)) {
      throw setupError("Chromium is not installed for Playwright");
    }
    throw error;
  }

  try {
    const page = await browser.newPage({
      viewport: { width: viewportWidth, height: viewportHeight },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(templatePath).href);
    await page.waitForFunction(() => window.__moduleReady === true, null, {
      timeout: 15_000,
    });
    const result = await page.evaluate(
      ([scene, requestedFormat, requestedScale, renderPreview]) =>
        window.exportDiagram(scene, requestedFormat, requestedScale, renderPreview),
      [data, format, scale, resolvedPreview !== null],
    );
    if (!result?.success) {
      throw new ExportError(`Export failed: ${result?.error ?? "unknown error"}`);
    }
    await page.waitForFunction(() => window.__renderComplete === true, null, {
      timeout: 15_000,
    });

    await mkdir(path.dirname(finalOutput), { recursive: true });
    if (format === "svg") {
      await writeFile(finalOutput, result.payload, "utf8");
    } else {
      await writeFile(finalOutput, Buffer.from(result.payload, "base64"));
    }
    if (resolvedPreview) {
      await mkdir(path.dirname(resolvedPreview), { recursive: true });
      const svg = page.locator("#root svg");
      if ((await svg.count()) === 0) {
        throw new ExportError("No SVG element found for preview");
      }
      if (targetWidth !== null) {
        await svg.evaluate((element, width) => {
          element.style.width = `${width}px`;
          element.style.height = "auto";
        }, targetWidth);
      }
      await svg.screenshot({ path: resolvedPreview });
    }
  } finally {
    await browser.close();
  }
  if (reporter) {
    reporter(`export ${deliveryReport.width}×${deliveryReport.height} px`);
    if (deliveryReport.warning) reporter(deliveryReport.warning);
  }
  return finalOutput;
}

function usage() {
  return `Usage: node scripts/export_excalidraw.mjs <scene.excalidraw> [options]

Options:
  -o, --output <path>  Output ending in .excalidraw.svg or .excalidraw.png
  -f, --format <type>  svg (default) or png
  -s, --scale <n>      PNG scale: 1, 2, or 3
      --preview <path> Also write a PNG preview
      --target-width <px>
                         Delivery width; scales previews and warns above 1.15×
  -w, --width <px>     Maximum preview viewport width (default: 1920)
  -h, --help           Show this help`;
}

export function parseArguments(argv) {
  const options = {
    outputPath: null,
    outputFormat: null,
    scale: 1,
    maxWidth: 1920,
    previewPath: null,
    targetWidth: null,
  };
  let input = null;
  const valueOptions = new Map([
    ["-o", "outputPath"], ["--output", "outputPath"],
    ["-f", "outputFormat"], ["--format", "outputFormat"],
    ["-s", "scale"], ["--scale", "scale"],
    ["-w", "maxWidth"], ["--width", "maxWidth"],
    ["--preview", "previewPath"],
    ["--target-width", "targetWidth"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["-h", "--help"].includes(argument)) return { help: true };
    if (valueOptions.has(argument)) {
      const value = argv[++index];
      if (value === undefined) throw new ExportError(`Missing value for ${argument}`);
      const key = valueOptions.get(argument);
      options[key] = ["scale", "maxWidth", "targetWidth"].includes(key) ? Number(value) : value;
    } else if (argument.startsWith("-")) {
      throw new ExportError(`Unknown option: ${argument}`);
    } else if (input === null) {
      input = argument;
    } else {
      throw new ExportError(`Unexpected argument: ${argument}`);
    }
  }
  if (input === null) throw new ExportError("Missing input scene");
  return { help: false, input, options };
}

async function main() {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    if (parsed.help) {
      console.log(usage());
      return;
    }
    const output = await exportDiagram(parsed.input, {
      ...parsed.options,
      reporter: (message) => console.error(message),
    });
    console.log(output);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(MODULE_PATH)) {
  await main();
}
