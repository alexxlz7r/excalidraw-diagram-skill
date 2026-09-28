import assert from "node:assert/strict";
import test from "node:test";

import { validateExcalidraw } from "../export_excalidraw.mjs";
import { rebindScene } from "../scene.mjs";
import { DEFAULT_THEME } from "../theme.mjs";
import { buildSequence, SpecError } from "../sequence.mjs";

function byId(scene) {
  return new Map(scene.elements.map((element) => [element.id, element]));
}

const inside = (inner, outer) =>
  inner.x >= outer.x && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

function globalPoints(arrow) {
  return arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py]);
}

// The point that an Excalidraw release with fixed-point bindings moves an arrow end to.
function fixedPointOf(binding, elements) {
  const target = elements.get(binding.elementId);
  return [target.x + binding.fixedPoint[0] * target.width, target.y + binding.fixedPoint[1] * target.height];
}

const threeParticipants = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("calls and replies are horizontal arrows bound to the lifelines", async () => {
  const scene = await buildSequence({
    participants: threeParticipants,
    steps: [
      { from: "a", to: "b", label: "select(id)" },
      { from: "b", to: "a", label: "spec", reply: true },
      { from: "a", to: "c", label: "far()" },
    ],
  });
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const [call, reply, far] = ["m1", "m2", "m3"].map((id) => elements.get(id));
  const lineX = (id) => elements.get(`${id}-line`).x;

  for (const [arrow, from, to] of [[call, "a", "b"], [reply, "b", "a"], [far, "a", "c"]]) {
    const points = globalPoints(arrow);
    assert.equal(points.length, 2, `${arrow.id} has two points, so Excalidraw moves only its ends`);
    assert.equal(points[0][1], points[1][1], `${arrow.id} is horizontal`);
    assert.equal(points[0][0], lineX(from), `${arrow.id} starts on the lifeline of ${from}`);
    assert.equal(points[1][0], lineX(to), `${arrow.id} ends on the lifeline of ${to}`);
    assert.equal(arrow.endArrowhead, "arrow");
    for (const [binding, point, owner] of [[arrow.startBinding, points[0], from], [arrow.endBinding, points[1], to]]) {
      assert.equal(binding.elementId, `${owner}-lifeline`);
      assert.equal(binding.mode, "inside");
      assert.deepEqual(fixedPointOf(binding, elements), point, `${arrow.id} keeps its end on a move`);
      assert.equal(typeof binding.focus, "number", "Excalidraw 0.18 reads focus and gap");
      assert.equal(typeof binding.gap, "number");
      assert.ok(elements.get(`${owner}-lifeline`).boundElements.some((bound) => bound.id === arrow.id));
    }
  }
  assert.equal(call.strokeStyle, "solid");
  assert.equal(reply.strokeStyle, "dashed");
  assert.ok(call.y < reply.y && reply.y < far.y, "messages run top to bottom");
  const line = elements.get("a-line");
  assert.ok(line.y + line.points[1][1] > far.y + 10, "lifelines reach below the last message");
});

test("gaps grow to fit the labels, and every label sits on a plate above its arrow", async () => {
  const long = "loadEpisodeCatalog(signals, rule)";
  const spec = (labels) => ({
    participants: threeParticipants,
    steps: [
      { from: "a", to: "b", label: labels ? long : "" },
      { from: "c", to: "a", label: labels ? `${long} and more` : "", reply: true },
    ],
  });
  const plain = byId(await buildSequence(spec(false)));
  const scene = await buildSequence(spec(true));
  const elements = byId(scene);
  const order = new Map(scene.elements.map((element, index) => [element.id, index]));
  const lineX = (map, id) => map.get(`${id}-line`).x;
  assert.ok(lineX(plain, "b") - lineX(plain, "a") < 120, "without labels the headers set the gap");

  for (const [id, left, right] of [["m1", "a", "b"], ["m2", "a", "c"]]) {
    const label = elements.get(`${id}-label`);
    const plate = elements.get(`${id}-plate`);
    const arrow = elements.get(id);
    const [x1, x2] = [lineX(elements, left), lineX(elements, right)];
    assert.ok(x2 - x1 >= label.width + 32, `${id}: the lifelines leave room for the label`);
    assert.ok(Math.abs(label.x + label.width / 2 - (x1 + x2) / 2) < 0.5, `${id}: the label is centered`);
    assert.ok(label.y + label.height < arrow.y, `${id}: the label is above the arrow`);
    assert.ok(inside(label, plate), `${id}: the plate holds the label`);
    assert.ok(plate.y + plate.height < arrow.y, `${id}: the plate does not cover the arrow`);
    assert.ok(order.get(plate.id) < order.get(label.id), `${id}: the plate is below the label`);
    assert.equal(plate.backgroundColor, scene.appState.viewBackgroundColor);
    assert.equal(plate.strokeColor, "transparent");
    for (const element of [arrow, label, plate]) assert.deepEqual(element.groupIds, [`${id}-message`]);
  }
  const plate = elements.get("m2-plate");
  const middle = lineX(elements, "b");
  assert.ok(plate.x < middle && middle < plate.x + plate.width, "the plate covers the lifeline it crosses");
  assert.ok(order.get("b-line") < order.get("m2-plate"));
});

test("a self-call is a loop beside the lifeline that moves with its participant", async () => {
  const scene = await buildSequence({
    participants: threeParticipants,
    steps: [
      { self: "b", label: "load_episode_catalog()" },
      { self: "b", side: "left", label: ["episodes(", "  signals, rule)"] },
      { from: "a", to: "c", label: "next()" },
    ],
  });
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const lineX = (id) => elements.get(`${id}-line`).x;
  for (const [id, direction] of [["m1", 1], ["m2", -1]]) {
    const arrow = elements.get(id);
    const label = elements.get(`${id}-label`);
    const points = globalPoints(arrow);
    assert.equal(points.length, 4, `${id} is a loop`);
    assert.equal(points[0][0], lineX("b"));
    assert.equal(points.at(-1)[0], lineX("b"));
    const reach = Math.max(...points.map(([x]) => direction * (x - lineX("b"))));
    assert.equal(reach, 32, `${id}: the end segment is long enough for a full arrowhead`);
    assert.ok(points.at(-1)[1] > points[0][1], `${id} returns lower`);
    for (const binding of [arrow.startBinding, arrow.endBinding]) {
      assert.equal(binding.elementId, "b-lifeline");
    }
    assert.deepEqual(fixedPointOf(arrow.startBinding, elements), points[0]);
    assert.deepEqual(fixedPointOf(arrow.endBinding, elements), points.at(-1));
    for (const element of [arrow, label, elements.get(`${id}-plate`)]) {
      assert.deepEqual(element.groupIds, [`${id}-message`, "b-participant"], `${element.id} moves with b`);
    }
    const [near, far] = direction > 0 ? [label.x, lineX("c")] : [label.x + label.width, lineX("a")];
    assert.ok(direction * (near - lineX("b")) > 32, `${id}: the label is beyond the loop`);
    assert.ok(direction * (far - (direction > 0 ? label.x + label.width : label.x)) > 8, `${id}: the label clears the next lifeline`);
  }
  const loop = globalPoints(elements.get("m2"));
  const labelBottom = (id) => elements.get(`${id}-label`).y + elements.get(`${id}-label`).height;
  assert.ok(elements.get("m2-label").y > Math.max(labelBottom("m1"), globalPoints(elements.get("m1"))[3][1]), "loops stack");
  assert.ok(elements.get("m3-label").y > Math.max(labelBottom("m2"), loop[3][1]), "the next step is below the loop");
});

const groupSpec = (style) => ({
  ...(style === undefined ? {} : { style }),
  groups: [
    { id: "client", label: "chartroom · browser", tone: "blue" },
    { id: "server", label: "bosun · FastAPI", tone: "violet" },
  ],
  participants: [
    { id: "a", group: "client" },
    { id: "b", group: "client" },
    { id: "c", group: "server" },
    { id: "d", tone: "gray", group: "server" },
  ],
  steps: [{ from: "a", to: "d", label: "load()" }],
});

test("a group labels its participants with a rule above their headers", async () => {
  const scene = await buildSequence(groupSpec());
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const header = (id) => elements.get(`${id}-header`);
  for (const [group, first, last, tone] of [["client", "a", "b", "blue"], ["server", "c", "d", "violet"]]) {
    const label = elements.get(`band-${group}-label`);
    const rule = elements.get(`band-${group}-rule`);
    assert.equal(rule.x, header(first).x, `${group}: the rule starts at the first header`);
    assert.equal(rule.x + rule.width, header(last).x + header(last).width, `${group}: the rule ends at the last header`);
    assert.ok(label.y + label.height <= rule.y && rule.y < header(first).y, `${group}: label, rule, then headers`);
    assert.equal(rule.strokeColor, DEFAULT_THEME.hues[tone][4]);
    assert.equal(label.strokeColor, DEFAULT_THEME.hues[tone][4]);
  }
  assert.equal(header("a").backgroundColor, DEFAULT_THEME.hues.blue[1], "a header takes the tone of its group");
  assert.equal(header("d").backgroundColor, DEFAULT_THEME.hues.gray[1], "a participant tone wins over the group tone");

  const sketch = byId(await buildSequence(groupSpec("sketch")));
  assert.equal(sketch.get("band-client-rule").strokeColor, DEFAULT_THEME.black);
  assert.equal(sketch.get("a-header").backgroundColor, DEFAULT_THEME.white);
});

test("a group must hold adjacent participants", async () => {
  const spec = groupSpec();
  spec.participants[3].group = "client";
  await assert.rejects(() => buildSequence(spec), (error) => error instanceof SpecError && /adjacent/.test(error.message));
  spec.participants[3].group = "nowhere";
  await assert.rejects(() => buildSequence(spec), /unknown group "nowhere"/);
});

const fragmentSpec = (style) => ({
  ...(style === undefined ? {} : { style }),
  participants: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
  steps: [
    { from: "a", to: "b", label: "open(id)" },
    { fragment: "alt", operands: [
      { guard: "first call", tone: "yellow", steps: [
        { from: "b", to: "c", label: "load()" },
        { from: "c", to: "b", label: "rows", reply: true },
      ] },
      { guard: "cached", steps: [{ self: "b", label: "hit()" }] },
    ] },
    { fragment: "loop", guard: "each row", steps: [{ from: "a", to: "b", label: "next()" }] },
    { from: "b", to: "a", label: "done", reply: true },
  ],
});

// The box around an element, for arrows from their points.
function box(element) {
  if (!element.points) return element;
  const points = globalPoints(element);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

test("a fragment frames its steps, with the kind in a tab and a guard per operand", async () => {
  const scene = await buildSequence(fragmentSpec());
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const order = new Map(scene.elements.map((element, index) => [element.id, index]));
  const lineX = (id) => elements.get(`${id}-line`).x;
  const alt = elements.get("f1");
  const loop = elements.get("f2");

  for (const id of ["m2", "m2-label", "m2-plate", "m3", "m3-label", "m4", "m4-label"]) {
    assert.ok(inside(box(elements.get(id)), alt), `${id} is in the alt frame`);
  }
  for (const id of ["m1", "m6"]) {
    const element = box(elements.get(id));
    assert.ok(element.y + element.height < alt.y || element.y > alt.y + alt.height, `${id} is outside the alt frame`);
  }
  assert.ok(inside(box(elements.get("m5")), loop), "the loop frames its message");
  assert.ok(alt.x > lineX("a") && alt.x < lineX("b"), "the frame starts between the lifelines");
  assert.ok(alt.x + alt.width > lineX("c") && alt.x + alt.width < lineX("d"), "the frame ends past its last lifeline");
  assert.ok(alt.y + alt.height < loop.y, "fragments stack");

  assert.equal(elements.get("f1-kind").text, "alt");
  assert.equal(elements.get("f2-kind").text, "loop");
  assert.ok(inside(elements.get("f1-kind"), box(elements.get("f1-tab"))), "the kind sits in the tab");
  assert.equal(elements.get("f1-op1-guard").text, "[first call]");
  assert.equal(elements.get("f1-op2-guard").text, "[cached]");
  assert.equal(elements.get("f2-op1-guard").text, "[each row]");
  const tab = box(elements.get("f1-tab"));
  assert.ok(elements.get("f1-op1-guard").x > tab.x + tab.width, "the first guard follows the tab");
  const tabPoints = elements.get("f1-tab").points;
  assert.deepEqual(tabPoints[0], tabPoints.at(-1), "the tab is a closed shape");
  assert.equal(elements.get("f1-tab").backgroundColor, DEFAULT_THEME.hues.yellow[0], "the tab hides the lifelines under it");
  assert.equal(elements.get("f2-tab").backgroundColor, DEFAULT_THEME.white);
  assert.ok(order.get("b-line") < order.get("f1-tab"));

  const divider = elements.get("f1-op2-divider");
  assert.equal(divider.strokeStyle, "dashed");
  assert.equal(divider.x, alt.x);
  assert.equal(divider.width, alt.width);
  assert.ok(box(elements.get("m3")).y < divider.y && divider.y < elements.get("f1-op2-guard").y);
  assert.ok(elements.get("f1-op2-guard").y < elements.get("m4-label").y);
  assert.equal(elements.has("f2-op2-divider"), false);

  const tint = elements.get("f1-op1-tint");
  assert.equal(tint.backgroundColor, DEFAULT_THEME.hues.yellow[0]);
  assert.deepEqual([tint.x, tint.y, tint.width, tint.y + tint.height], [alt.x, alt.y, alt.width, divider.y]);
  assert.ok(order.get("f1-op1-tint") < order.get("b-line"), "the tint is below the lifelines");
  assert.equal(elements.has("f1-op2-tint"), false, "an operand without a tone has no tint");
  assert.equal(elements.get("m2-plate").backgroundColor, DEFAULT_THEME.hues.yellow[0], "a plate takes the tint");
  assert.equal(elements.get("f1-op1-guard-plate").backgroundColor, DEFAULT_THEME.hues.yellow[0]);
  assert.equal(elements.get("m4-plate").backgroundColor, DEFAULT_THEME.white);
});

test("sketch fragments have no tint", async () => {
  const elements = byId(await buildSequence(fragmentSpec("sketch")));
  assert.equal(elements.has("f1-op1-tint"), false);
  assert.equal(elements.get("m2-plate").backgroundColor, DEFAULT_THEME.white);
  assert.equal(elements.get("f1").strokeColor, DEFAULT_THEME.black);
});

test("fragments check their kind and operands", async () => {
  const build = (fragment) => buildSequence({ participants: threeParticipants, steps: [fragment] });
  const message = { from: "a", to: "b" };
  await assert.rejects(() => build({ fragment: "maybe", steps: [message] }), /fragment must be one of alt, opt, loop, par/);
  await assert.rejects(() => build({ fragment: "alt", steps: [message] }), /alt needs operands/);
  await assert.rejects(() => build({ fragment: "opt", operands: [{ steps: [message] }] }), /opt has one operand/);
  await assert.rejects(() => build({ fragment: "opt", steps: [] }), /at least one step/);
});

test("a note sits over one lifeline or spans several", async () => {
  const wide = "EpisodeCatalog from memory, no disk read";
  const scene = await buildSequence({
    participants: threeParticipants,
    steps: [
      { from: "a", to: "b", label: "get()" },
      { note: wide, over: "b" },
      { fragment: "opt", guard: "cached", steps: [{ note: ["two", "lines"], over: ["a", "c"] }] },
      { from: "b", to: "a", label: "ok", reply: true },
    ],
  });
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const lineX = (id) => elements.get(`${id}-line`).x;
  const single = elements.get("n1");
  const text = elements.get("n1-text");
  assert.equal(text.text, wide);
  assert.equal(text.containerId, "n1");
  assert.ok(single.boundElements.some((bound) => bound.id === "n1-text"));
  assert.ok(inside(text, single));
  assert.equal(single.strokeStyle, "dashed");
  assert.ok(Math.abs(single.x + single.width / 2 - lineX("b")) < 0.5, "the note is centered on its lifeline");
  assert.ok(single.x > lineX("a") && single.x + single.width < lineX("c"), "neighbour lifelines clear the note");
  assert.deepEqual(single.groupIds, ["n1-note", "b-participant"], "a note over one lifeline moves with it");

  const span = elements.get("n2");
  assert.equal(elements.get("n2-text").text, "two\nlines");
  assert.ok(span.x < lineX("a") && span.x + span.width > lineX("c"), "the note spans its lifelines");
  assert.deepEqual(span.groupIds, ["n2-note"]);
  assert.ok(inside(span, elements.get("f1")), "the fragment frames the note");

  const bottom = (element) => box(element).y + box(element).height;
  assert.ok(bottom(elements.get("m1")) < single.y && bottom(single) < elements.get("f1").y);
  assert.ok(bottom(elements.get("f1")) < elements.get("m2-label").y);
});

test("an activation runs from its call to the reply, and messages bind to its edges", async () => {
  const scene = await buildSequence({
    participants: threeParticipants,
    steps: [
      { from: "a", to: "b", label: "open()", activate: true },
      { from: "b", to: "c", label: "load()" },
      { from: "c", to: "b", label: "rows", reply: true },
      { self: "b", label: "check()" },
      { self: "b", side: "left", label: "undo()" },
      { from: "b", to: "a", label: "done", reply: true },
      { from: "a", to: "b", label: "again()" },
      { from: "a", to: "c", label: "stream()", activate: true },
      { from: "c", to: "a", label: "chunk" },
    ],
  });
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const order = new Map(scene.elements.map((element, index) => [element.id, index]));
  const bar = elements.get("b-activation-1");
  const lineX = (id) => elements.get(`${id}-line`).x;
  const start = (id) => globalPoints(elements.get(id))[0];
  const end = (id) => globalPoints(elements.get(id)).at(-1);
  assert.equal(bar.x + bar.width / 2, lineX("b"), "the bar is on the lifeline");
  assert.ok(bar.y < end("m1")[1] && end("m6")[1] < bar.y + bar.height, "the bar runs from the call to the reply");
  assert.ok(bar.y + bar.height < elements.get("m7-label").y, "the reply closes the bar");
  assert.deepEqual(bar.groupIds, ["b-participant"]);
  assert.ok(order.get("b-line") < order.get(bar.id) && order.get(bar.id) < order.get("m1"));

  const left = bar.x;
  const right = bar.x + bar.width;
  for (const [id, point, edge] of [["m1", end("m1"), left], ["m2", start("m2"), right], ["m3", end("m3"), right],
    ["m4", start("m4"), right], ["m4", end("m4"), right], ["m5", start("m5"), left], ["m5", end("m5"), left],
    ["m6", start("m6"), left]]) {
    assert.equal(point[0], edge, `${id} meets the edge of the bar`);
  }
  for (const [binding, point] of [[elements.get("m1").endBinding, end("m1")], [elements.get("m2").startBinding, start("m2")],
    [elements.get("m4").startBinding, start("m4")]]) {
    assert.equal(binding.elementId, bar.id);
    assert.deepEqual(fixedPointOf(binding, elements), point);
  }
  assert.equal(end("m7")[0], lineX("b"), "after the reply, messages meet the lifeline again");
  assert.equal(elements.get("m7").endBinding.elementId, "b-lifeline");

  const open = elements.get("c-activation-1");
  assert.ok(open.y + open.height > start("m9")[1], "a bar without a reply lasts to the last message of its owner");
  const line = elements.get("c-line");
  assert.ok(open.y + open.height < line.y + line.points[1][1]);
  await assert.rejects(
    () => buildSequence({ participants: threeParticipants, steps: [{ from: "b", to: "a", reply: true, activate: true }] }),
    /a reply cannot activate/,
  );
});

test("the legend explains calls, replies, and tints, and the footnote closes the scene", async () => {
  const spec = (style, legend) => ({
    style,
    participants: [{ id: "a" }, { id: "b" }],
    steps: [{ from: "a", to: "b", label: "get()" }, { from: "b", to: "a", label: "ok", reply: true }],
    legend,
    footnote: ["A newer select() aborts the older getSpec():", "a slow answer never lands on a newer episode."],
  });
  const legend = [
    { message: "call", label: "call" },
    { message: "reply", label: "reply" },
    { tone: "yellow", label: "slow path" },
  ];
  const scene = await buildSequence(spec("clean", legend));
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  assert.equal(elements.get("legend-0-line").strokeStyle, "solid");
  assert.equal(elements.get("legend-1-line").strokeStyle, "dashed");
  assert.equal(elements.get("legend-2-swatch").backgroundColor, DEFAULT_THEME.hues.yellow[0], "a tone swatch shows the tint");
  const line = elements.get("a-line");
  const legendTop = Math.min(...scene.elements.filter((element) => element.id.startsWith("legend-")).map((element) => element.y));
  const legendBottom = Math.max(...scene.elements.filter((element) => element.id.startsWith("legend-"))
    .map((element) => element.y + element.height));
  assert.ok(legendTop > line.y + line.points[1][1], "the legend is below the lifelines");
  const footnote = elements.get("footnote");
  assert.equal(footnote.text, "A newer select() aborts the older getSpec():\na slow answer never lands on a newer episode.");
  assert.ok(footnote.y > legendBottom, "the footnote is below the legend");

  await assert.rejects(() => buildSequence(spec("sketch", legend)), (error) => error instanceof SpecError && /sketch/.test(error.message));
  await assert.rejects(() => buildSequence(spec("clean", [{ label: "what" }])), /legend\[0\] needs message or tone/);
  await assert.rejects(() => buildSequence(spec("clean", [{ message: "event", label: "x" }])), /message must be "call" or "reply"/);
});

test("invalid steps report where they are", async () => {
  const build = (step) => buildSequence({ participants: threeParticipants, steps: [step] });
  await assert.rejects(() => build({ from: "a", to: "x" }), /steps\[0\]\.to: unknown participant "x"/);
  await assert.rejects(() => build({ from: "a", to: "a" }), /self-call/);
  await assert.rejects(() => build({ self: "a", side: "up" }), /side must be "left" or "right"/);
  await assert.rejects(() => build({ note: "n", over: ["a", "b", "c"] }), /over must name one participant or two/);
  await assert.rejects(() => build({ label: "lost" }), /steps\[0\] needs from and to, self, note, or fragment/);
  await assert.rejects(() => buildSequence({ participants: [] }), /at least one participant/);
  await assert.rejects(() => buildSequence({ participants: [{ id: "a" }, { id: "a" }] }), /duplicate participant "a"/);
});

test("each operand of an alt starts with the bars that were open at the fragment", async () => {
  const scene = await buildSequence({
    participants: threeParticipants,
    steps: [
      { from: "a", to: "b", label: "find(id)", activate: true },
      { fragment: "alt", operands: [
        { guard: "found", steps: [{ from: "b", to: "a", label: "row", reply: true }] },
        { guard: "missing", steps: [{ from: "b", to: "c", label: "log()" }, { from: "b", to: "a", label: "404", reply: true }] },
      ] },
      { from: "a", to: "b", label: "next()" },
    ],
  });
  const elements = byId(scene);
  const bar = elements.get("b-activation-1");
  const start = (id) => globalPoints(elements.get(id))[0];
  assert.equal(start("m3")[0], bar.x + bar.width, "the second operand still calls from the bar");
  assert.equal(start("m4")[0], bar.x, "the second reply leaves the bar");
  assert.equal(elements.get("m4").startBinding.elementId, bar.id);
  assert.ok(bar.y + bar.height > start("m4")[1], "the bar reaches the last reply");
  assert.equal(elements.get("m5").endBinding.elementId, "b-lifeline", "every operand closed the bar");
});

test("after a scene edit moves a participant, rebindScene puts arrows and labels back", async () => {
  const scene = await buildSequence({
    participants: threeParticipants,
    steps: [
      { from: "a", to: "b", label: "open()", activate: true },
      { self: "b", label: "check()" },
      { from: "b", to: "c", label: "load()" },
      { from: "b", to: "a", label: "done", reply: true },
    ],
  });
  // A model edit: move the participant group of b 120 px to the right.
  for (const element of scene.elements) {
    if (element.groupIds.includes("b-participant")) element.x += 120;
  }
  const result = rebindScene(scene);
  assert.equal(result, scene, "the scene changes in place");
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  for (const arrow of scene.elements.filter((element) => element.type === "arrow")) {
    const points = globalPoints(arrow);
    assert.deepEqual(points[0], fixedPointOf(arrow.startBinding, elements), `${arrow.id} starts on its binding`);
    assert.deepEqual(points.at(-1), fixedPointOf(arrow.endBinding, elements), `${arrow.id} ends on its binding`);
  }
  const bar = elements.get("b-activation-1");
  assert.equal(globalPoints(elements.get("m1")).at(-1)[0], bar.x, "the call still meets the bar");
  for (const id of ["m1", "m3", "m4"]) {
    const points = globalPoints(elements.get(id));
    const label = elements.get(`${id}-label`);
    const plate = elements.get(`${id}-plate`);
    assert.equal(points.length, 2);
    assert.equal(points[0][1], points[1][1], `${id} stays horizontal`);
    assert.ok(Math.abs(label.x + label.width / 2 - (points[0][0] + points[1][0]) / 2) < 0.5, `${id}: the label is centered again`);
    assert.ok(inside(label, plate), `${id}: the plate follows the label`);
  }
  const loop = globalPoints(elements.get("m2"));
  assert.equal(loop[0][0], bar.x + bar.width, "the loop moved with its participant");
});

test("participants stand in a row, each with a lifeline of one length", async () => {
  const scene = await buildSequence({
    participants: [
      { id: "page", name: "EpisodesPage", sub: ["lab-episodes-", "feature"] },
      { id: "api" },
      { id: "disk", sub: "results/" },
    ],
    steps: [],
  });
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const headers = ["page", "api", "disk"].map((id) => elements.get(`${id}-header`));
  for (const header of headers) {
    assert.equal(header.y, headers[0].y, `${header.id} is in the row`);
    assert.equal(header.height, headers[0].height, `${header.id} has the row height`);
  }
  for (let index = 1; index < headers.length; index += 1) {
    assert.ok(headers[index - 1].x + headers[index - 1].width < headers[index].x, "headers do not overlap");
  }
  assert.equal(elements.get("api-name").text, "api", "the name defaults to the id");
  assert.equal(elements.get("page-sub").text, "lab-episodes-\nfeature");
  assert.ok(inside(elements.get("page-name"), elements.get("page-header")));
  assert.ok(inside(elements.get("page-sub"), elements.get("page-header")));

  const lines = ["page", "api", "disk"].map((id) => elements.get(`${id}-line`));
  headers.forEach((header, index) => {
    const line = lines[index];
    assert.equal(line.x, header.x + header.width / 2, "the lifeline starts at the header center");
    assert.equal(line.y, header.y + header.height, "the lifeline starts under the header");
    assert.equal(line.points.at(-1)[1], lines[0].points.at(-1)[1], "lifelines have one length");
    assert.equal(line.strokeStyle, "dashed");
  });
  for (const id of ["page-header", "page-name", "page-sub", "page-line", "page-lifeline"]) {
    assert.deepEqual(elements.get(id).groupIds, ["page-participant"], `${id} moves with its participant`);
  }
});
