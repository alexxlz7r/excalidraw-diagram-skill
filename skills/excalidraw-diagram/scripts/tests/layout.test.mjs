import assert from "node:assert/strict";
import test from "node:test";

import { boxFor, textHeight, textWidth } from "../layout.mjs";

test("text width sums the measured advance of each character", () => {
  const digit = textWidth("1", 100);
  assert.ok(digit > 55 && digit < 62, "Cascadia is about 0.6 em wide");
  assert.equal(textWidth("молчит\n1234567890", 20), textWidth("1234567890", 20));
  assert.ok(Math.abs(textWidth("1234567890", 20) - 10 * textWidth("1", 20)) < 1e-9);
  assert.equal(textHeight("молчит\n1234567890", 20), 50);
  assert.deepEqual(boxFor("1234567890", { fontSize: 20 }), {
    width: Math.ceil(textWidth("1234567890", 20) + 44),
    height: 55,
  });
});

test("proportional fonts measure narrow and wide letters differently", () => {
  for (const fontFamily of [3, 8]) {
    assert.equal(textWidth("iiii", 20, { fontFamily }), textWidth("MMMM", 20, { fontFamily }), `font ${fontFamily} is monospace`);
  }
  for (const fontFamily of [1, 5, 6, 7, 9]) {
    assert.ok(
      textWidth("iiii", 20, { fontFamily }) < textWidth("MMMM", 20, { fontFamily }) / 2,
      `font ${fontFamily}`,
    );
  }
  assert.equal(textWidth("漢字", 20, { fontFamily: 6 }), 40, "an unknown character is 1 em");
});

test("Cascadia rounds each character to a whole pixel, as the renderer does", () => {
  // Widths measured in the headless browser that renders the previews.
  const path = "GET /api/episodes/{id}/spec";
  assert.equal(textWidth(path, 16), 243);
  assert.equal(textWidth(path, 18), 297);
  assert.equal(textWidth(path, 24), 378);
  for (const fontSize of [12, 13, 14, 15, 17, 19, 20, 22]) {
    assert.ok(Number.isInteger(textWidth(path, fontSize)), `size ${fontSize}`);
  }
});

test("fonts without measured widths require a width factor", () => {
  assert.throws(
    () => textWidth("Label", 20, { fontFamily: 2 }),
    /charWidthFactor is required/,
  );
  assert.equal(
    textWidth("Label", 20, { fontFamily: 2, charWidthFactor: 0.52 }),
    52,
  );
});
