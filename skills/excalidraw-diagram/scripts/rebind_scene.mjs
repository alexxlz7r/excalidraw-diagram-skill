#!/usr/bin/env node
/** Put bound arrows and their labels back on their shapes after an edit of the scene JSON. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { rebindScene } from "./scene.mjs";

const USAGE = `Usage: node scripts/rebind_scene.mjs <scene.excalidraw>

Moves the ends of every arrow bound in the "inside" mode to its fixed points,
as Excalidraw does when a user drags a shape, and recenters the arrow labels.
The sequence generator writes such bindings. Changes the file in place.`;

const [input, ...rest] = process.argv.slice(2);
if (input === undefined || ["-h", "--help"].includes(input) || rest.length > 0) {
  console.log(USAGE);
  process.exitCode = input === undefined || rest.length > 0 ? 1 : 0;
} else {
  try {
    const scene = JSON.parse(await readFile(input, "utf8"));
    await writeFile(input, `${JSON.stringify(rebindScene(scene), null, 2)}\n`);
    console.log(path.resolve(input));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
