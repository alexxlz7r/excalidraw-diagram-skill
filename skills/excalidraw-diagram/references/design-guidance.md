# Diagram Design Guidance

Read this reference when planning, composing, or visually reviewing a diagram.

## Visual argument

A strong diagram shows relationships, causality, transformation, or comparison
through its geometry. Two tests keep the design honest:

- **Isomorphism:** with labels hidden, does the structure still resemble the
  idea?
- **Education:** does the diagram reveal something concrete rather than repeat
  a list of nouns?

## Choose the depth

Use a conceptual treatment for mental models, philosophies, and quick
overviews. Use a technical treatment for real architectures, protocols,
tutorials, or integrations. A technical diagram should normally include at
least one evidence artifact:

| Evidence | Appropriate content |
| --- | --- |
| Code | Actual call, method, query, or configuration fragment |
| Data | Representative request, event, payload, or schema fragment |
| Sequence | Real event or lifecycle names in order |
| UI | A recognizable state with relevant controls or output |
| Boundary | Actual subsystem, trust, team, or deployment boundary |

Verify the source material before including specifics. Show only the detail
needed for the diagram's argument.

## Pattern vocabulary

| Meaning | Pattern |
| --- | --- |
| One source creates several results | Fan-out |
| Several inputs become one result | Convergence or funnel |
| Parent/child structure | Tree made from lines and labels |
| Ordered events | Timeline with a spine and markers |
| Continuous improvement | Cycle with a returning arrow |
| Input becomes output | Assembly line / before-process-after |
| Alternatives or trade-offs | Parallel side-by-side structures |
| Fuzzy context or shared state | Overlapping ellipses / cloud |
| Phase or responsibility change | Whitespace, divider, or boundary |

Use a different pattern when a major concept behaves differently. Repetition is
useful for repeated instances of the same concept, not as a default page grid.

## Multi-zoom technical diagrams

A comprehensive diagram benefits from three simultaneous levels:

1. a summary flow that establishes the whole system;
2. labeled regions that expose meaningful boundaries;
3. concrete evidence inside the regions.

Let the eye enter through the summary, follow one dominant flow direction, and
zoom into details without losing orientation.

## Shape and container semantics

| Concept | Preferred treatment |
| --- | --- |
| Title, annotation, metadata | Free-floating text |
| Timeline marker | Small ellipse |
| Start, trigger, input | Ellipse |
| End, output, result | Ellipse |
| Decision or condition | Diamond |
| Process or bounded component | Rectangle |
| Hierarchy | Lines plus free-floating labels |
| Region or system boundary | Frame or subtle outlined area |

Typography establishes hierarchy without adding boxes. A container earns its
space when it represents an entity, groups content, encodes meaning, or anchors
a connection. As a diagnostic, inspect any scene where most text is boxed: the
visual argument may have collapsed into cards.

## Composition

- Prefer one dominant flow: left-to-right or top-to-bottom for sequences,
  radial for hubs.
- Give the most important element the largest scale and most surrounding
  whitespace.
- Connect every relationship explicitly with an arrow or structural line.
- Route arrows around elements; add waypoints where direct segments collide.
- Use consistent gaps for peers and larger gaps between conceptual sections.
- Keep labels close enough to have one unambiguous referent.

### Delivery scale and density

Use the delivery width recorded during planning: the actual pixels available in
the destination. Keep the exported scene width at or below `1.15 × delivery
width`. A wider scene is downscaled by the destination and every label shrinks
with it.

Estimate the visible size of text as:

`effective font size = fontSize × min(1, delivery width / exported width)`

At delivery width, use 20–24 px for body text and shape labels, 16–18 px for
secondary metadata, 28–32 px for section headings, and 36–48 px for the title.
Main text below 18 effective pixels fails visual review.

Size every ordinary container from its wrapped text. For `fontFamily: 3`, use:

```text
width  = longest line length × font size × 0.6 + 2 × horizontal padding
height = line count × font size × 1.25 + 2 × vertical padding
```

Use 20–24 px horizontal and 14–16 px vertical padding per side. Measure the
font when using another family. In aligned comparisons, derive each column from
the widest text in that column and each row from the tallest text in that row,
then add the same padding. Large empty areas should communicate something, not
result from preset geometry. Code-based generators should reuse `scripts/layout.mjs`
for these calculations.

Starting sizes such as 300×150 for a hero, 180×90 for a primary element, 120×60
for a secondary element, and 10–20 px for a marker dot are only a first sketch.
Recompute every container after its text is written; a container that still has
its starting size without the content justifying it fails review.

## Large scenes

Plan natural sections, then add or edit one coherent section at a time. Use
descriptive IDs such as `routing_decision` and `api_to_queue`. Keep seed ranges
distinct when that makes hand edits safer. After all sections exist, audit the
entire scene for missing IDs, one-sided bindings, cramped regions, and accidental
empty space before export.

Automation is acceptable when it produces readable scene JSON, stable IDs,
correct bindings, and an output that can be repaired directly. Choose the
authoring technique that best preserves those outcomes.

## Visual review

Inspect the rendered pixels, not only the JSON. A review is complete when:

- the structure matches the planned argument and intended eye path;
- evidence artifacts are accurate and legible;
- text is neither clipped nor crowded by its container;
- an ordinary container is no more than `1.8 ×` its text width or `2 ×` its text
  height; for a grid, compare each column with its widest text and each row with
  its tallest text;
- the smallest main text is readable at the intended viewing width without zoom;
- ordinary containers have content-driven padding rather than large accidental
  voids;
- the exported width is at most `1.15 ×` the delivery width;
- the preview was rendered and reviewed at the delivery width, not at 100% scene
  scale;
- elements do not overlap unintentionally;
- arrows land on their intended elements and avoid unrelated shapes;
- similar elements have consistent spacing;
- semantic states remain distinguishable beyond color alone where needed;
- the composition is balanced at the delivery size.
