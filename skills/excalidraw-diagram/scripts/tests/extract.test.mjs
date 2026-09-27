import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";

import { ExtractError, extractScene, parseArguments } from "../extract_scene.mjs";

const SCENE = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [
    { id: "box", type: "rectangle", x: 0, y: 0, width: 120, height: 60 },
    { id: "label", type: "text", x: 10, y: 20, width: 100, height: 25, text: "Поток → 数据", containerId: "box" },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

// Wrap a scene as Excalidraw 0.18 does: deflate the UTF-8 JSON, keep the bytes
// as a byte string, and put it in a JSON envelope.
function envelope(scene, { compressed = true, ...overrides } = {}) {
  const json = Buffer.from(JSON.stringify(scene), "utf8");
  const bytes = compressed ? zlib.deflateSync(json) : json;
  return JSON.stringify({
    version: "1",
    encoding: "bstring",
    compressed,
    encoded: bytes.toString("latin1"),
    ...overrides,
  });
}

function svgWith(payload, { type = "application/vnd.excalidraw+json", version = 2 } = {}) {
  const base64 = Buffer.from(payload, "latin1").toString("base64");
  return Buffer.from(
    `<svg version="1.1" xmlns="http://www.w3.org/2000/svg"><!-- svg-source:excalidraw -->` +
      `<metadata><!-- payload-type:${type} --><!-- payload-version:${version} -->` +
      `<!-- payload-start -->${base64}<!-- payload-end --></metadata><g></g></svg>`,
    "utf8",
  );
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  // The reader does not check CRCs, so a zero CRC is enough for a fixture.
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
}

function pngWith(chunks) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    ...chunks,
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function text(keyword, value) {
  return chunk("tEXt", Buffer.from(`${keyword}\0${value}`, "latin1"));
}

test("extracts the embedded scene from an SVG export", () => {
  assert.deepEqual(extractScene(svgWith(envelope(SCENE))), SCENE);
});

test("extracts the embedded scene from a PNG export", () => {
  const png = pngWith([
    text("Software", "other"),
    text("application/vnd.excalidraw+json", envelope(SCENE)),
  ]);
  assert.deepEqual(extractScene(png), SCENE);
});

test("extracts a scene that the export did not compress", () => {
  assert.deepEqual(extractScene(svgWith(envelope(SCENE, { compressed: false }))), SCENE);
});

test("rejects a file that does not hold a readable scene", () => {
  const cases = [
    ["a plain SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g></g></svg>'), /does not embed an Excalidraw scene/],
    ["a PNG without the scene chunk", pngWith([text("Software", "other")]), /does not embed an Excalidraw scene/],
    ["a file that is not SVG or PNG", Buffer.from("GIF89a"), /is not an SVG or PNG/],
    ["another payload type", svgWith(envelope(SCENE), { type: "application/json" }), /payload type 'application\/json'/],
    ["another payload version", svgWith(envelope(SCENE), { version: 1 }), /payload version 1/],
    ["another encoding", svgWith(envelope(SCENE, { encoding: "base64" })), /encoding 'base64'/],
    ["damaged compressed data", svgWith(envelope(SCENE, { encoded: "not deflated" })), /cannot decode/],
    ["damaged envelope", svgWith("{not json"), /cannot decode/],
    ["a payload that is not a scene", svgWith(envelope({ type: "excalidrawlib" })), /is not an Excalidraw scene/],
  ];
  for (const [name, bytes, message] of cases) {
    assert.throws(() => extractScene(bytes), (error) => error instanceof ExtractError && message.test(error.message), name);
  }
});

test("command line writes the scene next to the image unless -o names a file", () => {
  assert.deepEqual(parseArguments(["diagrams/flow.excalidraw.svg"]), {
    help: false,
    input: "diagrams/flow.excalidraw.svg",
    output: "diagrams/flow.excalidraw",
  });
  assert.equal(parseArguments(["Flow.Excalidraw.PNG"]).output, "Flow.excalidraw");
  assert.equal(parseArguments(["shot.png"]).output, "shot.excalidraw");
  assert.equal(parseArguments(["flow.excalidraw.svg", "-o", "work/scene.excalidraw"]).output, "work/scene.excalidraw");
  assert.deepEqual(parseArguments(["--help"]), { help: true });
});

test("command line rejects bad arguments and an image as the output", () => {
  const cases = [
    [[], /Missing input image/],
    [["a.svg", "-o"], /Missing value for -o/],
    [["a.svg", "--width", "3"], /Unknown option: --width/],
    [["a.svg", "b.svg"], /Unexpected argument: b.svg/],
    [["a.excalidraw.svg", "-o", "a.excalidraw.svg"], /would overwrite an image/],
  ];
  for (const [argv, message] of cases) {
    assert.throws(() => parseArguments(argv), (error) => error instanceof ExtractError && message.test(error.message), argv.join(" "));
  }
});
