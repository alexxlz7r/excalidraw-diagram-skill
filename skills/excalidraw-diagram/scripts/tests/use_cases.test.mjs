import assert from "node:assert/strict";
import test from "node:test";

import { validateExcalidraw } from "../export_excalidraw.mjs";
import { PALETTE, rebindScene } from "../scene.mjs";
import { buildUseCases, SpecError } from "../use_cases.mjs";

function byId(scene) {
  return new Map(scene.elements.map((element) => [element.id, element]));
}

const inside = (inner, outer) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
  && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;
const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function globalPoints(arrow) {
  return arrow.points.map(([px, py]) => [arrow.x + px, arrow.y + py]);
}

// How far a point is from the outline of a shape.
function outlineDistance(shape, [px, py]) {
  const rx = shape.width / 2;
  const ry = shape.height / 2;
  const dx = Math.abs(px - (shape.x + rx));
  const dy = Math.abs(py - (shape.y + ry));
  if (shape.type === "ellipse") return Math.abs(Math.hypot(dx / rx, dy / ry) - 1) * Math.min(rx, ry);
  return Math.abs(Math.max(dx - rx, dy - ry));
}

// A shop: a customer on the left, a support agent on the right.
const shop = {
  system: "Web shop",
  actors: [
    { id: "customer", name: "Customer", primary: true },
    { id: "support", name: ["Support", "agent"], side: "right" },
  ],
  journeys: [
    { id: "buy", label: "Buy", tone: "blue" },
    { id: "care", label: "After sale", tone: "green" },
  ],
  cases: [
    { id: "browse", name: "Browse catalog", journey: "buy", primary: true },
    { id: "checkout", name: "Check out", journey: "buy", primary: true },
    { id: "pay", name: "Pay by card", journey: "buy" },
    { id: "refund", name: "Approve refund", journey: "care" },
  ],
  links: [
    { from: "customer", to: "browse" },
    { from: "customer", to: "checkout" },
    { from: "checkout", to: "pay", label: "includes" },
    { from: "support", to: "refund" },
    { from: "customer", to: "refund" },
  ],
};

test("actors are stick figures outside the system, and use cases are ovals inside it", async () => {
  const scene = await buildUseCases(shop);
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const system = elements.get("system");
  assert.equal(system.type, "rectangle");
  assert.equal(elements.get("system-label").text, "Web shop");

  for (const id of ["customer", "support"]) {
    const actor = elements.get(id);
    assert.equal(actor.type, "rectangle", `${id} takes the bindings on a box`);
    assert.equal(actor.strokeColor, "transparent");
    assert.ok(!overlaps(actor, system), `${id} stands outside the system`);
    // The box fits the figure, so lines meet the figure; the name is below it.
    const parts = ["head", "body", "arms", "legs"].map((part) => elements.get(`${id}-${part}`));
    assert.equal(parts[0].type, "ellipse");
    for (const part of parts) assert.ok(inside(part, actor), `${part.id} is inside the actor box`);
    const name = elements.get(`${id}-name`);
    assert.ok(name.y >= actor.y + actor.height, `${id}: the name is below the figure`);
    for (const part of [...parts, name]) assert.deepEqual(part.groupIds, actor.groupIds, `${part.id} moves with the actor`);
    assert.equal(actor.width, 36, `${id}: the box is as wide as the figure`);
  }
  assert.equal(elements.get("support-name").text, "Support\nagent");

  for (const id of ["browse", "checkout", "pay", "refund"]) {
    const useCase = elements.get(id);
    assert.equal(useCase.type, "ellipse");
    assert.ok(inside(useCase, system), `the system holds ${id}`);
    const name = elements.get(`${id}-text`);
    assert.equal(name.containerId, id);
    assert.ok(inside(name, useCase), `${id} holds its name`);
  }
});

test("actors stand on their side; they join use cases with plain lines, and use cases join with labeled dashed arrows", async () => {
  const scene = await buildUseCases(shop);
  const elements = byId(scene);
  const system = elements.get("system");
  const customer = elements.get("customer");
  const support = elements.get("support");
  assert.ok(customer.x + customer.width <= system.x, "the customer stands left of the system");
  assert.ok(support.x >= system.x + system.width, "the support agent stands right of the system");

  shop.links.forEach((link, index) => {
    const arrow = elements.get(`l${index + 1}`);
    const points = globalPoints(arrow);
    const ends = [arrow.startBinding.elementId, arrow.endBinding.elementId];
    assert.deepEqual([...ends].sort(), [link.from, link.to].sort(), `${arrow.id} joins ${link.from} and ${link.to}`);
    for (const [binding, point] of [[arrow.startBinding, points[0]], [arrow.endBinding, points.at(-1)]]) {
      assert.ok(outlineDistance(elements.get(binding.elementId), point) < 1, `${arrow.id} ends on ${binding.elementId}`);
    }
  });
  for (const [id, actor] of [["l1", customer], ["l2", customer], ["l5", customer]]) {
    const start = globalPoints(elements.get(id))[0];
    assert.ok(Math.abs(start[1] - (actor.y + actor.height / 2)) < 1, `${id} meets the customer at the middle of its side`);
  }
  const association = elements.get("l1");
  assert.deepEqual([association.startArrowhead, association.endArrowhead, association.strokeStyle], [null, null, "solid"]);
  const includes = elements.get("l3");
  assert.deepEqual([includes.startBinding.elementId, includes.endBinding.elementId], ["checkout", "pay"]);
  assert.deepEqual([includes.endArrowhead, includes.strokeStyle], ["arrow", "dashed"]);
  assert.equal(elements.get("l3-label").text, "includes");
  assert.equal(elements.get("l3-label").containerId, "l3");

  await assert.rejects(buildUseCases({ ...shop, links: [{ from: "customer", to: "support" }] }),
    (error) => error instanceof SpecError && /links\[0\]: an actor joins only use cases/.test(error.message));
  await assert.rejects(buildUseCases({ ...shop, links: [{ from: "customer", to: "nowhere" }] }),
    (error) => error instanceof SpecError && /links\[0\]: unknown actor or use case "nowhere"/.test(error.message));
});

test("journeys group use cases inside the system and give them a hue; primary items read first", async () => {
  const scene = await buildUseCases(shop);
  const elements = byId(scene);
  const system = elements.get("system");
  const [buy, care] = [elements.get("journey-buy"), elements.get("journey-care")];
  for (const journey of [buy, care]) assert.ok(inside(journey, system), `the system holds ${journey.id}`);
  assert.ok(!overlaps(buy, care));
  for (const [id, journey] of [["browse", buy], ["checkout", buy], ["pay", buy], ["refund", care]]) {
    assert.ok(inside(elements.get(id), journey), `${journey.id} holds ${id}`);
  }
  assert.equal(elements.get("journey-buy-label").text, "Buy");
  const order = new Map(scene.elements.map((element, index) => [element.id, index]));
  const lastLink = Math.max(...scene.elements.filter((element) => /^l\d+$/.test(element.id)).map((link) => order.get(link.id)));
  for (const id of ["system", "journey-buy", "journey-care"]) {
    assert.ok(order.get(`${id}-label`) > lastLink, `the label of ${id} is drawn over the links`);
  }
  assert.equal(elements.get("pay").strokeColor, PALETTE.shades.blue[4]);
  assert.equal(elements.get("pay").backgroundColor, PALETTE.shades.blue[0]);
  assert.equal(elements.get("refund").strokeColor, PALETTE.shades.green[4]);

  assert.equal(elements.get("checkout").strokeWidth, 3, "a primary use case has a strong outline");
  assert.equal(elements.get("checkout").backgroundColor, PALETTE.shades.blue[1], "and a stronger fill");
  assert.equal(elements.get("pay").strokeWidth, 2);
  assert.equal(elements.get("customer-body").strokeWidth, 3, "the primary actor is drawn stronger");
  assert.equal(elements.get("support-body").strokeWidth, 2);

  const sketch = byId(await buildUseCases({ ...shop, style: "sketch" }));
  assert.deepEqual([sketch.get("pay").strokeColor, sketch.get("pay").backgroundColor], [PALETTE.black, PALETTE.white]);
  assert.equal(sketch.get("checkout").strokeWidth, 3, "sketch keeps the primary outline");
});

test("journeys nest: an inner journey sits inside its parent, one fill level deeper", async () => {
  const nested = {
    ...shop,
    journeys: [...shop.journeys, { id: "pay", label: "Payment", parent: "buy", tone: "violet" }],
    cases: shop.cases.map((useCase) => (useCase.id === "pay" ? { ...useCase, id: "card", journey: "pay" } : useCase)),
    links: shop.links.map((link) => (link.to === "pay" ? { ...link, to: "card" } : link)),
  };
  for (const style of ["clean", "sketch"]) {
    const scene = await buildUseCases({ ...nested, style });
    assert.deepEqual(validateExcalidraw(scene), []);
    const elements = byId(scene);
    const order = new Map(scene.elements.map((element, index) => [element.id, index]));
    const [system, buy, pay] = ["system", "journey-buy", "journey-pay"].map((id) => elements.get(id));
    assert.ok(inside(pay, buy), `${style}: the inner journey is inside its parent`);
    assert.ok(inside(buy, system), `${style}: the parent stays inside the system`);
    assert.ok(order.get(buy.id) < order.get(pay.id), `${style}: the inner journey is drawn over its parent`);
    assert.ok(inside(elements.get("card"), pay), `${style}: the inner journey holds its use case`);
    for (const id of ["browse", "checkout"]) {
      assert.ok(!overlaps(elements.get(id), pay), `${style}: ${id} of the parent stays outside the inner journey`);
    }
  }
  const clean = byId(await buildUseCases(nested));
  assert.equal(clean.get("journey-buy").fillStyle, "cross-hatch");
  assert.equal(clean.get("journey-pay").fillStyle, "solid");
});

test("invalid use-case specs report where the problem is", async () => {
  const cases = [
    [{ ...shop, cases: [{ id: "x", journey: "lost" }] }, /cases\[0\]: unknown journey "lost"/],
    [{ ...shop, journeys: [{ id: "a", parent: "b" }, { id: "b", parent: "a" }] }, /journey "a" is inside itself/],
    [{ ...shop, journeys: [{ id: "a", parent: "system" }] }, /journeys\[0\]: unknown parent "system"/],
    [{ ...shop, actors: [{ id: "a", side: "top" }] }, /actors\[0\]\.side/],
    [{ ...shop, cases: [{ id: "customer" }] }, /duplicate use case "customer"/],
    [{ ...shop, cases: [] }, /at least one use case/],
  ];
  for (const [spec, pattern] of cases) {
    await assert.rejects(buildUseCases(spec), (error) => error instanceof SpecError && pattern.test(error.message), String(pattern));
  }
});

test("after a scene edit moves an actor, rebindScene puts the lines back", async () => {
  const scene = await buildUseCases(shop);
  const elements = byId(scene);
  for (const element of scene.elements) {
    if (element.groupIds.includes("customer-actor")) {
      element.x -= 50;
      element.y += 30;
    }
  }
  rebindScene(scene);
  for (const id of ["l1", "l2", "l5"]) {
    const arrow = elements.get(id);
    const points = globalPoints(arrow);
    for (const [binding, point] of [[arrow.startBinding, points[0]], [arrow.endBinding, points.at(-1)]]) {
      assert.ok(outlineDistance(elements.get(binding.elementId), point) < 1, `${id} ends on ${binding.elementId}`);
    }
  }
});
