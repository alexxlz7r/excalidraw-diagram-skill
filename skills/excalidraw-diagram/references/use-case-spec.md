# Use-Case Generator

`scripts/use_cases.mjs` builds a use-case map scene from a compact JSON spec.
ELK (the Eclipse Layout Kernel, through `elkjs`) calculates the positions and
routes the lines. The script draws the notation from
[application-design.md](application-design.md#use-case-map).

Use the generator for use-case maps: who can accomplish which goals in one
product or subsystem.

## Workflow

1. Decide the actors, the goals, and the journeys that group the goals. Mark
   the principal actor and the goals of the primary journey as primary.
2. Write the spec to a temporary JSON file.
3. Generate the scene. The script prints the scene path and its size:

   ```bash
   node scripts/use_cases.mjs /tmp/spec.json -o /tmp/scene.excalidraw
   ```

4. If the script prints a width warning, break long names into lines, or
   split the map by journey.
5. Export and inspect the scene with `scripts/export_excalidraw.mjs`.
6. If the preview fails a check, change the spec and generate again. The next
   generation overwrites manual changes to the scene.

## Spec

```json
{
  "title": "Web shop: who does what",
  "subtitle": "Customers buy and return goods; support approves refunds.",
  "style": "clean",
  "system": "Web shop",
  "actors": [
    { "id": "customer", "name": "Customer", "primary": true },
    { "id": "support", "name": ["Support", "agent"], "side": "right" }
  ],
  "journeys": [
    { "id": "buy", "label": "Buy", "tone": "blue" },
    { "id": "care", "label": "After sale", "tone": "green" }
  ],
  "cases": [
    { "id": "browse", "name": "Browse catalog", "journey": "buy", "primary": true },
    { "id": "checkout", "name": "Check out", "journey": "buy", "primary": true },
    { "id": "pay", "name": "Pay by card", "journey": "buy" },
    { "id": "refund", "name": "Approve refund", "journey": "care" }
  ],
  "links": [
    { "from": "customer", "to": "browse" },
    { "from": "customer", "to": "checkout" },
    { "from": "checkout", "to": "pay", "label": "includes" },
    { "from": "support", "to": "refund" }
  ],
  "footnote": "Guests can browse; checkout needs an account."
}
```

Every text field accepts a string or an array of lines. The generator does
not wrap text: break long names into lines in the spec.

### Top level

| Field | Default | Meaning |
| --- | --- | --- |
| `title` | none | Diagram title, 1.6 × the font size. |
| `subtitle` | none | One sentence with the conclusion of the diagram. |
| `style` | `clean` | Named style: `"clean"` or `"sketch"`, or an object with `preset` and overrides. See [styles.md](styles.md). |
| `system` | none | Label of the product or subsystem boundary. |
| `actors` | `[]` | People and systems outside the boundary. |
| `journeys` | `[]` | `{ id, label, tone }`. A journey is a zone that groups use cases inside the boundary. |
| `cases` | required | Use cases, named as verb phrases: `Approve refund`. |
| `links` | `[]` | Lines between actors and use cases, and arrows between use cases. |
| `footnote` | none | Text below the diagram. |

`style` object fields: `preset`, `fontSize` (20), `fontFamily`, `roughness`,
`background`, `ink`, and `tone` (`gray`), the tone of the boundary and of
use cases outside a journey. See
[type-map-spec.md](type-map-spec.md#top-level) for the values of each preset.

### Actor

| Field | Default | Meaning |
| --- | --- | --- |
| `id` | required | Unique among actors and use cases. |
| `name` | `id` | Name below the figure. |
| `side` | `left` | `left` for actors that start the goals; `right` for supporting actors, such as staff or external systems. |
| `primary` | `false` | Strong figure for the principal actor. |

### Use case

| Field | Default | Meaning |
| --- | --- | --- |
| `id` | required | Unique among actors and use cases. |
| `name` | `id` | Verb phrase inside the oval. |
| `journey` | none | Journey ID. Without a journey, the use case stands in the boundary. |
| `primary` | `false` | Strong outline and fill for a goal of the primary journey. |

### Link

| Field | Default | Meaning |
| --- | --- | --- |
| `from`, `to` | required | Actor or use case IDs. A link cannot join two actors. |
| `label` | none | Plain-language label, such as `includes` or `needs`. |

A link between an actor and a use case is a plain line: connect an actor only
to the goals that the actor starts or takes part in. A link between two use
cases is a dashed arrow from `from` to `to`. Show such links only when they
change the understanding of the product.

## Layout

- Actors on the left, the boundary with the journeys, then actors on the
  right. The layout runs from left to right.
- The lines of an actor meet at the middle of its figure.
- A journey label and the boundary label are drawn over the lines, on a
  plate.

## Editing a generated scene

Lines and arrows are bound to the actors and use cases, with two binding
formats, as in the other generators. The parts of a stick figure and its name
form a group (`<actor>-actor`) with a transparent box that takes the
bindings. After an edit of the scene JSON, run
`node scripts/rebind_scene.mjs /tmp/scene.excalidraw`.

Element IDs are stable: `<actor>` for the actor box with `<actor>-head`,
`<actor>-body`, `<actor>-arms`, `<actor>-legs`, and `<actor>-name`; `<case>`
for the oval with `<case>-text`; `l<n>` for links in spec order with
`l<n>-label`; `system` and `journey-<journey>` for the zones, each with
`-plate` and `-label`.

## Limits

- The generator does not wrap text. It prints a warning when the scene is
  wider than 1200 px.
- Journeys do not nest.
- The lines of an actor share their first segment and split toward their
  use cases.
