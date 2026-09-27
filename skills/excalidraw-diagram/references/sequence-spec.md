# Sequence Generator

`scripts/sequence.mjs` builds a sequence diagram scene from a compact JSON
spec. The script places the participants, sizes the gaps from the labels,
stacks the steps, and draws the notation from
[application-design.md](application-design.md#sequence).

Use the generator for sequence diagrams: calls and replies between
participants, self-calls, `alt`, `opt`, `loop`, and `par` fragments, notes,
and activation bars.

## Workflow

1. Decide the participants and their order: initiator on the left, then entry
   point, domain logic, integrations, and persistence.
2. Write the spec to a temporary JSON file.
3. Generate the scene. The script prints the scene path and its size:

   ```bash
   node scripts/sequence.mjs /tmp/spec.json -o /tmp/scene.excalidraw
   ```

4. If the script prints a width warning, break long labels and names into
   lines, then generate again.
5. Export and inspect the scene with `scripts/export_excalidraw.mjs`.
6. If the preview fails a check, change the spec and generate again. The next
   generation overwrites manual changes to the scene.

## Spec

```json
{
  "title": "Open an episode",
  "subtitle": "The screen asks bosun for one ChartSpec.",
  "style": "clean",
  "groups": [
    { "id": "client", "label": "chartroom · browser", "tone": "blue" },
    { "id": "server", "label": "bosun · FastAPI", "tone": "violet" }
  ],
  "participants": [
    { "id": "page", "name": "EpisodesPage", "sub": ["lab-episodes-", "feature"], "group": "client" },
    { "id": "bosun", "name": "bosun", "sub": "app.py", "group": "server" },
    { "id": "disk", "name": "disk", "sub": "results/", "group": "server", "tone": "gray" }
  ],
  "steps": [
    { "self": "page", "label": ["effect():", "?episode=<id>"] },
    { "from": "page", "to": "bosun", "label": "GET /api/episodes/{id}", "activate": true },
    { "fragment": "alt", "operands": [
      { "guard": "first call", "tone": "yellow", "steps": [
        { "from": "bosun", "to": "disk", "label": "load_signals()" },
        { "from": "disk", "to": "bosun", "label": "signals", "reply": true }
      ] },
      { "guard": "cached", "steps": [{ "note": "catalog from memory", "over": ["bosun", "disk"] }] }
    ] },
    { "fragment": "loop", "guard": "each window", "steps": [
      { "self": "bosun", "side": "left", "label": "spec_of(row)" }
    ] },
    { "from": "bosun", "to": "page", "label": "200 ChartSpec", "reply": true }
  ],
  "legend": [
    { "message": "call", "label": "call" },
    { "message": "reply", "label": "reply" },
    { "tone": "yellow", "label": "slow path" }
  ],
  "footnote": "A newer select() aborts the older request."
}
```

Every text field accepts a string or an array of lines. The generator does
not wrap text: break long labels and names into lines in the spec.

### Top level

| Field | Default | Meaning |
| --- | --- | --- |
| `title` | none | Diagram title, 1.6 × the font size. |
| `subtitle` | none | One sentence with the conclusion of the diagram. |
| `style` | `clean` | Named style: `"clean"` or `"sketch"`, or an object with `preset` and overrides. See [styles.md](styles.md). |
| `groups` | `[]` | `{ id, label, tone }`. A group draws its label and a rule above the headers of its participants. |
| `participants` | required | Participants from left to right. |
| `steps` | `[]` | Steps from top to bottom. |
| `legend` | none | Legend items below the diagram. |
| `footnote` | none | Text below the legend. |

`style` object fields: `preset`, `fontSize` (20), `fontFamily`, the label
font, `codeFontFamily`, the font of message labels and module lines,
`roughness`, `background`, `ink`, and `tone` (`gray`), the default tone of
participants. See [type-map-spec.md](type-map-spec.md#top-level) for the
values of each preset.

Legend items have a `label` and one marker: `{ message: "call" }` or
`{ message: "reply" }` for an arrow sample, or `{ tone }` for an operand tint.

### Participant

| Field | Default | Meaning |
| --- | --- | --- |
| `id` | required | Unique. Steps refer to it. |
| `name` | `id` | Header text in the label font. |
| `sub` | none | Module, library, or file lines under the name, in the code font. |
| `group` | none | Group ID. The participants of a group must be adjacent. |
| `tone` | group tone or style tone | Palette hue of the header. |

### Steps

| Step | Fields | Drawing |
| --- | --- | --- |
| Call | `from`, `to`, `label`, `activate` | Solid arrow with the label above it. |
| Reply | `from`, `to`, `label`, `reply: true` | Dashed gray arrow. |
| Self-call | `self`, `label`, `side` (`right` or `left`) | Loop beside the lifeline with the label beyond the loop. |
| Note | `note`, `over`, `tone` | Dashed box centered on one lifeline (`"over": "id"`), or across two and the lifelines between them (`"over": ["first", "last"]`). |
| Fragment | `fragment`, `guard`, `tone`, `steps` | `opt` or `loop`: one operand. |
| Fragment | `fragment`, `operands` | `alt` or `par`: operands, each `{ guard, tone, steps }`, split by dashed dividers. |

A fragment frames the lifelines that its steps use. The kind sits in a tab in
the top-left corner, and each guard appears in square brackets. The operand
`tone` fills the operand in `clean`; `sketch` has no fills.

`activate: true` on a call opens an activation bar on the target. A reply from
the target to the caller closes the bar. A bar without a reply closes after
the last message of its owner. Messages to or from an open bar meet its edge.
The operands of `alt` and `par` are alternatives: each operand starts with the
bars that were open at the fragment. Use bars only when the owner of the
execution is not clear without them.

## Layout

- Headers stand in a row with one height. A gap between two lifelines grows
  to fit the labels between them. A label that spans several gaps widens each
  of them by an equal part.
- Every label sits on an opaque plate in the color under it, so lifelines do
  not cross the text.
- Messages are horizontal. Each message and self-call takes its own row.

## Editing a generated scene

Arrows are bound to the lifelines. A lifeline is a dashed line and a narrow
transparent rectangle that takes the bindings. Each binding holds two
formats: `focus` and `gap` for Excalidraw 0.18, and `fixedPoint` with
`mode: "inside"` for later releases, such as excalidraw.com.

- When a user drags a participant in Excalidraw, its header, lifeline, bars,
  self-calls, and notes over it move together. The ends of the bound messages
  follow; the message labels stay in place.
- To move a participant in the scene JSON, move every element with the group
  ID `<participant>-participant`, then put the arrows and labels back:

  ```bash
  node scripts/rebind_scene.mjs /tmp/scene.excalidraw
  ```

  The script moves the ends of the bound arrows to their fixed points and
  centers each message label over its arrow.

Element IDs are stable: `<participant>-header`, `<participant>-lifeline`,
`<participant>-activation-<n>`, `m<n>` for messages and self-calls in reading
order with `m<n>-label` and `m<n>-plate`, `n<n>` for notes, and `f<n>` for
fragments with `f<n>-op<k>-guard`.

## Limits

- The generator does not wrap text. It prints a warning when the scene is
  wider than 1200 px.
- A note over one lifeline covers the activation bar under it.
- Messages do not skip rows: two messages never share a row, even when they
  do not overlap.
- Participant headers appear only at the top.
