import assert from "node:assert/strict";
import test from "node:test";

import { validateExcalidraw } from "../export_excalidraw.mjs";
import { buildArchitecture, SpecError } from "../architecture.mjs";
import { PALETTE, rebindScene } from "../scene.mjs";

function byId(scene) {
  return new Map(scene.elements.map((element) => [element.id, element]));
}

const inside = (inner, outer) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
  && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

// A small web system: a person, a service, a store, and an external system.
const shop = {
  components: [
    { id: "browser", kind: "external", name: "Browser" },
    { id: "api", name: "shop-api", sub: ["FastAPI", ":8000"] },
    { id: "db", kind: "store", name: "orders", sub: "PostgreSQL" },
    { id: "psp", kind: "external", name: ["Payment", "provider"] },
  ],
  links: [
    { from: "browser", to: "api", label: "HTTPS" },
    { from: "api", to: "db", label: "SQL" },
    { from: "api", to: "psp", label: "charge" },
  ],
};

test("each component kind has its own shape, with the name and the sub lines inside", async () => {
  const scene = await buildArchitecture(shop);
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);

  const api = elements.get("api");
  assert.equal(api.type, "rectangle");
  assert.deepEqual(api.roundness, { type: 3 });
  const name = elements.get("api-name");
  const sub = elements.get("api-sub");
  assert.equal(name.text, "shop-api");
  assert.equal(sub.text, "FastAPI\n:8000");
  assert.notEqual(sub.fontFamily, name.fontFamily, "sub lines use the code font");
  assert.ok(name.y + name.height <= sub.y, "the name stands above the sub lines");
  for (const text of [name, sub]) {
    assert.ok(inside(text, api), `api holds ${text.id}`);
    assert.deepEqual(text.groupIds, api.groupIds, `${text.id} moves with api`);
  }

  // A store is a cylinder: two end ellipses and a body. A transparent box
  // over the whole cylinder takes the bindings.
  const db = elements.get("db");
  assert.equal(db.type, "rectangle");
  assert.equal(db.strokeColor, "transparent");
  assert.equal(db.backgroundColor, "transparent");
  const top = elements.get("db-top");
  const bottom = elements.get("db-bottom");
  for (const cap of [top, bottom]) {
    assert.equal(cap.type, "ellipse");
    assert.equal(cap.width, db.width);
    assert.ok(inside(cap, db));
  }
  assert.equal(top.y, db.y);
  assert.equal(bottom.y + bottom.height, db.y + db.height);
  const order = new Map(scene.elements.map((element, index) => [element.id, index]));
  assert.ok(order.get("db-body") < order.get("db-top"), "the top cap covers the body");
  assert.ok(inside(elements.get("db-name"), db) && elements.get("db-name").y > top.y + top.height / 2,
    "the name sits below the top cap");
  for (const part of ["db-top", "db-bottom", "db-body", "db-name", "db-sub"]) {
    assert.deepEqual(elements.get(part).groupIds, db.groupIds, `${part} moves with the store`);
  }

  for (const id of ["browser", "psp"]) {
    const external = elements.get(id);
    assert.equal(external.type, "ellipse");
    assert.ok(inside(elements.get(`${id}-name`), external), `${id} holds its name`);
  }
  assert.equal(elements.get("psp-name").text, "Payment\nprovider");
});

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

// Where Excalidraw draws an arrow label.
function labelCenter(arrow) {
  const points = globalPoints(arrow);
  const middle = Math.floor(points.length / 2);
  if (points.length % 2 === 1) return points[middle];
  return [(points[middle - 1][0] + points[middle][0]) / 2, (points[middle - 1][1] + points[middle][1]) / 2];
}

test("links are arrows bound at both ends, with the label bound on the arrow", async () => {
  const elements = byId(await buildArchitecture(shop));
  shop.links.forEach((link, index) => {
    const arrow = elements.get(`l${index + 1}`);
    assert.equal(arrow.type, "arrow");
    const points = globalPoints(arrow);
    for (const [end, point, owner] of [["startBinding", points[0], link.from], ["endBinding", points.at(-1), link.to]]) {
      const binding = arrow[end];
      const target = elements.get(owner);
      assert.equal(binding.elementId, owner);
      assert.equal(binding.mode, "inside");
      assert.ok(target.boundElements.some((bound) => bound.id === arrow.id));
      assert.ok(outlineDistance(target, point) < 1, `${arrow.id} ${end} sits on the outline of ${owner}`);
    }
    const straight = points.every(([px]) => px === points[0][0]) || points.every(([, py]) => py === points[0][1]);
    if (straight) assert.equal(points.length, 2, `${arrow.id} is straight, so it has two points`);
    const label = elements.get(`${arrow.id}-label`);
    assert.equal(label.text, link.label);
    assert.equal(label.containerId, arrow.id);
    const [cx, cy] = labelCenter(arrow);
    assert.ok(Math.abs(label.x + label.width / 2 - cx) < 1 && Math.abs(label.y + label.height / 2 - cy) < 1,
      `${arrow.id} label sits where Excalidraw draws it`);
  });
});

test("the kind of a link sets its dash, both sets two arrowheads, and tone colors it in clean", async () => {
  const spec = {
    components: ["a", "b", "c", "d", "e"].map((id) => ({ id })),
    links: [
      { from: "a", to: "b" },
      { from: "a", to: "c", kind: "async" },
      { from: "a", to: "d", kind: "generated" },
      { from: "a", to: "e", both: true, tone: "red" },
    ],
  };
  const looks = (elements) => ["l1", "l2", "l3", "l4"].map((id) => {
    const { strokeStyle, strokeColor, startArrowhead, endArrowhead } = elements.get(id);
    return { strokeStyle, strokeColor, startArrowhead, endArrowhead };
  });
  const ink = PALETTE.black;
  assert.deepEqual(looks(byId(await buildArchitecture({ ...spec, style: "clean" }))), [
    { strokeStyle: "solid", strokeColor: ink, startArrowhead: null, endArrowhead: "arrow" },
    { strokeStyle: "dashed", strokeColor: ink, startArrowhead: null, endArrowhead: "arrow" },
    { strokeStyle: "dotted", strokeColor: ink, startArrowhead: null, endArrowhead: "arrow" },
    { strokeStyle: "solid", strokeColor: PALETTE.shades.red[4], startArrowhead: "arrow", endArrowhead: "arrow" },
  ]);
  const sketch = looks(byId(await buildArchitecture({ ...spec, style: "sketch" })));
  assert.equal(sketch[3].strokeColor, ink, "sketch has no colors");
  await assert.rejects(buildArchitecture({ ...spec, links: [{ from: "a", to: "b", kind: "rpc" }] }),
    (error) => error instanceof SpecError && /links\[0\]\.kind/.test(error.message));
});

test("a role gives its components one hue in clean; sketch draws them in ink", async () => {
  const spec = {
    roles: [{ id: "app", label: "application", tone: "orange" }, { id: "data", label: "storage", tone: "yellow" }],
    components: [
      { id: "web", role: "app" },
      { id: "api", role: "app" },
      { id: "db", kind: "store", role: "data" },
      { id: "cdn", tone: "cyan" },
      { id: "plain" },
    ],
  };
  const clean = byId(await buildArchitecture(spec));
  const colors = (id) => [clean.get(id).backgroundColor, clean.get(id).strokeColor];
  assert.deepEqual(colors("web"), [PALETTE.shades.orange[0], PALETTE.shades.orange[4]]);
  assert.deepEqual(colors("api"), colors("web"));
  assert.deepEqual(colors("db-top"), [PALETTE.shades.yellow[0], PALETTE.shades.yellow[4]]);
  assert.deepEqual(colors("cdn"), [PALETTE.shades.cyan[0], PALETTE.shades.cyan[4]], "a tone overrides the role");
  assert.deepEqual(colors("plain"), [PALETTE.shades.gray[0], PALETTE.shades.gray[4]]);

  const sketch = byId(await buildArchitecture({ ...spec, style: "sketch" }));
  assert.deepEqual([sketch.get("web").backgroundColor, sketch.get("web").strokeColor], [PALETTE.white, PALETTE.black]);

  await assert.rejects(buildArchitecture({ ...spec, components: [{ id: "x", role: "cache" }] }),
    (error) => error instanceof SpecError && /components\[0\]: unknown role "cache"/.test(error.message));
});

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// A workspace with two scopes, a user outside it, and a backend below it.
const workspace = {
  zones: [
    { id: "client", label: "client · Angular workspace" },
    { id: "lab", label: "scope:lab", parent: "client", tone: "blue" },
    { id: "shared", label: "scope:shared", parent: "client" },
  ],
  components: [
    { id: "user", kind: "external", name: "User" },
    { id: "shell", name: "lab-shell", zone: "lab" },
    { id: "episodes", name: "lab-episodes", zone: "lab" },
    { id: "api", name: "shared-api", zone: "shared" },
    { id: "backend", name: "bosun" },
  ],
  links: [
    { from: "user", to: "client", label: "HTTP :4200" },
    { from: "shell", to: "episodes", kind: "async" },
    { from: "episodes", to: "api" },
    { from: "api", to: "backend", label: "HTTP /api" },
  ],
};

test("zones nest, hold their components, and take links on their outline", async () => {
  const scene = await buildArchitecture(workspace);
  assert.deepEqual(validateExcalidraw(scene), []);
  const elements = byId(scene);
  const order = new Map(scene.elements.map((element, index) => [element.id, index]));
  const [client, lab, shared] = ["client", "lab", "shared"].map((id) => elements.get(`zone-${id}`));
  for (const zone of [lab, shared]) {
    assert.ok(inside(zone, client), `${zone.id} is inside the client zone`);
    assert.ok(order.get(client.id) < order.get(zone.id), `${zone.id} is drawn over the client zone`);
  }
  assert.ok(!overlaps(lab, shared));
  assert.equal(client.fillStyle, "hachure");
  assert.equal(lab.fillStyle, "cross-hatch");
  assert.equal(lab.backgroundColor, PALETTE.shades.blue[1]);
  for (const [id, zone] of [["shell", lab], ["episodes", lab], ["api", shared]]) {
    assert.ok(inside(elements.get(id), zone), `${zone.id} holds ${id}`);
  }
  for (const id of ["user", "backend"]) assert.ok(!overlaps(elements.get(id), client), `${id} is outside the client zone`);

  const entry = elements.get("l1");
  assert.equal(entry.endBinding.elementId, "zone-client");
  const end = globalPoints(entry).at(-1);
  assert.ok(outlineDistance(client, end) < 1, "the link ends on the zone outline");

  const lastLink = Math.max(...scene.elements.filter((element) => /^l\d+$/.test(element.id)).map((arrow) => order.get(arrow.id)));
  for (const id of ["client", "lab", "shared"]) {
    assert.ok(order.get(`zone-${id}-label`) > lastLink, `the label of ${id} is drawn over the links`);
    assert.ok(inside(elements.get(`zone-${id}-label`), elements.get(`zone-${id}-plate`)));
  }
});

test("links that cross one side of a zone stay 24 px apart", async () => {
  const scene = await buildArchitecture({
    zones: [{ id: "client" }, { id: "lab", parent: "client" }, { id: "shared", parent: "client" }],
    components: [
      { id: "app", zone: "client" },
      { id: "shell", zone: "lab" },
      { id: "feature", zone: "lab" },
      { id: "chrome", zone: "shared" },
      { id: "api", zone: "shared" },
    ],
    links: [
      { from: "app", to: "shell" },
      { from: "shell", to: "feature", kind: "async" },
      { from: "app", to: "chrome" },
      { from: "lab", to: "shared" },
      { from: "shell", to: "chrome", kind: "async" },
    ],
  });
  const shared = byId(scene).get("zone-shared");
  const crossings = [];
  for (const arrow of scene.elements.filter((element) => element.type === "arrow")) {
    const points = globalPoints(arrow);
    for (const [index, point] of points.slice(1).entries()) {
      const before = points[index];
      if (Math.abs(before[0] - point[0]) < 0.5
        && Math.min(before[1], point[1]) <= shared.y && Math.max(before[1], point[1]) >= shared.y) crossings.push(point[0]);
    }
  }
  crossings.sort((a, b) => a - b);
  assert.ok(crossings.length >= 3);
  for (const [index, x] of crossings.slice(1).entries()) {
    assert.ok(x - crossings[index] >= 24 - 0.5, `links cross the zone top ${(x - crossings[index]).toFixed(1)} px apart`);
  }
});

test("parallel runs of links between two layers stay 20 px apart", async () => {
  const scene = await buildArchitecture({
    components: ["a", "b", "c", "x", "y", "z"].map((id) => ({ id })),
    links: [
      { from: "c", to: "y" },
      { from: "c", to: "x" },
      { from: "b", to: "x" },
      { from: "a", to: "z" },
      { from: "a", to: "x" },
    ],
  });
  const runs = [];
  for (const arrow of scene.elements.filter((element) => element.type === "arrow")) {
    const points = globalPoints(arrow);
    for (const [index, point] of points.slice(1).entries()) {
      const before = points[index];
      if (Math.abs(before[1] - point[1]) < 0.5 && Math.abs(before[0] - point[0]) > 20) {
        runs.push({ id: arrow.id, y: point[1], from: Math.min(before[0], point[0]), to: Math.max(before[0], point[0]) });
      }
    }
  }
  assert.ok(runs.length >= 2);
  for (const [index, run] of runs.entries()) {
    for (const other of runs.slice(index + 1)) {
      if (other.id === run.id || Math.min(run.to, other.to) - Math.max(run.from, other.from) <= 0) continue;
      assert.ok(Math.abs(run.y - other.y) >= 20 - 0.5, `${run.id} and ${other.id} run ${Math.abs(run.y - other.y).toFixed(1)} px apart`);
    }
  }
});

test("zone references are checked", async () => {
  const cases = [
    [{ ...workspace, components: [{ id: "x", zone: "nowhere" }] }, /components\[0\]: unknown zone "nowhere"/],
    [{ ...workspace, zones: [{ id: "a", parent: "b" }, { id: "b", parent: "a" }] }, /zone "a" is inside itself/],
    [{ ...workspace, zones: [{ id: "a", parent: "z" }] }, /zones\[0\]: unknown parent "z"/],
    [{ ...workspace, zones: [{ id: "user" }] }, /duplicate/],
    [{ ...workspace, links: [{ from: "user", to: "nowhere" }] }, /links\[0\]: unknown component or zone "nowhere"/],
  ];
  for (const [spec, pattern] of cases) {
    await assert.rejects(buildArchitecture(spec), (error) => error instanceof SpecError && pattern.test(error.message), String(pattern));
  }
});

test("the legend explains roles and link kinds by itself, or lists the items of the spec", async () => {
  const spec = {
    roles: [{ id: "app", label: "application", tone: "orange" }, { id: "data", label: "storage", tone: "yellow" }],
    components: [{ id: "web", role: "app" }, { id: "db", kind: "store", role: "data" }, { id: "jobs", role: "app" }],
    links: [{ from: "web", to: "db" }, { from: "web", to: "jobs", kind: "async" }],
    footnote: "Jobs run on the same host.",
  };
  const legend = (scene) => scene.elements.filter((element) => /^legend-\d+-label$/.test(element.id)).map((element) => element.text);

  const auto = await buildArchitecture(spec);
  assert.deepEqual(legend(auto), ["application", "storage", "call", "async"]);
  const elements = byId(auto);
  assert.equal(elements.get("legend-0-swatch").backgroundColor, PALETTE.shades.orange[0]);
  assert.equal(elements.get("legend-3-line").strokeStyle, "dashed");
  assert.equal(auto.elements.at(-1).id, "footnote");

  const oneKind = await buildArchitecture({ ...spec, roles: [], components: spec.components.map(({ role, ...rest }) => rest),
    links: [spec.links[0]] });
  assert.deepEqual(legend(oneKind), [], "one link kind and no roles need no legend");

  const explicit = await buildArchitecture({ ...spec, legend: [{ link: "async", label: "lazy route" }, { role: "data" }] });
  assert.deepEqual(legend(explicit), ["lazy route", "storage"]);

  assert.deepEqual(legend(await buildArchitecture({ ...spec, style: "sketch" })), ["call", "async"], "sketch has no role colors");
  await assert.rejects(buildArchitecture({ ...spec, style: "sketch", legend: [{ role: "app" }] }),
    (error) => error instanceof SpecError && /legend\[0\]/.test(error.message));
  await assert.rejects(buildArchitecture({ ...spec, legend: [{ role: "cache" }] }),
    (error) => error instanceof SpecError && /legend\[0\]: unknown role "cache"/.test(error.message));
});

test("a proposed component has a dashed outline", async () => {
  const elements = byId(await buildArchitecture({
    components: [
      { id: "svc", proposed: true },
      { id: "db", kind: "store", proposed: true },
      { id: "ext", kind: "external", proposed: true },
      { id: "real" },
    ],
  }));
  for (const id of ["svc", "db-top", "db-bottom", "db-left", "db-right", "ext"]) {
    assert.equal(elements.get(id).strokeStyle, "dashed", `${id} is dashed`);
  }
  assert.equal(elements.get("real").strokeStyle, "solid");
});

test("after a scene edit moves a component, rebindScene puts links and labels back", async () => {
  const scene = await buildArchitecture(shop);
  const elements = byId(scene);
  for (const element of scene.elements) {
    if (element.groupIds.includes("db-component")) {
      element.x += 60;
      element.y += 40;
    }
  }
  rebindScene(scene);
  shop.links.forEach((link, index) => {
    const arrow = elements.get(`l${index + 1}`);
    const points = globalPoints(arrow);
    assert.ok(outlineDistance(elements.get(link.from), points[0]) < 1, `${arrow.id} starts on ${link.from}`);
    assert.ok(outlineDistance(elements.get(link.to), points.at(-1)) < 1, `${arrow.id} ends on ${link.to}`);
    const label = elements.get(`${arrow.id}-label`);
    const [cx, cy] = labelCenter(arrow);
    assert.ok(Math.abs(label.x + label.width / 2 - cx) < 1 && Math.abs(label.y + label.height / 2 - cy) < 1,
      `${arrow.id} label follows its arrow`);
  });
});
