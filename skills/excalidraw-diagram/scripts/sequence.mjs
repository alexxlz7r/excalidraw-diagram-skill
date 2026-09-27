#!/usr/bin/env node
/** Generate an Excalidraw sequence diagram from a compact JSON spec. */

import {
  appendFootnote,
  appendLegend,
  asArray,
  bindArrow,
  bounds,
  drawHeading,
  fillOf,
  measure,
  requireId,
  resolveStyle,
  runGenerator,
  SceneBuilder,
  sceneDocument,
  shade,
  SpecError,
  strokeOf,
  textOf,
  translate,
} from "./scene.mjs";

export { SpecError } from "./scene.mjs";

// Insets of the text in a participant header, and the space between headers.
const HEADER = { padX: 14, padY: 10, lineGap: 4, gap: 24 };
// A group band: a label and a rule above the headers of its participants.
const BAND = { ruleGap: 4, headerGap: 12 };
// Space between the headers and the first step, and under the last step.
const LIFELINE = { top: 28, bottom: 20 };
// Space between a message label and its arrow, and between two steps.
const MESSAGE = { labelGap: 6, rowGap: 18 };

// A plate is an opaque rectangle under a label, so lifelines do not cross the
// text. `margin` keeps a label clear of the lifelines at its ends.
const PLATE = { padX: 4, padY: 2, margin: 12 };

// A self-call loop: its width is the end segment for a full arrowhead.
const LOOP = { width: 32, height: 24, labelGap: 8 };

// A fragment frame: `pad` around its content, a tab with the kind in the
// top-left corner, and a guard per operand.
const FRAME = { pad: 14, tabPadX: 8, tabPadY: 4, bevel: 8, guardGap: 12, guardTop: 6, contentGap: 10 };
// An activation bar: `head` above the call that opens it, `tail` below the
// reply that closes it. A nested bar shifts right by half a width.
const BAR = { width: 12, head: 8, tail: 8, min: 24 };
// A note: text insets, and the overhang past the lifelines it spans.
const NOTE = { padX: 10, padY: 8, overhang: 20 };
const FRAGMENTS = ["alt", "opt", "loop", "par"];
// These kinds split into operands; the others hold one.
const SPLIT_FRAGMENTS = new Set(["alt", "par"]);

const CALL = { strokeStyle: "solid", start: null, end: "arrow" };
const REPLY = { strokeStyle: "dashed", start: null, end: "arrow" };

function normalizeGroups(items, style) {
  const groups = new Map();
  for (const [index, item] of asArray(items, "groups").entries()) {
    const where = `groups[${index}]`;
    const id = requireId(item?.id, `${where}.id`);
    if (groups.has(id)) throw new SpecError(`duplicate group "${id}"`);
    const tone = item.tone ?? style.tone;
    shade(tone, 1);
    groups.set(id, { id, label: textOf(item.label, `${where}.label`), tone, members: [] });
  }
  return groups;
}

function normalizeParticipants(items, groups, style) {
  const participants = new Map();
  for (const [index, item] of asArray(items, "participants").entries()) {
    const where = `participants[${index}]`;
    const id = requireId(item?.id, `${where}.id`);
    if (participants.has(id)) throw new SpecError(`duplicate participant "${id}"`);
    const group = item.group === undefined ? null : groups.get(item.group);
    if (group === undefined) throw new SpecError(`${where}: unknown group "${item.group}"`);
    group?.members.push(index);
    const tone = item.tone ?? group?.tone ?? style.tone;
    shade(tone, 1);
    participants.set(id, {
      id,
      index,
      name: textOf(item.name ?? id, `${where}.name`),
      sub: textOf(item.sub, `${where}.sub`),
      tone,
    });
  }
  if (participants.size === 0) throw new SpecError("at least one participant is required");
  for (const group of groups.values()) {
    const { members } = group;
    if (members.length > 0 && members.at(-1) - members[0] !== members.length - 1) {
      throw new SpecError(`group "${group.id}" must hold adjacent participants`);
    }
  }
  return participants;
}

function participantOf(participants, value, label) {
  if (!participants.has(value)) throw new SpecError(`${label}: unknown participant "${value}"`);
  return value;
}

function* leaves(steps) {
  for (const step of steps) {
    if (step.kind === "fragment") {
      for (const operand of step.operands) yield* leaves(operand.steps);
    } else {
      yield step;
    }
  }
}

function* fragmentsOf(steps) {
  for (const step of steps) {
    if (step.kind !== "fragment") continue;
    yield step;
    for (const operand of step.operands) yield* fragmentsOf(operand.steps);
  }
}

function normalizeFragment(item, where, participants, counter) {
  const type = item.fragment;
  if (!FRAGMENTS.includes(type)) throw new SpecError(`${where}.fragment must be one of ${FRAGMENTS.join(", ")}`);
  counter.fragments += 1;
  const id = `f${counter.fragments}`;
  let operands;
  if (SPLIT_FRAGMENTS.has(type)) {
    operands = asArray(item.operands, `${where}.operands`)
      .map((operand, index) => [operand, `${where}.operands[${index}]`]);
    if (operands.length === 0) throw new SpecError(`${where}: ${type} needs operands, each with a guard and steps`);
  } else {
    if (item.operands !== undefined) {
      throw new SpecError(`${where}: ${type} has one operand; put guard, tone, and steps in the fragment`);
    }
    operands = [[item, where]];
  }
  const fragment = {
    kind: "fragment",
    id,
    type,
    operands: operands.map(([operand, label]) => {
      if (operand?.tone !== undefined) shade(operand.tone, 1);
      return {
        guard: textOf(operand?.guard, `${label}.guard`),
        tone: operand?.tone ?? null,
        steps: normalizeSteps(operand?.steps, participants, `${label}.steps`, counter),
      };
    }),
  };
  if (leaves([fragment]).next().done) throw new SpecError(`${where}: ${type} needs at least one step`);
  return fragment;
}

// Messages are numbered in reading order: m1, m2, and so on. Fragments are
// numbered apart: f1, f2.
function normalizeSteps(items, participants, label, counter) {
  return asArray(items, label).map((item, index) => {
    const where = `${label}[${index}]`;
    if (item?.fragment !== undefined) return normalizeFragment(item, where, participants, counter);
    if (item?.note !== undefined) {
      const over = typeof item.over === "string" ? [item.over] : asArray(item.over, `${where}.over`);
      if (over.length === 0 || over.length > 2) {
        throw new SpecError(`${where}.over must name one participant or two: ["first", "last"]`);
      }
      over.forEach((id, overIndex) => participantOf(participants, id, `${where}.over[${overIndex}]`));
      const tone = item.tone ?? null;
      if (tone !== null) shade(tone, 1);
      counter.notes += 1;
      const indexes = over.map((id) => participants.get(id).index);
      const [first, last] = indexes[0] <= indexes.at(-1) ? [over[0], over.at(-1)] : [over.at(-1), over[0]];
      return { kind: "note", id: `n${counter.notes}`, first, last, label: textOf(item.note, `${where}.note`), tone };
    }
    if (item?.self !== undefined) {
      const side = item.side ?? "right";
      if (!["left", "right"].includes(side)) throw new SpecError(`${where}.side must be "left" or "right"`);
      counter.messages += 1;
      return {
        kind: "self",
        id: `m${counter.messages}`,
        participant: participantOf(participants, item.self, `${where}.self`),
        side,
        label: textOf(item.label, `${where}.label`),
      };
    }
    if (item?.from !== undefined || item?.to !== undefined) {
      const from = participantOf(participants, item.from, `${where}.from`);
      const to = participantOf(participants, item.to, `${where}.to`);
      if (item.reply === true && item.activate === true) throw new SpecError(`${where}: a reply cannot activate`);
      if (from === to) throw new SpecError(`${where}: a message to its sender is a self-call: use { "self": "${from}" }`);
      counter.messages += 1;
      return {
        kind: "message",
        id: `m${counter.messages}`,
        from,
        to,
        label: textOf(item.label, `${where}.label`),
        reply: item.reply === true,
        activate: item.activate === true,
      };
    }
    throw new SpecError(`${where} needs from and to, self, note, or fragment`);
  });
}

// Legend items: a call or reply arrow, or a tone swatch for operand tints.
function normalizeLegend(items, style) {
  return asArray(items, "legend").map((item, index) => {
    const where = `legend[${index}]`;
    const label = textOf(item?.label, `${where}.label`);
    if (label === "") throw new SpecError(`${where}.label is required`);
    if (item.message !== undefined) {
      if (!["call", "reply"].includes(item.message)) throw new SpecError(`${where}.message must be "call" or "reply"`);
      const reply = item.message === "reply";
      return {
        marker: "arrow",
        semantics: reply ? REPLY : CALL,
        strokeColor: reply ? strokeOf(style, "gray", 4) : style.ink,
        label,
      };
    }
    if (item.tone !== undefined) {
      shade(item.tone, 1);
      if (style.preset === "sketch") {
        throw new SpecError(`${where}: the sketch style has no colors; remove the tone item or use the clean style`);
      }
      return { marker: "swatch", fill: { backgroundColor: shade(item.tone, 1), strokeColor: style.ink }, label };
    }
    throw new SpecError(`${where} needs message or tone`);
  });
}

export function normalizeSpec(spec) {
  if (!spec || typeof spec !== "object") throw new SpecError("Spec must be a JSON object");
  const style = resolveStyle(spec.style);
  const groups = normalizeGroups(spec.groups, style);
  const participants = normalizeParticipants(spec.participants, groups, style);
  return {
    title: textOf(spec.title, "title"),
    subtitle: textOf(spec.subtitle, "subtitle"),
    style,
    groups,
    participants,
    steps: normalizeSteps(spec.steps, participants, "steps", { messages: 0, fragments: 0, notes: 0 }),
    legend: normalizeLegend(spec.legend, style),
    footnote: textOf(spec.footnote, "footnote"),
  };
}

function fontSizes(style) {
  return {
    name: style.fontSize,
    sub: style.fontSize - 4,
    label: style.fontSize - 2,
    guard: style.fontSize - 4,
    note: style.fontSize - 4,
  };
}

function labelSize(text, style) {
  return text === "" ? { width: 0, height: 0 } : measure(text, fontSizes(style).label, style, style.codeFontFamily);
}

// Give every step its vertical position, from `top` down. Returns the bottom.
// A message label sits above its arrow; a self-call label beside its loop.
// `background` is the color under the steps: a plate takes it.
function placeSteps(steps, top, context) {
  let y = top;
  for (const step of steps) {
    if (step.kind === "fragment") {
      y = placeFragment(step, y, context);
      continue;
    }
    step.plateColor = context.background;
    step.labelTop = y;
    if (step.kind === "note") {
      step.y = y;
      step.height = step.labelSize.height + 2 * NOTE.padY;
      y += step.height + MESSAGE.rowGap;
      continue;
    }
    if (step.kind === "self") {
      step.y = y + Math.max(0, (step.labelSize.height - LOOP.height) / 2);
      y += Math.max(step.labelSize.height, LOOP.height) + MESSAGE.rowGap;
    } else {
      step.y = y + (step.label === "" ? 0 : step.labelSize.height + MESSAGE.labelGap);
      y = step.y + MESSAGE.rowGap;
    }
  }
  return y;
}

// Activation bars open at `activate` calls. A reply from the owner to the
// caller closes the bar; a bar without a reply closes after the last message
// of its owner. Each message records the bars its ends meet.
function placeActivations(steps) {
  const state = { open: new Map(), last: new Map(), counts: new Map(), bars: [] };
  walkActivations(steps, state);
  for (const bar of [...state.open.values()].flat()) {
    bar.bottom = Math.max(bar.bottom ?? -Infinity, bar.top + BAR.min, state.last.get(bar.participant) + BAR.tail);
  }
  return state.bars;
}

const copyStacks = (open) => new Map([...open].map(([id, stack]) => [id, [...stack]]));

// The operands of alt and par are alternatives, not a sequence: each starts
// with the bars open at the fragment. After it, a bar stays open if any
// operand leaves it open.
function walkActivations(steps, state) {
  const current = (id) => state.open.get(id)?.at(-1) ?? null;
  for (const step of steps) {
    if (step.kind === "fragment") {
      if (!SPLIT_FRAGMENTS.has(step.type)) {
        walkActivations(step.operands[0].steps, state);
        continue;
      }
      const entry = state.open;
      const ends = step.operands.map((operand) => {
        state.open = copyStacks(entry);
        walkActivations(operand.steps, state);
        return state.open;
      });
      state.open = new Map();
      for (const end of ends) {
        for (const [id, stack] of end) {
          const merged = new Set([...(state.open.get(id) ?? []), ...stack]);
          state.open.set(id, [...merged].sort((a, b) => a.depth - b.depth));
        }
      }
      continue;
    }
    if (step.kind === "note") continue;
    if (step.kind === "self") {
      step.bar = current(step.participant);
      state.last.set(step.participant, step.y + LOOP.height);
      continue;
    }
    step.startBar = current(step.from);
    if (step.activate) {
      const stack = state.open.get(step.to) ?? [];
      const count = (state.counts.get(step.to) ?? 0) + 1;
      state.counts.set(step.to, count);
      const bar = {
        id: `${step.to}-activation-${count}`,
        participant: step.to,
        caller: step.from,
        depth: stack.length,
        top: step.y - BAR.head,
        bottom: null,
      };
      state.open.set(step.to, [...stack, bar]);
      state.bars.push(bar);
      step.endBar = bar;
    } else {
      step.endBar = current(step.to);
    }
    if (step.reply && step.startBar?.caller === step.to) {
      step.startBar.bottom = Math.max(step.startBar.bottom ?? -Infinity, step.y + BAR.tail);
      state.open.get(step.from).pop();
    }
    state.last.set(step.from, step.y);
    state.last.set(step.to, step.y);
  }
}

// The first guard sits beside the tab; every later operand starts with a
// dashed divider and its guard.
function placeFragment(fragment, top, context) {
  const { style } = context;
  let y = top;
  fragment.top = top;
  fragment.background = context.background;
  fragment.operands.forEach((operand, index) => {
    operand.tint = operand.tone === null || style.preset === "sketch" ? null : shade(operand.tone, 1);
    operand.top = y;
    const guardHeight = operand.guard === "" ? 0 : operand.guardSize.height;
    let contentTop;
    if (index === 0) {
      operand.guardTop = top + (fragment.tabHeight - guardHeight) / 2;
      contentTop = top + Math.max(fragment.tabHeight, guardHeight) + FRAME.contentGap;
    } else {
      operand.guardTop = y + FRAME.guardTop;
      contentTop = operand.guardTop + guardHeight + FRAME.contentGap;
    }
    y = placeSteps(operand.steps, contentTop, { style, background: operand.tint ?? context.background });
    operand.bottom = y;
  });
  fragment.bottom = y;
  return y + MESSAGE.rowGap;
}

function measureSteps(steps, style) {
  for (const step of leaves(steps)) {
    step.labelSize = step.kind === "note"
      ? measure(step.label, fontSizes(style).note, style)
      : labelSize(step.label, style);
    if (step.kind === "note") step.width = Math.ceil(step.labelSize.width + 2 * NOTE.padX);
  }
  const fontSize = fontSizes(style).guard;
  for (const fragment of fragmentsOf(steps)) {
    const kind = measure(fragment.type, fontSize, style);
    fragment.kindSize = kind;
    fragment.tabWidth = Math.ceil(kind.width + 2 * FRAME.tabPadX);
    fragment.tabHeight = Math.ceil(kind.height + 2 * FRAME.tabPadY);
    for (const operand of fragment.operands) {
      operand.guardText = operand.guard === "" ? "" : `[${operand.guard}]`;
      operand.guardSize = operand.guard === "" ? { width: 0, height: 0 } : measure(operand.guardText, fontSize, style);
    }
  }
}

// A note over one lifeline is centered on it. A note over two spans them
// with NOTE.overhang on each side, or its text width if that is wider.
function noteExtent(step, participants) {
  const left = participants.get(step.first).x - (step.first === step.last ? 0 : NOTE.overhang);
  const right = participants.get(step.last).x + (step.first === step.last ? 0 : NOTE.overhang);
  const width = Math.max(step.width, right - left);
  const center = (left + right) / 2;
  return [center - width / 2, center + width / 2];
}

// The horizontal extent of a step: lifelines, loops, labels, and frames.
function extentOf(step, participants) {
  if (step.kind === "note") return noteExtent(step, participants);
  if (step.kind === "message") {
    const xs = [participants.get(step.from).x, participants.get(step.to).x];
    return [Math.min(...xs), Math.max(...xs)];
  }
  if (step.kind === "self") {
    const { x } = participants.get(step.participant);
    const reach = LOOP.width + LOOP.labelGap + step.labelSize.width + PLATE.padX;
    return step.side === "right" ? [x, x + reach] : [x - reach, x];
  }
  return [step.left, step.right];
}

// Frames enclose their content with FRAME.pad, nested frames included, and
// grow to the right to fit the tab and the guards.
function placeFrames(steps, participants) {
  for (const step of steps) {
    if (step.kind !== "fragment") continue;
    let left = Infinity;
    let right = -Infinity;
    for (const operand of step.operands) {
      placeFrames(operand.steps, participants);
      for (const child of operand.steps) {
        const [from, to] = extentOf(child, participants);
        left = Math.min(left, from);
        right = Math.max(right, to);
      }
    }
    step.left = left - FRAME.pad;
    const guard = (operand) => (operand.guard === "" ? 0 : operand.guardSize.width + 2 * PLATE.padX + FRAME.guardGap);
    const need = Math.max(
      step.tabWidth + FRAME.bevel + FRAME.guardGap + guard(step.operands[0]),
      ...step.operands.slice(1).map((operand) => FRAME.guardGap + guard(operand)),
    );
    step.right = Math.max(right + FRAME.pad, step.left + need);
  }
}

// Every step needs a minimum distance between two lifelines. A self-call
// label on the outer side of the first or last lifeline widens the scene.
function spanNeeds(steps, participants) {
  const needs = [];
  const plated = (width) => width + 2 * (PLATE.padX + PLATE.margin);
  for (const step of leaves(steps)) {
    if (step.kind === "note") {
      const [first, last] = [participants.get(step.first).index, participants.get(step.last).index];
      const half = step.width / 2 + PLATE.margin;
      if (first === last) {
        if (first > 0) needs.push({ left: first - 1, right: first, width: half });
        if (first + 1 < participants.size) needs.push({ left: first, right: first + 1, width: half });
      } else {
        needs.push({ left: first, right: last, width: step.width - 2 * NOTE.overhang });
      }
      continue;
    }
    if (step.kind === "self") {
      const index = participants.get(step.participant).index;
      const left = step.side === "right" ? index : index - 1;
      if (left < 0 || left + 1 >= participants.size) continue;
      needs.push({ left, right: left + 1, width: LOOP.width + LOOP.labelGap + plated(step.labelSize.width) - PLATE.margin });
      continue;
    }
    if (step.label === "") continue;
    const [left, right] = [participants.get(step.from).index, participants.get(step.to).index].sort((a, b) => a - b);
    needs.push({ left, right, width: plated(step.labelSize.width) });
  }
  return needs;
}

// Header sizes and lifeline positions. Every header gets the height of the
// tallest one; neighbouring headers keep HEADER.gap between them. A gap grows
// to fit the labels between its lifelines; a label that spans several gaps
// widens each of them by an equal part.
function placeParticipants(participants, steps, style) {
  const sizes = fontSizes(style);
  const list = [...participants.values()];
  for (const participant of list) {
    participant.nameSize = measure(participant.name, sizes.name, style);
    participant.subSize = participant.sub === ""
      ? { width: 0, height: 0 }
      : measure(participant.sub, sizes.sub, style, style.codeFontFamily);
    participant.width = Math.ceil(Math.max(participant.nameSize.width, participant.subSize.width) + 2 * HEADER.padX);
  }
  const headerHeight = Math.ceil(Math.max(...list.map((participant) =>
    participant.nameSize.height + (participant.sub === "" ? 0 : HEADER.lineGap + participant.subSize.height)))
    + 2 * HEADER.padY);
  const gaps = list.slice(1).map((participant, index) => (list[index].width + participant.width) / 2 + HEADER.gap);
  const needs = spanNeeds(steps, participants).sort((a, b) => (a.right - a.left) - (b.right - b.left));
  for (const need of needs) {
    const span = gaps.slice(need.left, need.right);
    const deficit = need.width - span.reduce((sum, gap) => sum + gap, 0);
    if (deficit <= 0) continue;
    for (let index = need.left; index < need.right; index += 1) gaps[index] += deficit / span.length;
  }
  let x = list[0].width / 2;
  list.forEach((participant, index) => {
    if (index > 0) x += gaps[index - 1];
    participant.x = x;
  });
  return headerHeight;
}

// Bands sit above the headers, which start at y = 0.
function drawBands(builder, groups, participants) {
  const style = builder.style;
  const list = [...participants.values()];
  const fontSize = fontSizes(style).sub;
  const labelled = [...groups.values()].filter((group) => group.members.length > 0);
  if (labelled.length === 0) return;
  const labelHeight = Math.max(...labelled.map((group) => measure(group.label || " ", fontSize, style).height));
  const ruleY = -BAND.headerGap;
  for (const group of labelled) {
    const first = list[group.members[0]];
    const last = list[group.members.at(-1)];
    const left = first.x - first.width / 2;
    const right = last.x + last.width / 2;
    const color = strokeOf(style, group.tone, 5);
    if (group.label !== "") {
      builder.text(`band-${group.id}-label`, group.label, left, ruleY - BAND.ruleGap - labelHeight, fontSize, {
        strokeColor: color,
      });
    }
    builder.line(`band-${group.id}-rule`, left, ruleY, right - left, { strokeColor: color, strokeWidth: 1 });
  }
}

function drawParticipant(builder, participant, top, headerHeight, lifelineHeight) {
  const style = builder.style;
  const sketch = style.preset === "sketch";
  const sizes = fontSizes(style);
  const id = participant.id;
  const groupIds = [`${id}-participant`];
  const left = participant.x - participant.width / 2;
  builder.base(`${id}-header`, "rectangle", left, top, participant.width, headerHeight, {
    backgroundColor: fillOf(style, participant.tone, 2),
    roundness: sketch ? { type: 3 } : null,
    groupIds,
  });
  const blockHeight = participant.nameSize.height
    + (participant.sub === "" ? 0 : HEADER.lineGap + participant.subSize.height);
  const nameTop = top + (headerHeight - blockHeight) / 2;
  builder.text(`${id}-name`, participant.name, participant.x - participant.nameSize.width / 2, nameTop, sizes.name, {
    textAlign: "center",
    groupIds,
  });
  if (participant.sub !== "") {
    builder.text(`${id}-sub`, participant.sub, participant.x - participant.subSize.width / 2,
      nameTop + participant.nameSize.height + HEADER.lineGap, sizes.sub, {
        fontFamily: style.codeFontFamily,
        textAlign: "center",
        strokeColor: strokeOf(style, "gray", 5),
        groupIds,
      });
  }
  const lineTop = top + headerHeight;
  builder.base(`${id}-line`, "line", participant.x, lineTop, 0, lifelineHeight, {
    strokeColor: strokeOf(style, "gray", 4),
    strokeWidth: 1,
    strokeStyle: "dashed",
    points: [[0, 0], [0, lifelineHeight]],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
    groupIds,
  });
  // Arrows cannot bind to a line, so a narrow invisible rectangle on the
  // lifeline takes the message bindings.
  builder.base(`${id}-lifeline`, "rectangle", participant.x - 1, lineTop, 2, lifelineHeight, {
    strokeColor: "transparent",
    strokeWidth: 1,
    roughness: 0,
    groupIds,
  });
}

// Operand tints go below the lifelines.
function drawTints(builder, steps) {
  for (const fragment of fragmentsOf(steps)) {
    fragment.operands.forEach((operand, index) => {
      if (operand.tint === null) return;
      const bottom = fragment.operands[index + 1]?.top ?? fragment.bottom;
      builder.base(`${fragment.id}-op${index + 1}-tint`, "rectangle", fragment.left, operand.top,
        fragment.right - fragment.left, bottom - operand.top, {
          strokeColor: "transparent",
          backgroundColor: operand.tint,
          strokeWidth: 1,
          roughness: 0,
          groupIds: [`${fragment.id}-fragment`],
        });
    });
  }
}

function drawFrame(builder, fragment) {
  const style = builder.style;
  const fontSize = fontSizes(style).guard;
  const color = strokeOf(style, "gray", 5);
  const groupIds = [`${fragment.id}-fragment`];
  const { left, right, top, tabWidth, tabHeight } = fragment;
  // Sharp corners in both styles: the tab fills the top-left corner.
  builder.base(fragment.id, "rectangle", left, top, right - left, fragment.bottom - top, {
    strokeColor: color,
    strokeWidth: 1,
    groupIds,
  });
  // A closed tab takes the fill of the first operand, so lifelines do not
  // cross the kind.
  const tab = [
    [0, 0], [tabWidth + FRAME.bevel, 0], [tabWidth + FRAME.bevel, tabHeight - FRAME.bevel],
    [tabWidth, tabHeight], [0, tabHeight], [0, 0],
  ];
  builder.base(`${fragment.id}-tab`, "line", left, top, tabWidth + FRAME.bevel, tabHeight, {
    strokeColor: color,
    backgroundColor: fragment.operands[0].tint ?? fragment.background,
    strokeWidth: 1,
    points: tab,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
    groupIds,
  });
  builder.text(`${fragment.id}-kind`, fragment.type, left + FRAME.tabPadX, top + FRAME.tabPadY, fontSize, { groupIds });
  fragment.operands.forEach((operand, index) => {
    const id = `${fragment.id}-op${index + 1}`;
    if (index > 0) {
      builder.line(`${id}-divider`, left, operand.top, right - left, {
        strokeColor: color,
        strokeWidth: 1,
        strokeStyle: "dashed",
        groupIds,
      });
    }
    if (operand.guard === "") return;
    const x = index === 0 ? left + tabWidth + FRAME.bevel + FRAME.guardGap : left + FRAME.guardGap;
    const { width, height } = operand.guardSize;
    builder.base(`${id}-guard-plate`, "rectangle", x - PLATE.padX, operand.guardTop - PLATE.padY,
      width + 2 * PLATE.padX, height + 2 * PLATE.padY, {
        strokeColor: "transparent",
        backgroundColor: operand.tint ?? fragment.background,
        strokeWidth: 1,
        roughness: 0,
        groupIds,
      });
    builder.text(`${id}-guard`, operand.guardText, x, operand.guardTop, fontSize, { strokeColor: color, groupIds });
  });
}

function drawActivation(builder, bar, participants) {
  const participant = participants.get(bar.participant);
  bar.x = participant.x - BAR.width / 2 + bar.depth * BAR.width / 2;
  bar.element = builder.base(bar.id, "rectangle", bar.x, bar.top, BAR.width, bar.bottom - bar.top, {
    backgroundColor: fillOf(builder.style, participant.tone, 1),
    strokeWidth: 1,
    groupIds: [`${bar.participant}-participant`],
  });
}

// Where a message meets a participant: the lifeline, or the edge of an open
// bar that faces `towardX`.
function anchor(context, id, bar, towardX) {
  if (bar === null) return { x: context.participants.get(id).x, element: context.lifelines.get(id) };
  return { x: towardX < bar.x + BAR.width / 2 ? bar.x : bar.x + BAR.width, element: bar.element };
}

// A label on a plate. `x` is the left edge of the text; `align` lines up its
// lines toward the arrow.
function drawLabel(builder, id, step, x, groupIds, color, align = "center") {
  const style = builder.style;
  if (step.label === "") return;
  builder.base(`${id}-plate`, "rectangle", x - PLATE.padX, step.labelTop - PLATE.padY,
    step.labelSize.width + 2 * PLATE.padX, step.labelSize.height + 2 * PLATE.padY, {
      strokeColor: "transparent",
      backgroundColor: step.plateColor,
      strokeWidth: 1,
      roughness: 0,
      groupIds,
    });
  builder.text(`${id}-label`, step.label, x, step.labelTop, fontSizes(style).label, {
    fontFamily: style.codeFontFamily,
    textAlign: align,
    strokeColor: color,
    groupIds,
  });
}

function drawMessage(builder, step, context) {
  const style = builder.style;
  const from = context.participants.get(step.from);
  const to = context.participants.get(step.to);
  const start = anchor(context, step.from, step.startBar, to.x);
  const end = anchor(context, step.to, step.endBar, from.x);
  const groupIds = [`${step.id}-message`];
  const arrow = builder.arrow(step.id, [[start.x, step.y], [end.x, step.y]], step.reply ? REPLY : CALL, {
    strokeColor: step.reply ? strokeOf(style, "gray", 4) : style.ink,
    groupIds,
  }, { fullHeads: false });
  bindArrow(arrow, "start", start.element);
  bindArrow(arrow, "end", end.element);
  drawLabel(builder, step.id, step, (from.x + to.x - step.labelSize.width) / 2, groupIds,
    step.reply ? strokeOf(style, "gray", 5) : style.ink);
}

// A note over one lifeline moves with its participant.
function drawNote(builder, step, context) {
  const style = builder.style;
  const [left, right] = noteExtent(step, context.participants);
  const groupIds = [`${step.id}-note`, ...(step.first === step.last ? [`${step.first}-participant`] : [])];
  const note = builder.base(step.id, "rectangle", left, step.y, right - left, step.height, {
    backgroundColor: step.tone === null ? step.plateColor : fillOf(style, step.tone, 1),
    strokeWidth: 1,
    strokeStyle: "dashed",
    groupIds,
  });
  builder.boundText(note, `${step.id}-text`, step.label, fontSizes(style).note, groupIds);
}

// A self-call belongs to its participant as well, so the loop moves with it.
function drawSelfCall(builder, step, context) {
  const direction = step.side === "right" ? 1 : -1;
  const { participants } = context;
  const { x, element } = anchor(context, step.participant, step.bar, participants.get(step.participant).x + direction);
  const reach = x + direction * LOOP.width;
  const groupIds = [`${step.id}-message`, `${step.participant}-participant`];
  const points = [[x, step.y], [reach, step.y], [reach, step.y + LOOP.height], [x, step.y + LOOP.height]];
  const arrow = builder.arrow(step.id, points, CALL, { groupIds }, { fullHeads: false });
  bindArrow(arrow, "start", element);
  bindArrow(arrow, "end", element);
  const labelX = direction > 0 ? reach + LOOP.labelGap : reach - LOOP.labelGap - step.labelSize.width;
  drawLabel(builder, step.id, step, labelX, groupIds, builder.style.ink, direction > 0 ? "left" : "right");
}

export async function buildSequence(spec) {
  const normalized = normalizeSpec(spec);
  const { style, participants, steps } = normalized;
  measureSteps(steps, style);
  const headerHeight = placeParticipants(participants, steps, style);
  placeFrames(steps, participants);
  const stepsTop = headerHeight + LIFELINE.top;
  const stepsBottom = placeSteps(steps, stepsTop, { style, background: style.background });
  const bars = placeActivations(steps);
  const lifelineHeight = Math.max(stepsBottom - MESSAGE.rowGap, stepsTop) - headerHeight + LIFELINE.bottom;

  const heading = drawHeading(style, normalized.title, normalized.subtitle);
  const body = new SceneBuilder(style);
  drawBands(body, normalized.groups, participants);
  drawTints(body, steps);
  for (const participant of participants.values()) {
    drawParticipant(body, participant, 0, headerHeight, lifelineHeight);
  }
  const lifelines = new Map(body.elements
    .filter((element) => element.id.endsWith("-lifeline"))
    .map((element) => [element.id.slice(0, -"-lifeline".length), element]));
  for (const fragment of fragmentsOf(steps)) drawFrame(body, fragment);
  for (const bar of bars) drawActivation(body, bar, participants);
  const draw = { message: drawMessage, self: drawSelfCall, note: drawNote };
  for (const step of leaves(steps)) draw[step.kind](body, step, { participants, lifelines });
  const box = bounds(body.elements);
  translate(body.elements, -box.minX, heading.height - box.minY);
  const elements = [...heading.elements, ...body.elements];
  appendLegend(elements, style, normalized.legend);
  appendFootnote(elements, style, normalized.footnote);
  return sceneDocument(elements, style);
}

await runGenerator(import.meta.url, {
  usage: `Usage: node scripts/sequence.mjs <spec.json> [-o <scene.excalidraw>]

Builds an Excalidraw sequence diagram from a JSON spec and prints the scene
path and size. Export the scene with scripts/export_excalidraw.mjs.`,
  build: buildSequence,
  widthLimit: 1200,
});
