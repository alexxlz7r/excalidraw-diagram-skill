# Type Map Generator

`scripts/type_map.mjs` builds a type map scene from a compact JSON spec. ELK
(the Eclipse Layout Kernel, through `elkjs`) calculates the positions of types
and groups and routes the connectors. The script draws the letter-badge
notation and the UML connectors from
[application-design.md](application-design.md#type-map-classes-interfaces-and-abstract-classes).

Use the generator for type maps: classes, interfaces, abstract classes, and
structs connected by pointers or references. Author other diagram modes by
hand.

## Workflow

1. Decide the composition: the panels, the groups in each panel, the layout
   direction, and the types that must be adjacent.
2. Write the spec to a temporary JSON file.
3. Generate the scene. The script prints the scene path and its size:

   ```bash
   node scripts/type_map.mjs /tmp/spec.json -o /tmp/scene.excalidraw
   ```

4. Export and inspect the scene with `scripts/export_excalidraw.mjs`.
5. If the preview fails a check, change the spec and generate again. Change
   composition through the spec: direction, groups, `layer`, `place`, member
   lists, and panel arrangement. Edit the scene JSON only for a final touch
   that the spec cannot express, because the next generation overwrites it.

## Spec

```json
{
  "title": "Dependency inversion",
  "style": { "roughness": 1, "tone": "gray" },
  "arrange": "row",
  "panels": [
    {
      "title": "After",
      "direction": "DOWN",
      "groups": [{ "id": "high", "label": "business rules", "tone": "green" }],
      "types": [
        { "id": "OrderService", "group": "high", "members": ["placeOrder(order)"] },
        { "id": "OrderRepository", "kind": "interface", "group": "high", "tone": "green",
          "members": ["save(order)"] },
        { "id": "MySqlOrderRepository", "members": ["save(order)"] }
      ],
      "relations": [
        { "from": "OrderService", "to": "OrderRepository", "type": "depends", "label": "uses" },
        { "from": "MySqlOrderRepository", "to": "OrderRepository", "type": "implements" }
      ]
    }
  ]
}
```

For a single graph, put `direction`, `groups`, `types`, and `relations` at the
top level and omit `panels`.

Every text field (titles, labels, notes, and member text) accepts a string or
an array of lines.

### Top level

| Field | Default | Meaning |
| --- | --- | --- |
| `title` | none | Diagram title, 1.6 × the font size. |
| `subtitle` | none | One sentence with the conclusion of the diagram. |
| `style` | see below | Scene-wide style. |
| `panels` | none | Independent graphs, each laid out separately. A dashed divider separates them. |
| `arrange` | `row` | Panel placement: `row` or `column`. |
| `align` | `top` | Vertical alignment of panels in a row: `top`, or `bottom` to put the last layer of every panel on one line, as in a before-and-after comparison. |
| `legend` | none | Legend items below the diagram. |

`style` fields: `fontSize` (20), `fontFamily` (3), `charWidthFactor` (required
for a font family other than 3), `roughness` (0, 1, or 2; default 0),
`background` (`#ffffff`), `ink` (`#1e1e1e`), `tone` (`gray`), the default
tone of types and groups, `memberCells` (`auto`: cells for structs, a
plain list for other kinds; or `true` or `false` for all types), and
`highlight` (`yellow`), the highlight hue for types in the default tone.

A struct with cells is drawn as a record: a title bar in the type tone with
the member cells directly below it.

Legend items have a `label` and one marker: `{ kind, tone }` for a C/I/A
badge, `{ tone }` for a type color, `{ highlight }` (a hue or `true`) for a
highlighted row, or `{ relation, tone }` for a connector sample.

### Graph

| Field | Default | Meaning |
| --- | --- | --- |
| `title` | none | Panel title. |
| `subtitle` | none | Short line under the panel title. |
| `direction` | `DOWN` | Layout direction: `DOWN`, `UP`, `RIGHT`, or `LEFT`. |
| `spacing` | `{ "nodes": 50, "layers": 56 }` | Gap between types in one layer and between layers. |
| `groups` | `[]` | `{ id, label, parent, tone }`. `parent` nests a group. |
| `types` | required | Type boxes. |
| `relations` | `[]` | Connectors between types. |

### Type

| Field | Default | Meaning |
| --- | --- | --- |
| `id` | required | Unique in its panel. Relations refer to it. |
| `name` | `id` | Header text. |
| `kind` | `class` | `class` (C), `interface` (I), `abstract` (A), `struct` (no badge), or `note` (dashed box without a header). Set `struct` explicitly for C or kernel structures; the default draws a C badge. |
| `group` | none | Group ID. |
| `tone` | style tone | Palette hue for the fills. |
| `note` | none | Responsibility line or lines above the members. For `kind: "note"`, use `text`. |
| `members` | `[]` | Strings, or `{ id, text, highlight }`. `highlight` is a hue, or `true` for the type tone (the style highlight hue for a type in the default tone). |
| `cells` | style | `true` draws each member in its own cell; `false` draws a plain list. |
| `layer` | none | Layer number in the layout direction. Types with a lower number come first. |
| `place` | none | `first` or `last`: force the first or the last layer. |

### Relation

| Field | Default | Meaning |
| --- | --- | --- |
| `from`, `to` | required | Type IDs in the semantic direction, as in the UML connector table. |
| `type` | `association` | `extends`, `implements`, `depends`, `association`, `navigates`, `composition`, `aggregation`, or `annotates` (dotted note link). |
| `fromMember`, `toMember` | none | Member ID, full text, or identifier in the text, such as `fd[3]`. The connector then starts or ends at that member row. |
| `fromSide`, `toSide` | automatic | `left` or `right`: the side of a member row where the connector attaches. By default the connector uses the side that faces the other type. |
| `dot` | see meaning | Dot at the start of the connector. The default is on for `navigates` from a member row, which draws a pointer field. |
| `label` | none | Short connector label, centered on the connector. A labelled connector spans one extra layer. |
| `tone` | ink | Palette hue for the connector. The label stays in ink for contrast. |

The layout places parents before children: `extends` and `implements` run
against the layout direction, so the parent type appears first.

In a `DOWN` or `UP` layout, a type with a single pointer member forms a chain
link: its connector leaves the side of the member row and enters the side of
the target header, and the target stays in the same column. The targets of a
type with several pointers share the next layer and are entered from above.

## Composition patterns

- **Before and after:** two panels in a row, each with the same groups.
- **Two similar structures and shared objects,** such as a parent and a
  child process: one graph in a `DOWN` layout without groups. Give each
  structure its own tone, list its types in order, and explain the tones in a
  legend. The chains become two columns, and the shared objects form the next
  layer.
- **Layers of an application:** groups for the layers in a `DOWN` layout.

## Palette

Tones are the Excalidraw color picker hues: `gray`, `red`, `pink`, `grape`,
`violet`, `blue`, `cyan`, `teal`, `green`, `yellow`, `orange`, and `bronze`.
Each hue has the five picker shades. The generator uses the lightest shades
for fills, the middle shades for badges, and the darkest shade for connector
and group strokes. Text always uses the ink color.

Use the default gray for most types. Give a hue only to types and groups with
a specific role, such as the stable abstraction, the shared state, or the
problem. Explain each hue with a group label, a panel title, or a legend.

## Limits

- The layout does not know the argument of the diagram. Express it through
  panels, groups, direction, spacing, and layer hints.
- The layout cannot mirror two similar structures, such as a parent and a
  child process on each side of shared objects. If the argument depends on
  such symmetry, author the scene by hand.
- Panels are laid out independently. Only the last layers line up, with
  `align: "bottom"`.
- In a `RIGHT` or `LEFT` layout, connectors from member rows run straight, so
  a chain of structs steps down like a staircase. Keep chains short or put
  the chain in a `DOWN` layout.
- Each group occupies its own band of the layout. A type that must share a
  column with other types stays outside the group; give it the group tone
  instead.
- A connector between two groups puts the second group after the first in
  the layout direction. To place two groups side by side, do not connect them;
  explain the relation in a label or a note.
- An `annotates` link counts as a layout edge and gives the note its own
  layer. If this makes the scene too wide, omit the link and name the target
  in the note text.
- Connectors are polylines. When a user moves a type in Excalidraw, the bound
  connectors keep their bend points and move only their ends.
- Text sizes use the monospace estimate of `scripts/layout.mjs`. For another
  font family, measure and pass `charWidthFactor`.
