import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ExportError,
  defaultOutputPath,
  exportDiagram,
  inferFormat,
  validateExcalidraw,
} from "../export_excalidraw.mjs";

function common(id, type, x, y, width, height, seed) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#172033",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    seed,
    version: 1,
    versionNonce: seed + 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
}

function richScene() {
  const left = {
    ...common("source", "rectangle", 20, 40, 200, 100, 100),
    backgroundColor: "#DBEAFE",
    roundness: { type: 3 },
    boundElements: [
      { id: "source_label", type: "text" },
      { id: "flow", type: "arrow" },
    ],
  };
  const label = {
    ...common("source_label", "text", 45, 75, 150, 25, 200),
    text: "Поток → 数据",
    originalText: "Поток → 数据",
    fontSize: 18,
    fontFamily: 3,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: "source",
    lineHeight: 1.25,
  };
  const target = {
    ...common("target", "ellipse", 360, 40, 140, 100, 300),
    backgroundColor: "#DCFCE7",
    boundElements: [{ id: "flow", type: "arrow" }],
  };
  const arrow = {
    ...common("flow", "arrow", 225, 90, 130, 0, 400),
    points: [[0, 0], [130, 0]],
    startBinding: { elementId: "source", focus: 0, gap: 5 },
    endBinding: { elementId: "target", focus: 0, gap: 5 },
    startArrowhead: null,
    endArrowhead: "arrow",
  };
  const image = {
    ...common("pixel", "image", 540, 55, 48, 48, 500),
    strokeColor: "transparent",
    fileId: "pixel_file",
    status: "saved",
    scale: [1, 1],
    crop: null,
  };
  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: [left, label, target, arrow, image],
    appState: {
      viewBackgroundColor: "#FFFFFF",
      exportBackground: true,
      gridSize: 20,
    },
    files: {
      pixel_file: {
        id: "pixel_file",
        mimeType: "image/png",
        dataURL:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        created: 1,
        lastRetrieved: 1,
      },
    },
  };
}

test("default and explicit suffix handling", () => {
  assert.equal(
    defaultOutputPath("/tmp/architecture.excalidraw", "svg"),
    "/tmp/architecture.excalidraw.svg",
  );
  assert.equal(
    defaultOutputPath("/tmp/architecture.excalidraw.json", "png"),
    "/tmp/architecture.excalidraw.png",
  );
  assert.equal(defaultOutputPath("/tmp/architecture.json", "svg"), "/tmp/architecture.excalidraw.svg");
  assert.equal(inferFormat("diagram.excalidraw.svg"), "svg");
  assert.equal(inferFormat("diagram.txt"), null);
});

test("validation rejects malformed scenes and broken references", () => {
  assert.deepEqual(validateExcalidraw(null), ["Scene must be a JSON object"]);
  assert.ok(validateExcalidraw({ type: "other", elements: [] }).length >= 2);
  const scene = richScene();
  scene.elements[3].endBinding.elementId = "missing";
  scene.elements[4].fileId = "missing_file";
  const errors = validateExcalidraw(scene).join("\n");
  assert.match(errors, /references missing 'missing'/);
  assert.match(errors, /references missing 'missing_file'/);
});

test("SVG and PNG preserve text, bindings, files, and non-ASCII content", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "excalidraw-export-"));
  const source = path.join(directory, "diagram.excalidraw");
  const preview = path.join(directory, "preview.png");
  await writeFile(source, JSON.stringify(richScene()), "utf8");

  const svgPath = await exportDiagram(source, { previewPath: preview });
  const pngPath = await exportDiagram(source, { outputFormat: "png" });
  assert.equal(path.basename(svgPath), "diagram.excalidraw.svg");
  assert.match(await readFile(svgPath, "utf8"), /<metadata/);
  assert.deepEqual((await readFile(preview)).subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"));
  assert.equal(path.basename(pngPath), "diagram.excalidraw.png");
  assert.deepEqual((await readFile(pngPath)).subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"));
});

test("invalid scenes and incompatible output options fail before export", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "excalidraw-invalid-"));
  const source = path.join(directory, "bad.excalidraw");
  await writeFile(source, JSON.stringify({ type: "excalidraw", elements: [] }), "utf8");
  await assert.rejects(() => exportDiagram(source), ExportError);

  await writeFile(source, JSON.stringify(richScene()), "utf8");
  await assert.rejects(
    () => exportDiagram(source, { outputPath: path.join(directory, "bad.svg") }),
    /must end with \.excalidraw\.svg/,
  );
  await assert.rejects(
    () =>
      exportDiagram(source, {
        outputPath: path.join(directory, "bad.excalidraw.png"),
        outputFormat: "svg",
      }),
    /conflicts/,
  );
});
