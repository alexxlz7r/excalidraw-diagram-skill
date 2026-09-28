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

   To use a theme other than the default, add `--theme <file>`. See
   [theme.md](theme.md#use-the-theme).

4. Export and inspect the scene with `scripts/export_excalidraw.mjs`.
5. If the preview fails a check, change the spec and generate again. Change
   composition through the spec: direction, groups, `layer`, `place`, member
   lists, and panel arrangement. Edit the scene JSON only for a final touch
   that the spec cannot express, because the next generation overwrites it.

## Spec

```json
{
  "title": "Dependency inversion",
  "style": "clean",
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
| `style` | `clean` | Named style: `"clean"` or `"sketch"`, or an object with `preset` and overrides. See [styles.md](styles.md). |
| `panels` | none | Independent graphs, each laid out separately. A dashed divider separates them. |
| `arrange` | `row` | Panel placement: `row` or `column`. |
| `align` | `top` | Vertical alignment of panels in a row: `top`, or `bottom` to put the last layer of every panel on one line, as in a before-and-after comparison. |
| `legend` | none | Legend items below the diagram. |

`style` object fields: `preset` (`clean` or `sketch`), `fontSize` (20),
`fontFamily`, the label font (`clean`: 6, Nunito; `sketch`: 5, Excalifont),
`codeFontFamily`, the member font (`clean`: 3, Cascadia; `sketch`: 5),
`roughness` (`clean`: 0; `sketch`: 1), `tone` (`gray`), the default tone of
groups and structs, `kindTones`, the default tone per kind (`clean`: class
`orange`, interface `blue`, abstract `violet`), `memberCells` (`auto`: cells
for structs, a plain list for other kinds; or `true` or `false` for all
types), and `highlight` (`yellow`), the highlight hue for types without their
own tone. The style holds no colors: the theme sets them. A font family
must have measured widths: 1, 3, 5, 6, 7, 8, or 9. To use Comic Shanns as the
label font, set `"style": { "preset": "clean", "fontFamily": 8 }`. See
[styles.md](styles.md#comic-shanns).

A type box has a header with the kind badge and the name, then compartments:
the note, the fields, and the methods. A member that contains `(` is a method;
other members are fields. Each compartment keeps the order of the spec.
`clean` stacks the header and the compartments as boxes with sharp corners:
the header in the type tone, the compartments in a lighter shade. `sketch`
draws one rounded ink outline and divides the compartments with rules.

A struct with cells is drawn as a record: a header with the member cells
directly below it, one cell per member.

Legend items have a `label` and one marker: `{ kind, tone }` for a C/I/A/S
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
| `kind` | `class` | `class` (C), `interface` (I), `abstract` (A), `struct` (S), or `note` (dashed box without a header). Set `struct` explicitly for data records, such as C or kernel structures and DTOs; the default draws a C badge. |
| `group` | none | Group ID. |
| `tone` | kind tone or style tone | Palette hue for the fills. |
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
| `label` | none | Short connector label on the connector. The layout keeps space for it on the path. A labelled connector spans one extra layer. |
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

A tone is a hue of the theme: one of the twelve Excalidraw hues, `gray`,
`red`, `pink`, `grape`, `violet`, `blue`, `cyan`, `teal`, `green`, `yellow`,
`orange`, and `bronze`, or a hue that the theme adds. Each hue has five
shades. In `clean`, the generator uses level 2 for type headers and zone
hatches, level 1 for compartments and nested zones, and levels 4 and 5 for
zone and connector strokes (see [theme.md](theme.md#shade-levels)). Text
always uses the theme `black`. `sketch` uses no tones: every stroke is ink,
and a `tone` legend item is an error.

In `clean`, the header color shows the kind: orange classes, blue
interfaces, violet abstract classes. To show a role instead, such as the
stable abstraction or the shared state, give the type a `tone`, and explain
each role hue with a group label, a panel title, or a legend. Groups are
zones: an outer group is hatched, a nested group is cross-hatched, and a
deeper group has a solid pale fill. The group title sits on a solid plate.

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
  connectors keep their bend points and move only their ends. Each end stays
  at its point on the border of the type: the bindings hold `focus` and `gap`
  for Excalidraw 0.18, and `fixedPoint` with `mode: "inside"` for later
  releases, such as excalidraw.com. After an edit of the scene JSON,
  `scripts/rebind_scene.mjs` moves the connector ends in the same way.
- Text sizes use the measured character widths of `scripts/layout.mjs`, with
  a margin for kerning and pixel hinting, so a box can be a little wider than
  its text. See [styles.md](styles.md#text-measurement).
