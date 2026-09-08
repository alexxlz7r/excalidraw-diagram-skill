import assert from "node:assert/strict";
import test from "node:test";

import { boxFor, textHeight, textWidth } from "../layout.mjs";

test("monospace text helpers size wrapped text and its container", () => {
  const text = "молчит\n1234567890";

  assert.equal(textWidth(text, 20), 120);
  assert.equal(textHeight(text, 20), 50);
  assert.deepEqual(boxFor(text, { fontSize: 20 }), {
    width: 164,
    height: 80,
  });
});

test("non-default fonts require an explicit measured width factor", () => {
  assert.throws(
    () => textWidth("Label", 20, { fontFamily: 1 }),
    /charWidthFactor is required/,
  );
  assert.equal(
    textWidth("Label", 20, { fontFamily: 1, charWidthFactor: 0.52 }),
    52,
  );
});
