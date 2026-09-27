#!/usr/bin/env node

/** Read the Excalidraw scene that an SVG or PNG export embeds. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const MODULE_PATH = fileURLToPath(import.meta.url);
const MIME_TYPE = "application/vnd.excalidraw+json";
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const PAYLOAD = /<!-- payload-start -->\s*([A-Za-z0-9+/=\s]+?)\s*<!-- payload-end -->/;
const PAYLOAD_TYPE = /<!-- payload-type:(.*?) -->/;
const PAYLOAD_VERSION = /<!-- payload-version:(.*?) -->/;
const NO_SCENE =
  "The file does not embed an Excalidraw scene. Only an export with the embedded scene can be edited.";

export class ExtractError extends Error {}

// Return the text of the PNG tEXt chunk that has the Excalidraw keyword.
function pngPayload(bytes) {
  for (let offset = PNG_SIGNATURE.length; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "tEXt") {
      const separator = data.indexOf(0);
      if (data.toString("latin1", 0, separator) === MIME_TYPE) {
        return data.toString("latin1", separator + 1);
      }
    }
    offset += 12 + length;
  }
  throw new ExtractError(NO_SCENE);
}

// Return the envelope from the SVG metadata. Payload version 2 holds the
// envelope as base64 of a byte string.
function svgPayload(bytes) {
  const svg = bytes.toString("utf8");
  const match = PAYLOAD.exec(svg);
  if (!match) throw new ExtractError(NO_SCENE);
  const type = PAYLOAD_TYPE.exec(svg)?.[1];
  if (type !== MIME_TYPE) {
    throw new ExtractError(`Unsupported payload type '${type}'; expected '${MIME_TYPE}'`);
  }
  const version = PAYLOAD_VERSION.exec(svg)?.[1];
  if (version !== "2") throw new ExtractError(`Unsupported payload version ${version}; expected 2`);
  return Buffer.from(match[1], "base64").toString("latin1");
}

// Decode the JSON envelope that Excalidraw writes: a byte string of the UTF-8
// scene JSON, deflated if `compressed` is true.
function decodeEnvelope(text) {
  let envelope;
  let scene;
  try {
    envelope = JSON.parse(text);
    if (envelope.encoding !== "bstring") {
      throw new ExtractError(`Unsupported encoding '${envelope.encoding}'; expected 'bstring'`);
    }
    const bytes = Buffer.from(envelope.encoded, "latin1");
    scene = JSON.parse((envelope.compressed ? zlib.inflateSync(bytes) : bytes).toString("utf8"));
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    throw new ExtractError(`The embedded scene is damaged; cannot decode it: ${error.message}`);
  }
  if (scene?.type !== "excalidraw" || !Array.isArray(scene.elements)) {
    throw new ExtractError("The embedded data is not an Excalidraw scene");
  }
  return scene;
}

export function extractScene(bytes) {
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return decodeEnvelope(pngPayload(bytes));
  }
  if (/<svg[\s>]/.test(bytes.toString("utf8"))) return decodeEnvelope(svgPayload(bytes));
  throw new ExtractError("The file is not an SVG or PNG image");
}

const USAGE = `Usage: node scripts/extract_scene.mjs <image.excalidraw.svg|png> [-o scene.excalidraw]

Writes the Excalidraw scene that the export embeds as a scene JSON file. The
default output is <name>.excalidraw next to the image. Replaces an existing
output file.`;

export function parseArguments(argv) {
  let input = null;
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["-h", "--help"].includes(argument)) return { help: true };
    if (["-o", "--output"].includes(argument)) {
      output = argv[++index];
      if (output === undefined) throw new ExtractError(`Missing value for ${argument}`);
    } else if (argument.startsWith("-")) {
      throw new ExtractError(`Unknown option: ${argument}`);
    } else if (input === null) {
      input = argument;
    } else {
      throw new ExtractError(`Unexpected argument: ${argument}`);
    }
  }
  if (input === null) throw new ExtractError("Missing input image");
  output ??= input.replace(/(\.excalidraw)?\.(svg|png)$/i, "") + ".excalidraw";
  if (/\.(svg|png)$/i.test(output)) {
    throw new ExtractError(`Output ${output} would overwrite an image; use a .excalidraw file`);
  }
  return { help: false, input, output };
}

async function main() {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    if (parsed.help) {
      console.log(USAGE);
      return;
    }
    const scene = extractScene(await readFile(parsed.input));
    await writeFile(parsed.output, `${JSON.stringify(scene, null, 2)}\n`);
    console.log(path.resolve(parsed.output));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(MODULE_PATH)) {
  await main();
}
