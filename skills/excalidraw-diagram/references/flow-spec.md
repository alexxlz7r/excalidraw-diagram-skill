# Flow Generator

`scripts/flow.mjs` builds a flow or state diagram scene from a compact JSON
spec. ELK (the Eclipse Layout Kernel, through `elkjs`) calculates the
positions of nodes and zones and routes the edges. The script draws the
notation from [application-design.md](application-design.md#flowstate).

Use the generator for flow diagrams (nodes are actions: `Validate payment`)
and state diagrams (nodes are conditions: `Pending`, `Paid`; edges are
events: `payment.confirmed`). The notation is the same.

## Workflow

1. Decide the main path: the route that a normal case takes from the entry
   to the outcome. List the nodes in the order of the flow.
2. Write the spec to a temporary JSON file.
3. Generate the scene. The script prints the scene path and its size:

   ```bash
   node scripts/flow.mjs /tmp/spec.json -o /tmp/scene.excalidraw
   ```

4. If the script prints a width warning, use `"direction": "DOWN"`, break
   long labels into lines, or split the diagram.
5. Export and inspect the scene with `scripts/export_excalidraw.mjs`.
6. If the preview fails a check, change the spec and generate again. The next
   generation overwrites manual changes to the scene.

## Spec

```json
{
  "title": "Coin lifecycle: market → liquid → active",
  "subtitle": "An active coin stays liquid, so exclusion also deactivates it.",
  "style": "clean",
  "direction": "DOWN",
  "groups": [
    { "id": "liquid_set", "label": "LIQUID SET · re-checked every 4 h", "tone": "blue" }
  ],
  "nodes": [
    { "id": "listing", "kind": "start", "label": "listing" },
    { "id": "market", "label": "Market", "tone": "gray", "dashed": true },
    { "id": "admit", "kind": "decision", "label": "admit?", "note": ["24h quote ≥ 50M", "or trades ≥ 500k"] },
    { "id": "liquid", "label": ["Liquid", "not active"], "group": "liquid_set" },
    { "id": "active", "label": "Active", "group": "liquid_set", "tone": "green" },
    { "id": "holds", "kind": "decision", "label": "holds?" }
  ],
  "edges": [
    { "from": "listing", "to": "market" },
    { "from": "market", "to": "admit", "path": "main" },
    { "from": "admit", "to": "liquid", "label": "admission", "path": "main" },
    { "from": "admit", "to": "market", "label": "no" },
    { "from": "liquid", "to": "active", "label": "fire", "path": "main" },
    { "from": "active", "to": "liquid", "label": "deactivation", "path": "recovery" },
    { "from": "liquid_set", "to": "holds", "label": "every 4 h" },
    { "from": "holds", "to": "liquid_set", "label": "yes" },
    { "from": "holds", "to": "market", "label": "exclusion", "path": "failure" }
  ],
  "legend": [{ "path": "failure", "label": "leaves the liquid set" }],
  "footnote": "The episode catalog records the deactivation reason."
}
```

Every text field accepts a string or an array of lines. The generator does
not wrap text: break long labels and notes into lines in the spec.

### Top level

| Field | Default | Meaning |
| --- | --- | --- |
| `title` | none | Diagram title, 1.6 × the font size. |
| `subtitle` | none | One sentence with the conclusion of the diagram. |
| `style` | `clean` | Named style: `"clean"` or `"sketch"`, or an object with `preset` and overrides. See [styles.md](styles.md). |
| `direction` | `DOWN` | Flow direction: `DOWN`, `UP`, `RIGHT`, or `LEFT`. `DOWN` fits long flows into 1200 px. Use `RIGHT` for a flow of five layers or fewer. |
| `groups` | `[]` | `{ id, label, tone, parent }`. A group is a zone around its nodes, such as a composite state or a stage. `parent` nests it in another group. |
| `nodes` | required | Nodes in the order of the flow. |
| `edges` | `[]` | Edges between nodes and groups. |
| `legend` | none | Path samples below the diagram: `{ path, label }`. |
| `footnote` | none | Text below the legend. |

`style` object fields: `preset`, `fontSize` (20), `fontFamily`, `roughness`,
`background`, `ink`, `tone` (`gray`), the default tone of groups, and
`kindTones` (`{ "step": "blue", "decision": "pink" }`), the default tone per
node kind in `clean`. See [type-map-spec.md](type-map-spec.md#top-level) for
the values of each preset.

### Node

| Field | Default | Meaning |
| --- | --- | --- |
| `id` | required | Unique among nodes and groups. Edges refer to it. |
| `kind` | `step` | `step`: rounded box for an action or a state. `decision`: diamond with a short question. `start`: filled dot for the entry. `end`: dot in a ring for a terminal outcome. |
| `label` | `id` | Text inside a step or a decision; text beside a circle. |
| `note` | none | Rule or condition beside the node, in gray, such as a threshold. |
| `tone` | kind tone | Palette hue of a step or a decision in `clean`. |
| `dashed` | `false` | Dashed outline: a wait, such as a timeout, a queue, or a human step. |
| `group` | none | Group ID. |

### Edge

| Field | Default | Meaning |
| --- | --- | --- |
| `from`, `to` | required | Node or group IDs. An edge to or from a group applies to every node in it. |
| `label` | none | Outcome or event on the edge, such as `valid`, `timeout`, or `payment.confirmed`. |
| `path` | `normal` | `main`: the happy path, thick. `failure`: red dashed. `recovery`: green dashed. `normal`: plain ink. |

In `sketch`, the paths have no colors: `failure` is dashed and `recovery` is
dotted.

The spec is an error when:

- a decision has fewer than two outgoing edges, or an outgoing edge without a
  label;
- an edge enters a `start` node or leaves an `end` node.

## Layout

- The node order sets the flow. An edge to the same node or to an earlier
  node is a back edge. A group takes the place of its first node.
- The main path runs straight: each main edge leaves and enters at the middle
  of a side, so the node centers stand on one line.
- A decision sends its main outcome, or its first forward outcome, along the
  flow. The other outcomes leave from the side vertex toward their target.
- Back edges leave and enter across the flow: above the nodes in a horizontal
  layout, left of them in a vertical one.
- A note stands across the flow, below or right of its node. If only that
  side has edges, the note moves to the other side.
- Edge labels sit on their edges. ELK keeps space around each label, so two
  labels do not read as one phrase.
- A zone label is drawn over the edges that cross it, on a plate.

## Editing a generated scene

Arrows are bound to the node shapes and zones. Each binding holds two
formats: `focus` and `gap` for Excalidraw 0.18, and `fixedPoint` with
`mode: "inside"` for later releases, such as excalidraw.com. Edge labels are
bound to their arrows, so they follow the arrows.

- When a user drags a node in Excalidraw, its note and circle label move with
  it (group `<node>-node`), and the ends of its edges follow. A bent edge
  keeps its bend points.
- To move a node in the scene JSON, move the node, its text, and the elements
  of its group, then put the arrows and labels back:

  ```bash
  node scripts/rebind_scene.mjs /tmp/scene.excalidraw
  ```

Element IDs are stable: `<node>` for the shape with `<node>-text` inside,
`<node>-label` and `<node>-dot` for circles, `<node>-note`, `e<n>` for edges
in spec order with `e<n>-label`, and `group-<group>` for zones with
`group-<group>-plate` and `group-<group>-label`.

## Limits

- The generator does not wrap text. It prints a warning when the scene is
  wider than 1200 px.
- Swimlanes are not supported. Use groups for stages or owners. ELK has no
  lanes. A tested approach: lay out the flow, move each node into the band of
  its lane, then route the edges in a second ELK pass with interactive phases
  and fixed ports. The main path stays straight inside one lane, but the other
  edges need more work.
- A straight labelled edge keeps two points, so its label sits at its middle.
- An edge that spans several layers can cross the main path.
