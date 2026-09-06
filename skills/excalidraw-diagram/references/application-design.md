# Application Design Diagrams

Read this reference for lightweight UML-like diagrams used to design or explain
software. Preserve the semantics developers need while favoring clarity,
composition, and the resolved visual theme over strict UML notation.

## Choose one primary question

| Question | Diagram mode |
| --- | --- |
| What exists and how is it related? | Type map |
| Who can accomplish which goals? | Use-case map |
| What happens across components over time? | Sequence |
| How does control or state move? | Flow/state |

Use one mode per visual region. When a request needs more than one question,
prefer separate diagrams; otherwise separate the modes into clearly titled
regions with distinct reading directions.

## Type map: classes and interfaces

Use a type map to explain the design surface, not to inventory every symbol in
the codebase.

- Render interfaces and protocols with a small `interface` or `protocol` tag;
  use a distinct header treatment rather than a different geometry.
- Give each type a strong name and one short responsibility. Add only fields or
  operations that explain a relationship, constraint, or extension point.
- Use two compact compartments at most: responsibility, then essential API.
- Label relationships in plain language such as `implements`, `creates`,
  `publishes`, `owns`, or `uses`.
- Reserve inheritance triangles and composition diamonds for cases where that
  exact meaning matters. Ordinary dependencies can use labeled arrows.
- Emphasize the stable abstraction or domain center; place adapters and
  implementations around it. Keep incidental utilities out.

A good type map lets a developer identify the extension point, the concrete
implementations, and the direction of dependency without reading source code.

## Use-case map

Use a use-case map to show user goals and product scope before implementation
details.

- Place actors outside one visible product or subsystem boundary.
- Name use cases as verb phrases: `Create workspace`, `Invite member`,
  `Approve refund`.
- Group goals by journey or capability instead of making an undifferentiated
  field of ovals. Rounded capsules are acceptable when they fit the theme.
- Connect an actor only to goals they initiate or materially participate in.
- Show `includes`, prerequisites, or exceptional paths only when they change
  product understanding; label them in plain language.
- Keep services, databases, endpoints, and internal classes out of this mode.

Make the principal actor and primary journey visually dominant. Supporting
roles and administrative cases should read as secondary.

## Sequence

Use a sequence diagram for a real request, command, event, or background job.

- Order participants left to right from initiator to entry point, domain logic,
  integrations, and persistence. Collapse participants that do not affect the
  explanation.
- Use a labeled header and vertical lifeline for each participant. Five to seven
  participants is a useful default ceiling for one readable scene.
- Draw messages top to bottom with actual method, command, event, or response
  names when the source material provides them.
- Use solid arrows for calls or emitted events and lighter dashed arrows for
  returns or acknowledgements. Label asynchronous boundaries explicitly.
- Show one dominant success path. Put alternatives, retries, and failures in
  lightly tinted regions aligned to the messages they affect.
- Replace activation-box formalism with subtle emphasis only when execution
  ownership would otherwise be ambiguous.

Verify that chronological order remains obvious even when message labels are
hidden and that crossing arrows are unnecessary.

## Flow/state

Use flow/state for decisions, lifecycle changes, validation, orchestration, and
recovery logic.

- Use rounded rectangles for actions or states, diamonds for consequential
  decisions, and small ellipses for entry and terminal outcomes.
- Put a short question in each decision and put outcomes such as `valid`,
  `timeout`, or `retry` on outgoing arrows.
- Make the happy path the strongest continuous route. Give failure and recovery
  paths a quieter semantic color, then reconnect them visibly or terminate
  them.
- For state-focused diagrams, name nodes as conditions (`Pending`, `Paid`) and
  arrows as events (`payment.confirmed`). For process-focused diagrams, name
  nodes as actions (`Validate payment`).
- Show loops only when their exit condition is explicit. Mark timeouts,
  queues, and human waits as meaningful boundaries rather than ordinary steps.

Use a single left-to-right or top-to-bottom direction. A path passes review when
every decision has labeled outcomes and every reachable branch has a visible
continuation or terminal state.

## Shared visual language

- Treat UML symbols as a compact vocabulary, not a compliance target. Prefer a
  short label or tiny legend when a symbol could be read two ways.
- Keep domain elements prominent and notation quiet. Theme color should encode
  role, boundary, or state rather than decorate every node differently.
- Prefer meaningful whitespace and direct connectors over dense grids.
- Use verified names from the code, issue, specification, or product model.
  Mark proposed elements as `proposed` or visually distinguish them from
  implemented behavior.
- Title the diagram with the scenario or design question, not only the notation
  type: `Checkout authorization sequence` is stronger than `Sequence diagram`.

## Review criteria

Before export, verify that the diagram answers its primary question, uses one
consistent notation per region, distinguishes implemented facts from proposals,
and remains understandable to a developer who does not know formal UML.
