# duckflux Editor — Implementation Plan

Target repo: `duckflux/editor`
Stack: React + TypeScript + Monaco Editor + Mermaid.js
Architecture: Split-view web app — YAML editor (right) + Mermaid diagram (left) with click-to-inspect modals.

---

## Product Summary

A browser-based visual editor for duckflux workflow files (`.flow.yaml`). The user edits YAML in a Monaco editor with live linting (JSON Schema + semantic validation), and sees a Mermaid flowchart that updates in real-time. Clicking any node in the diagram opens a modal with full details for that construct. The editor is standalone (no runner dependency) and can be hosted as a static site.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    React App                        │
│                                                     │
│  ┌──────────────┐         ┌────────────────────┐    │
│  │   Mermaid    │         │   Monaco Editor     │    │
│  │   Diagram    │         │   (YAML + linting)  │    │
│  │   (left)     │         │   (right)           │    │
│  │              │         │                      │    │
│  │  click node  │         │  onChange (1s deb.)  │    │
│  │      │       │         │        │             │    │
│  │      ▼       │         │        ▼             │    │
│  │   Modal      │         │   YAML parse         │    │
│  │   (details)  │         │        │             │    │
│  │              │         │   ┌────┴────┐        │    │
│  │              │         │   │         │        │    │
│  │              │         │   ▼         ▼        │    │
│  │              │◄────────│ Mermaid  Diagnostics  │    │
│  │              │  graph  │ syntax   (markers)    │    │
│  └──────────────┘         └────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Data Flow (unidirectional)

1. User edits YAML in Monaco (right panel).
2. After 1 second of inactivity (debounce), the YAML string is parsed.
3. Parse pipeline:
   a. `yaml` library parses YAML string → JS object (with source positions).
   b. `ajv` validates the JS object against `duckflux.schema.json`.
   c. Custom semantic validator checks cross-references, reserved names, etc.
4. Validation errors are published as Monaco diagnostic markers (red/yellow squiggly lines).
5. If parse succeeds, the JS object is converted to Mermaid flowchart syntax.
6. Mermaid renders the diagram in the left panel.
7. User clicks a node → a modal opens with full details for that workflow element.

---

## Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `react` | UI framework | 19.x |
| `react-dom` | DOM rendering | 19.x |
| `typescript` | Type safety | 5.x |
| `vite` | Build tool and dev server | 6.x |
| `@monaco-editor/react` | Monaco Editor React wrapper | latest |
| `monaco-editor` | Code editor (peer dep) | latest |
| `mermaid` | Diagram rendering | 11.x |
| `yaml` | YAML parsing with source positions (Eemeli Aro's lib) | 2.x |
| `ajv` | JSON Schema validation (draft 2020-12) | 8.x |
| `ajv-formats` | Format keyword support for ajv | latest |
| `tailwindcss` | Styling | 4.x |

No backend. Fully static client-side app.

---

## Project Structure

```
duckflux-editor/
├── public/
│   └── index.html
├── src/
│   ├── main.tsx                    # App entry point
│   ├── App.tsx                     # Root layout: split-view with resizable panels
│   │
│   ├── components/
│   │   ├── EditorPanel.tsx         # Monaco Editor wrapper (right panel)
│   │   ├── DiagramPanel.tsx        # Mermaid renderer (left panel)
│   │   ├── NodeModal.tsx           # Detail modal for clicked nodes
│   │   ├── Toolbar.tsx             # Top bar: load/save file, examples dropdown, schema version
│   │   └── StatusBar.tsx           # Bottom bar: error count, parse status, cursor position
│   │
│   ├── core/
│   │   ├── parser.ts              # YAML string → parsed workflow object
│   │   ├── validator.ts           # JSON Schema + semantic validation → diagnostics
│   │   ├── mermaid-generator.ts   # Parsed workflow → Mermaid syntax string
│   │   └── node-metadata.ts       # Extract detail metadata per node for modal display
│   │
│   ├── schema/
│   │   └── duckflux.schema.json   # Embedded copy of the duckflux JSON Schema (v0.3)
│   │
│   ├── types/
│   │   └── workflow.ts            # TypeScript types mirroring duckflux spec model
│   │
│   ├── hooks/
│   │   ├── useWorkflow.ts         # Central state: raw YAML, parsed workflow, diagnostics, mermaid code
│   │   └── useDebounce.ts         # Generic debounce hook
│   │
│   ├── examples/
│   │   ├── minimal.flow.yaml      # Raw YAML strings embedded as TS constants
│   │   ├── loop.flow.yaml
│   │   ├── parallel.flow.yaml
│   │   ├── code-review.flow.yaml
│   │   └── index.ts               # Exports all examples with labels
│   │
│   └── styles/
│       └── mermaid-theme.css      # Custom CSS classes for Mermaid node types
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── README.md
```

---

## Phase 0 — Project Bootstrap

### Tasks

- [ ] Initialize project with Vite + React + TypeScript template: `npm create vite@latest duckflux-editor -- --template react-ts`
- [ ] Install all dependencies listed in the Dependencies table above.
- [ ] Configure Tailwind CSS 4 (PostCSS plugin setup).
- [ ] Create the directory structure from the Project Structure section above (empty files with placeholder exports).
- [ ] Copy `duckflux.schema.json` (v0.3) into `src/schema/`.
- [ ] Set up a basic `App.tsx` that renders two placeholder panels side by side (50/50 horizontal split).
- [ ] Confirm `npm run dev` starts the dev server and renders the placeholder layout.

### Exit Criteria

- `npm run dev` serves a page with two visible panels.
- All dependencies install without errors.

---

## Phase 1 — TypeScript Types

### File: `src/types/workflow.ts`

Define TypeScript interfaces that mirror the duckflux spec v0.3 model. These types are used by the parser, validator, and Mermaid generator. They do NOT need custom YAML unmarshaling (that's the parser's job) — they are plain TS interfaces.

### Tasks

- [ ] Define all types:
  ```typescript
  // Core types to define:
  interface Workflow {
    id?: string;
    name?: string;
    version?: string | number;
    defaults?: Defaults;
    inputs?: Record<string, InputField | null>;
    participants?: Record<string, Participant>;
    flow: FlowStep[];
    output?: WorkflowOutput;
  }

  interface Defaults {
    timeout?: string;
    cwd?: string;
  }

  interface InputField {
    type?: string;
    description?: string;
    default?: any;
    required?: boolean;
    format?: string;
    enum?: any[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    items?: InputField;
  }

  type ParticipantType = 'exec' | 'http' | 'mcp' | 'workflow' | 'emit';

  interface Participant {
    type: ParticipantType;
    as?: string;
    timeout?: string;
    onError?: string;
    retry?: RetryConfig;
    input?: string | Record<string, string>;
    output?: Record<string, InputField>;
    // exec
    run?: string;
    cwd?: string;
    // http
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string | Record<string, any>;
    // workflow
    path?: string;
    // mcp
    server?: string;
    tool?: string;
    // emit
    event?: string;
    payload?: string | Record<string, any>;
    ack?: boolean;
  }

  interface RetryConfig {
    max: number;
    backoff?: string;
    factor?: number;
  }

  // FlowStep is a union — represented as a type with optional fields
  // The parser determines which variant it is.
  interface FlowStep {
    // One of these will be set:
    participantRef?: string;          // simple string reference
    loop?: LoopStep;
    parallel?: FlowStep[];
    if?: IfStep;
    wait?: WaitStep;
    inlineParticipant?: InlineParticipant;
    participantOverride?: ParticipantOverride;
  }

  interface LoopStep {
    as?: string;
    until?: string;
    max?: number | string;
    steps: FlowStep[];
  }

  interface IfStep {
    condition: string;
    then: FlowStep[];
    else?: FlowStep[];
  }

  interface WaitStep {
    event?: string;
    match?: string;
    until?: string;
    poll?: string;
    timeout?: string;
    onTimeout?: string;
  }

  interface InlineParticipant extends Participant {
    when?: string;
  }

  interface ParticipantOverride {
    participantName: string;
    when?: string;
    timeout?: string;
    onError?: string;
    retry?: RetryConfig;
    input?: string | Record<string, string>;
    workflow?: string;
  }

  type WorkflowOutput = string | Record<string, string>;
  ```
- [ ] Export all types.

### Exit Criteria

- All types compile with `tsc --noEmit`.
- Types cover every construct in the duckflux v0.3 schema.

---

## Phase 2 — YAML Parser

### File: `src/core/parser.ts`

Parse a raw YAML string into the `Workflow` type. Use the `yaml` library (Eemeli Aro) which preserves source map positions for error reporting.

### Tasks

- [ ] Implement `parseWorkflow(yamlString: string): ParseResult`
  ```typescript
  interface ParseResult {
    workflow: Workflow | null;
    errors: ParseError[];
  }

  interface ParseError {
    message: string;
    line: number;   // 1-based
    column: number; // 1-based
    severity: 'error' | 'warning';
  }
  ```
- [ ] Handle YAML syntax errors: catch `yaml` library parse errors and convert to `ParseError` with line/column from the library's error position data.
- [ ] Implement flow step discrimination logic. The raw YAML for `flow` items is polymorphic. Determine the variant by inspecting keys:
  - If the item is a string → `participantRef`
  - If the item has key `loop` → `LoopStep`
  - If the item has key `parallel` → `parallel`
  - If the item has key `if` → `IfStep`
  - If the item has key `wait` → `WaitStep`
  - If the item has key `type` → `InlineParticipant`
  - Otherwise (single key that is not a reserved construct keyword) → `ParticipantOverride` where the key is the participant name
- [ ] Recursively parse nested flow steps (inside `loop.steps`, `if.then`, `if.else`, `parallel`).
- [ ] Parse `output` field: detect string vs object.
- [ ] Write unit tests for:
  - Minimal workflow (just `flow` with one step)
  - All flow step variants
  - Nested constructs (loop inside parallel, if inside loop)
  - Invalid YAML syntax → correct error line/column
  - Missing `flow` → parse error

### Exit Criteria

- Parser correctly transforms all duckflux v0.3 constructs into TypeScript types.
- Parse errors include accurate line numbers.

---

## Phase 3 — JSON Schema and Semantic Validation

### File: `src/core/validator.ts`

Two-layer validation: JSON Schema (structural) then semantic (cross-reference) checks.

### Tasks

- [ ] **JSON Schema validation with ajv:**
  - [ ] Import and compile `duckflux.schema.json` with `ajv` (draft 2020-12 support requires `ajv` 8.x with `ajv/dist/2020` import).
  - [ ] Validate the raw parsed JS object (before transformation to `Workflow` type) against the schema.
  - [ ] Convert ajv errors to `ParseError[]` with line/column positions. Use the `yaml` library's CST/source map to map JSON pointer paths from ajv errors back to YAML line numbers.
  - [ ] Important: ajv's `instancePath` gives a JSON pointer (e.g., `/flow/0/loop/steps/1`). Map this back to the YAML source position using `yaml`'s `Document` node range data.

- [ ] **Semantic validation (post-parse, operates on `Workflow` object):**
  - [ ] Participant reference check: every `participantRef` in `flow` must exist in `participants` map OR be a named inline participant's `as` value defined earlier in the flow.
  - [ ] `onError` redirect target: if `onError` value is not `fail`, `skip`, or `retry`, it must be a valid participant name.
  - [ ] Reserved name check: participant names and inline `as` values must not use reserved names (`workflow`, `execution`, `input`, `output`, `env`, `loop`, `event`).
  - [ ] Inline `as` uniqueness: all inline `as` values must be unique across all top-level participant names and all other inline `as` values (including nested in `if`/`loop`/`parallel`).
  - [ ] Loop constraint: `loop` must have at least `until` or `max`.
  - [ ] Flow non-empty: `flow` must have at least one step (also covered by schema, but double-check).
  - [ ] For each error, resolve the line/column from the parsed YAML document node positions.

- [ ] Implement `validateWorkflow(yamlString: string, parsedDoc: yaml.Document, workflow: Workflow): ParseError[]`

- [ ] Write unit tests for:
  - Schema validation catching invalid participant type (e.g., `type: agent`)
  - Schema validation catching empty flow
  - Semantic validation catching reference to non-existent participant
  - Semantic validation catching reserved name usage
  - Semantic validation catching duplicate inline `as`
  - Correct line numbers on all error types

### Exit Criteria

- Schema validation rejects structurally invalid workflows with mapped line numbers.
- Semantic validation catches cross-reference errors.

---

## Phase 4 — Mermaid Diagram Generator

### File: `src/core/mermaid-generator.ts`

Convert a parsed `Workflow` into a Mermaid flowchart string. Nodes are minimal (short labels), with full details deferred to the modal.

### Tasks

- [ ] Implement `generateMermaid(workflow: Workflow): MermaidResult`
  ```typescript
  interface MermaidResult {
    code: string;           // Mermaid syntax string
    nodeMap: Map<string, NodeMetadata>; // nodeId → metadata for modal
  }
  ```

- [ ] **Node ID generation strategy:**
  - Top-level participant refs: use the participant name (e.g., `build`)
  - Inline named: use the `as` value (e.g., `my_step`)
  - Inline anonymous: generate sequential IDs (e.g., `anon_0`, `anon_1`)
  - Control constructs: generate IDs like `loop_0`, `if_1`, `parallel_2`, `wait_3`
  - Fork/join nodes for parallel: `par_fork_0`, `par_join_0`
  - Use a counter to ensure global uniqueness across the entire diagram.

- [ ] **Node rendering rules (minimal labels):**

  | Construct | Mermaid node syntax | Label content |
  |-----------|-------------------|---------------|
  | Participant ref | `build[build]` | participant name only |
  | Inline named | `my_step[my_step]:::inline` | `as` value |
  | Inline anonymous | `anon_0[exec]:::anon` | participant type only |
  | Parallel fork | `par_fork_0{parallel}` | literal "parallel" |
  | Parallel join | `par_join_0([join])` | literal "join", stadium shape |
  | Loop start | (subgraph start) | label "loop" on the subgraph |
  | If condition | `if_0{condition}` | truncated condition (max 20 chars + "...") |
  | Wait | `wait_0([wait]):::wait` | literal "wait" (stadium shape) |
  | Emit | `emit_0>event_name]:::emit` | event name (asymmetric shape) |
  | Inputs | `inputs_node([inputs]):::io` | literal "inputs" |
  | Output | `output_node([output]):::io` | literal "output" |

- [ ] **Edge rendering rules:**
  - Sequential steps: `A --> B` (plain arrow, no label)
  - If branches: `if_0 -- then --> A` and `if_0 -- else --> B`
  - If without else: `if_0 -- then --> A` and `if_0 -- skip --> next_step` (where `next_step` is the step after the if block)
  - Parallel: `par_fork_0 --> branch_first_step` for each branch, `branch_last_step --> par_join_0` for each branch
  - Loop: rendered as a Mermaid `subgraph` with the last step connecting back to the first step inside the subgraph via a dotted back-edge: `last -. loop .-> first`
  - When guard on a step: indicated by the step node having a `◇` suffix in the label (e.g., `build ◇`) — the guard expression is in the modal.
  - All error-path edges (onError redirect, retry): omitted from diagram. These are shown only in the modal.

- [ ] **Subgraph usage:**
  - `loop` → `subgraph loop_sg_0 [loop]` ... `end`
  - `parallel` → NO subgraph. Use fork/join diamond nodes with multiple branches.
  - `if` → NO subgraph. Use diamond node with labeled edges that reconverge.
  - Nested constructs: subgraphs nest naturally in Mermaid.

- [ ] **CSS class definitions** (output as part of Mermaid init config or as `classDef` statements at the top of the Mermaid code):
  ```
  classDef inline stroke-dasharray: 5 5
  classDef anon stroke-dasharray: 5 5,fill:#f0f0f0
  classDef wait fill:#e0e8f0,stroke:#6080a0
  classDef emit fill:#fff3e0,stroke:#e0a020
  classDef io fill:#e8f5e9,stroke:#4caf50
  ```

- [ ] **Click callbacks:**
  - For every node, append: `click nodeId onNodeClick`
  - `onNodeClick` is a global function name that will be defined in the React app (see Phase 6).

- [ ] **Inputs/Output boundary nodes:**
  - If `workflow.inputs` exists, render an `inputs_node` at the top of the diagram, connected to the first flow step.
  - If `workflow.output` exists, render an `output_node` at the bottom, connected from the last flow step.

- [ ] **Mermaid diagram direction:** Use `flowchart TD` (top-down) by default. Consider making this configurable later.

- [ ] **NodeMetadata structure** (for modal display):
  ```typescript
  interface NodeMetadata {
    id: string;
    kind: 'participant' | 'inline' | 'anonymous' | 'loop' | 'parallel' | 'if' | 'wait' | 'emit' | 'inputs' | 'output';
    label: string;
    // All optional detail fields:
    participantType?: ParticipantType;
    timeout?: string;
    onError?: string;
    retry?: RetryConfig;
    when?: string;
    input?: string | Record<string, string>;
    // exec
    run?: string;
    cwd?: string;
    // http
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    // workflow
    path?: string;
    // mcp
    server?: string;
    tool?: string;
    // emit
    event?: string;
    payload?: any;
    ack?: boolean;
    // loop
    until?: string;
    max?: number | string;
    as?: string;
    loopSteps?: string[];  // names of steps inside
    // if
    condition?: string;
    thenSteps?: string[];
    elseSteps?: string[];
    // wait
    waitEvent?: string;
    match?: string;
    waitUntil?: string;
    poll?: string;
    waitTimeout?: string;
    onTimeout?: string;
    // inputs
    inputSchema?: Record<string, InputField | null>;
    // output
    outputMapping?: WorkflowOutput;
  }
  ```

- [ ] Write unit tests for:
  - Minimal sequential workflow → correct Mermaid syntax
  - Parallel workflow → fork/join pattern
  - Loop workflow → subgraph with back-edge
  - If/else workflow → diamond with labeled branches
  - If without else → diamond with skip edge
  - Mixed nested constructs
  - Anonymous inline → correct anon label and class
  - Emit → correct asymmetric shape
  - Wait → correct stadium shape
  - Click callbacks present for all nodes
  - NodeMap contains correct metadata for each node

### Exit Criteria

- Generator produces valid Mermaid syntax for all duckflux v0.3 constructs.
- Every node has a click callback and corresponding metadata entry.

---

## Phase 5 — Monaco Editor Panel

### File: `src/components/EditorPanel.tsx`

The right panel: Monaco editor configured for YAML with live linting.

### Tasks

- [ ] Use `@monaco-editor/react` to render a Monaco editor instance.
- [ ] Configure Monaco for YAML:
  - Language: `yaml`
  - Theme: a dark theme (e.g., `vs-dark`) — make it togglable later.
  - Tab size: 2 spaces.
  - Minimap: disabled (workflow files are short).
  - Word wrap: on.
  - Font: `JetBrains Mono` or `Fira Code` with fallback to `monospace`.

- [ ] **Linting integration:**
  - [ ] On every content change, call a debounced validation function (1 second debounce — see `useDebounce` hook).
  - [ ] The validation function:
    1. Parses the YAML string (Phase 2 parser).
    2. Runs schema + semantic validation (Phase 3 validator).
    3. Converts `ParseError[]` to Monaco `IMarkerData[]`:
       ```typescript
       {
         severity: error.severity === 'error'
           ? monaco.MarkerSeverity.Error
           : monaco.MarkerSeverity.Warning,
         message: error.message,
         startLineNumber: error.line,
         startColumn: error.column,
         endLineNumber: error.line,
         endColumn: error.column + 1  // minimal range; could be improved later
       }
       ```
    4. Sets markers via `monaco.editor.setModelMarkers(model, 'duckflux', markers)`.
  - [ ] If YAML parse fails entirely, show a single error marker at the error position.
  - [ ] If YAML parse succeeds but schema/semantic validation fails, show all errors as markers.

- [ ] **JSON Schema registration for autocomplete:**
  - [ ] Register the duckflux JSON Schema with Monaco's built-in YAML support.
  - [ ] Note: Monaco does not natively support YAML schema validation out of the box. The `monaco-yaml` package (from `remcohaszing/monaco-yaml`) adds YAML language support with JSON Schema-based autocompletion. Install `monaco-yaml` and configure it with the duckflux schema for autocompletion.
  - [ ] If `monaco-yaml` integration proves complex, defer autocompletion to a later phase and rely solely on the custom linting (ajv + semantic) for error reporting.

- [ ] **Initial content:** Load a default example workflow (e.g., `minimal.flow.yaml`) on first render.

- [ ] **Expose editor content** via the `useWorkflow` hook (Phase 7) so other components can access the current YAML string and parsed state.

### Exit Criteria

- Monaco renders with YAML syntax highlighting.
- Typing triggers debounced validation after 1 second of inactivity.
- Validation errors appear as red squiggly underlines with hover messages.
- Editor content is accessible to other components via shared state.

---

## Phase 6 — Mermaid Diagram Panel

### File: `src/components/DiagramPanel.tsx`

The left panel: renders the Mermaid diagram and handles node click events.

### Tasks

- [ ] **Mermaid initialization:**
  - [ ] Call `mermaid.initialize()` once on mount with configuration:
    ```typescript
    mermaid.initialize({
      startOnLoad: false,      // manual rendering
      theme: 'dark',           // match editor theme; togglable later
      securityLevel: 'loose',  // required for click callbacks to work
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis'
      }
    });
    ```
  - [ ] **IMPORTANT:** `securityLevel: 'loose'` is required for Mermaid click callbacks to call JS functions. With `'strict'` (default), click handlers are stripped.

- [ ] **Rendering pipeline:**
  - [ ] When the Mermaid code string (from `useWorkflow` hook) changes, call `mermaid.render('diagram', mermaidCode)` to get the SVG string.
  - [ ] Insert the SVG string into a container `div` via `dangerouslySetInnerHTML` (or a ref with `.innerHTML`).
  - [ ] Handle render errors (invalid Mermaid syntax): display a friendly error message in the diagram panel instead of crashing.

- [ ] **Click callback setup:**
  - [ ] Define a global function on `window` that Mermaid's click callbacks will invoke:
    ```typescript
    // In DiagramPanel or App:
    useEffect(() => {
      (window as any).onNodeClick = (nodeId: string) => {
        // Look up nodeId in the nodeMap from MermaidResult
        // Open modal with the node's metadata
        setSelectedNode(nodeId);
      };
      return () => { delete (window as any).onNodeClick; };
    }, []);
    ```
  - [ ] The Mermaid code includes `click nodeId onNodeClick` for each node (generated in Phase 4).

- [ ] **Zoom and pan:** Mermaid renders static SVG. For zoom/pan, wrap the SVG container in a simple pan/zoom handler:
  - [ ] Use CSS `transform: scale()` + `translate()` on the container.
  - [ ] Mouse wheel for zoom, mouse drag for pan.
  - [ ] Alternatively, use a lightweight library like `panzoom` (npm package) on the SVG container.
  - [ ] Include a "reset zoom" button.

- [ ] **Empty state:** When no valid workflow is parsed (errors or empty editor), show a placeholder message: "Edit the YAML to see the workflow diagram."

### Exit Criteria

- Mermaid diagram renders from generated code.
- Clicking a node calls the global callback with the correct node ID.
- Diagram updates when the Mermaid code string changes.
- Pan/zoom works on the SVG.

---

## Phase 7 — Central State Hook

### File: `src/hooks/useWorkflow.ts`

Centralized state management connecting the editor, parser, validator, generator, and diagram.

### File: `src/hooks/useDebounce.ts`

Generic debounce hook.

### Tasks

- [ ] **`useDebounce` hook:**
  ```typescript
  function useDebounce<T>(value: T, delayMs: number): T
  ```
  Standard debounce: returns the value only after `delayMs` of no changes.

- [ ] **`useWorkflow` hook:**
  ```typescript
  interface WorkflowState {
    yamlContent: string;
    setYamlContent: (yaml: string) => void;
    parsedWorkflow: Workflow | null;
    diagnostics: ParseError[];
    mermaidCode: string;
    nodeMap: Map<string, NodeMetadata>;
    selectedNodeId: string | null;
    setSelectedNodeId: (id: string | null) => void;
    isValid: boolean;
  }
  ```

  - [ ] `yamlContent` is the source of truth (controlled by Monaco).
  - [ ] `setYamlContent` is called by Monaco's `onChange`.
  - [ ] A `useEffect` watches the **debounced** YAML content (1 second). When it changes:
    1. Parse YAML → `Workflow | null` + `ParseError[]`
    2. If parse OK: validate (schema + semantic) → more `ParseError[]`
    3. If valid: generate Mermaid → `mermaidCode` + `nodeMap`
    4. If any step fails: set `mermaidCode` to empty, keep diagnostics
  - [ ] `selectedNodeId` is set when a diagram node is clicked, cleared when modal closes.
  - [ ] `isValid` is derived: `diagnostics.length === 0 && parsedWorkflow !== null`.

- [ ] Provide this state via React Context so all components can access it without prop drilling.

### Exit Criteria

- Editing YAML triggers debounced parse → validate → generate pipeline.
- All components read from the same shared state.
- Selecting a node updates `selectedNodeId`.

---

## Phase 8 — Node Detail Modal

### File: `src/components/NodeModal.tsx`

Modal/popover that shows full details for a clicked diagram node.

### Tasks

- [ ] **Trigger:** Opens when `selectedNodeId` is non-null. Closes on backdrop click, Escape key, or close button.

- [ ] **Layout:** A centered modal overlay (not a popover positioned near the node — simpler to implement and works with zoom/pan). Dark overlay background.

- [ ] **Content rendering based on `NodeMetadata.kind`:**

  | Kind | Modal content |
  |------|--------------|
  | `participant` | Type badge, timeout, onError, retry config, input mapping, type-specific fields (run, url, method, headers, body, path, server, tool) |
  | `inline` | Same as participant + "Inline" badge |
  | `anonymous` | Same as participant + "Anonymous" badge |
  | `loop` | `until` expression (full), `max` value, `as` alias, list of step names inside |
  | `parallel` | List of branches with step names in each |
  | `if` | Full `condition` expression, list of `then` steps, list of `else` steps |
  | `wait` | Mode (event/sleep/poll), all fields: event, match, until, poll, timeout, onTimeout |
  | `emit` | Event name, payload (formatted), ack flag |
  | `inputs` | Table of input fields: name, type, default, required, description |
  | `output` | Output mapping: either single expression or key→expression table |

- [ ] **CEL expression display:** Render CEL expressions in a monospace font with a subtle background (like an inline code block).

- [ ] **No editing in modal.** The modal is read-only. Editing happens in Monaco. This keeps the flow unidirectional and avoids bidirectional sync complexity.

- [ ] **Styling:** Use Tailwind. Modal width: `max-w-lg`. Sections with clear labels. Use a key-value table layout for fields.

### Exit Criteria

- Clicking any node opens a modal with correct details from the node map.
- Modal closes cleanly.
- All metadata fields are displayed in a readable format.

---

## Phase 9 — Toolbar and Status Bar

### File: `src/components/Toolbar.tsx`
### File: `src/components/StatusBar.tsx`

### Tasks

- [ ] **Toolbar (top bar):**
  - [ ] **Load file button:** Opens a native file picker (`<input type="file" accept=".yaml,.yml">`). Reads the file content and sets it in the editor.
  - [ ] **Save/download button:** Downloads the current YAML content as a `.flow.yaml` file using a Blob URL.
  - [ ] **Examples dropdown:** A `<select>` or dropdown menu listing built-in example workflows (from `src/examples/`). Selecting one replaces the editor content with the example YAML.
  - [ ] **New button:** Clears the editor and loads a minimal template:
    ```yaml
    flow:
      - type: exec
        run: echo "hello"
    ```
  - [ ] **Schema version label:** Static text showing "duckflux v0.3" (from the schema `$id`).

- [ ] **Status bar (bottom bar):**
  - [ ] Error count: "✓ Valid" (green) or "✗ N errors" (red) based on diagnostics.
  - [ ] Parse status indicator: "Parsing..." during debounce wait, "Ready" when idle.

### Exit Criteria

- File load/save works in the browser.
- Examples load correctly into the editor.
- Status bar reflects current validation state.

---

## Phase 10 — Layout, Styling, and Polish

### File: `src/App.tsx` (update)
### File: `src/styles/mermaid-theme.css`

### Tasks

- [ ] **Split-view layout:**
  - [ ] Use CSS `display: grid` with `grid-template-columns` for the two panels.
  - [ ] Add a draggable resize handle between panels. Use a simple mouse drag handler that adjusts the grid column ratio. No library needed — a thin `div` with cursor `col-resize` and a `mousedown`/`mousemove`/`mouseup` handler.
  - [ ] Default split: 50/50.
  - [ ] Panel order: Mermaid diagram on the LEFT, Monaco editor on the RIGHT.

- [ ] **Mermaid theme CSS:**
  - [ ] Define the custom `classDef` styles that match the node types (inline, anon, wait, emit, io).
  - [ ] Ensure Mermaid's dark theme integrates with the overall app dark theme.
  - [ ] Style the Mermaid SVG container to fill the left panel with proper padding.

- [ ] **Responsive behavior:**
  - [ ] On narrow screens (< 768px), stack panels vertically (diagram on top, editor on bottom).
  - [ ] The resize handle becomes a vertical resizer in stacked mode.

- [ ] **Keyboard shortcuts:**
  - [ ] `Ctrl+S` / `Cmd+S`: Save/download the YAML file (prevent browser default).
  - [ ] `Escape`: Close modal if open.

- [ ] **Loading states:**
  - [ ] Show a brief loading spinner while Mermaid renders large diagrams.

### Exit Criteria

- App looks polished with consistent dark theme.
- Panels resize smoothly.
- Works on desktop and tablet viewports.

---

## Phase 11 — Example Workflows

### Files: `src/examples/*.flow.yaml` and `src/examples/index.ts`

### Tasks

- [ ] Embed the following example workflows as string constants in TypeScript files:

  - [ ] **minimal.flow.yaml** — Single exec step. Tests basic rendering.
    ```yaml
    id: minimal
    name: Minimal Workflow
    version: "1"

    participants:
      greet:
        type: exec
        run: echo "Hello, duckflux!"

    flow:
      - greet
    ```

  - [ ] **loop.flow.yaml** — Loop with `until` and `max`. Tests subgraph rendering.
    ```yaml
    id: loop-example
    name: Loop Workflow
    version: "1"

    participants:
      counter:
        type: exec
        run: echo "iteration"
        timeout: 5s

    flow:
      - loop:
          until: counter.output == "done"
          max: 5
          steps:
            - counter
    ```

  - [ ] **parallel.flow.yaml** — Three parallel branches with a follow-up step. Tests fork/join.
    ```yaml
    id: parallel-example
    name: Parallel Workflow
    version: "1"

    participants:
      lint:
        type: exec
        run: echo "linting"
      test:
        type: exec
        run: echo "testing"
      build:
        type: exec
        run: echo "building"
      report:
        type: exec
        run: echo "done"

    flow:
      - parallel:
          - lint
          - test
          - build
      - report
    ```

  - [ ] **conditional.flow.yaml** — If/then/else with a when guard. Tests diamond branching.
    ```yaml
    id: conditional-example
    name: Conditional Workflow
    version: "1"

    participants:
      check:
        type: exec
        run: echo '{"ready":true}'
      deploy:
        type: exec
        run: echo "deploying"
      notify:
        type: http
        url: https://hooks.example.com/notify
        method: POST

    flow:
      - check
      - if:
          condition: check.output.ready == true
          then:
            - deploy
          else:
            - notify
    ```

  - [ ] **full-pipeline.flow.yaml** — Comprehensive example combining loop, parallel, if, wait, emit, inline participants, error handling, retry, and output mapping. Tests all constructs together.
    ```yaml
    id: code-review
    name: Code Review Pipeline
    version: "1"

    defaults:
      timeout: 5m

    inputs:
      branch:
        type: string
        default: "main"
      max_rounds:
        type: integer
        default: 3

    participants:
      coder:
        type: exec
        run: echo '{"status":"coded"}'
        timeout: 30s
        onError: retry
        retry:
          max: 2
          backoff: 1s
      reviewer:
        type: exec
        run: echo '{"approved":true,"score":8}'
        timeout: 30s

    flow:
      - coder
      - loop:
          until: reviewer.output.approved == true
          max: 3
          as: review_round
          steps:
            - reviewer
            - coder:
                when: reviewer.output.approved == false
      - parallel:
          - type: exec
            as: tests
            run: echo "tests passed"
          - type: exec
            as: lint
            run: echo "lint passed"
      - wait:
          timeout: 5s
      - if:
          condition: tests.status == "success"
          then:
            - type: emit
              as: success_event
              event: pipeline.success
              payload:
                score: reviewer.output.score
          else:
            - type: http
              as: alert
              url: https://hooks.example.com/failure
              method: POST

    output:
      approved: reviewer.output.approved
      score: reviewer.output.score
    ```

- [ ] Create `src/examples/index.ts` that exports an array:
  ```typescript
  export const examples = [
    { label: 'Minimal', yaml: minimalYaml },
    { label: 'Loop', yaml: loopYaml },
    { label: 'Parallel', yaml: parallelYaml },
    { label: 'Conditional', yaml: conditionalYaml },
    { label: 'Full Pipeline', yaml: fullPipelineYaml },
  ];
  ```

### Exit Criteria

- All examples load in the editor and render valid diagrams.
- The full-pipeline example exercises every visual construct.

---

## Phase 12 — Testing and Documentation

### Tasks

- [ ] **Unit tests** (use Vitest, bundled with Vite):
  - [ ] `parser.test.ts`: all flow step variants, error positions, edge cases
  - [ ] `validator.test.ts`: schema errors, semantic errors, line number accuracy
  - [ ] `mermaid-generator.test.ts`: all construct types produce valid Mermaid syntax, node map correctness
  - [ ] Run with: `npx vitest run`

- [ ] **Manual integration test checklist:**
  - [ ] Load each example → diagram renders without errors
  - [ ] Click every node type in the diagram → modal opens with correct details
  - [ ] Introduce a typo in YAML → red squiggly appears after 1 second
  - [ ] Reference non-existent participant → semantic error appears
  - [ ] Empty `flow: []` → error appears
  - [ ] Load external `.flow.yaml` file → works
  - [ ] Download → file saves correctly
  - [ ] Resize panels → smooth
  - [ ] Zoom/pan diagram → works

- [ ] **README.md:**
  - [ ] Project description and screenshot/GIF
  - [ ] Quick start: `npm install && npm run dev`
  - [ ] Build: `npm run build` (produces static files in `dist/`)
  - [ ] Deployment: any static host (Netlify, Vercel, GitHub Pages)
  - [ ] Link to duckflux spec
  - [ ] Link to duckflux runner
  - [ ] License: same as duckflux spec

### Exit Criteria

- All unit tests pass.
- All manual integration tests pass.
- README is complete.

---

## Dependency Graph

```
Phase 0  (Bootstrap)
   │
   ▼
Phase 1  (Types)
   │
   ├──► Phase 2  (Parser)
   │       │
   │       ▼
   │    Phase 3  (Validator)
   │       │
   │       ▼
   │    Phase 4  (Mermaid Generator)
   │
   ├──► Phase 5  (Monaco Editor Panel)     [depends on Phase 3 for linting]
   │
   ├──► Phase 6  (Diagram Panel)           [depends on Phase 4 for Mermaid code]
   │
   ▼
Phase 7  (Central State Hook)              [depends on Phases 2-6]
   │
   ├──► Phase 8  (Node Modal)
   │
   ├──► Phase 9  (Toolbar + Status Bar)
   │
   ▼
Phase 10 (Layout + Polish)                 [depends on all above]
   │
   ▼
Phase 11 (Examples)
   │
   ▼
Phase 12 (Tests + Docs)
```

Parallelism: Phases 2 and 5 can start simultaneously after Phase 1. Phase 6 can start as soon as Phase 4 is done.

---

## Deployment Notes

- **Static site.** `npm run build` produces a `dist/` folder. Deploy to any static host.
- **No server-side component.** All parsing, validation, and rendering happen client-side.
- **Target hosting:** `editor.duckflux.openvibes.tech` (or similar).
- **GitHub Pages** works as a zero-cost option via GitHub Actions on push to `main`.

---

## Future Enhancements (out of scope for v1)

- Bidirectional editing (click node → edit in modal → update YAML)
- Diagram direction toggle (TD / LR)
- Dark/light theme toggle
- Sub-workflow expansion (click sub-workflow node → render child workflow inline)
- Share via URL (encode YAML in URL hash or use a short URL service)
- `monaco-yaml` integration for full YAML autocompletion from schema
- Export diagram as PNG/SVG
- VS Code extension wrapping the same functionality