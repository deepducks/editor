import type {
  Workflow,
  FlowStep,
  Participant,
  ParticipantType,
  RetryConfig,
  InputDefinition,
  WorkflowOutput,
} from '../types/workflow';

export interface NodeMetadata {
  id: string;
  kind: 'participant' | 'inline' | 'anonymous' | 'loop' | 'parallel' | 'if' | 'wait' | 'emit' | 'inputs' | 'output';
  label: string;
  participantType?: ParticipantType;
  timeout?: string;
  onError?: string;
  retry?: RetryConfig;
  when?: string;
  input?: string | Record<string, string>;
  run?: string;
  cwd?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  path?: string;
  server?: string;
  tool?: string;
  event?: string;
  payload?: unknown;
  ack?: boolean;
  until?: string;
  max?: number | string;
  as?: string;
  loopSteps?: string[];
  condition?: string;
  thenSteps?: string[];
  elseSteps?: string[];
  waitEvent?: string;
  match?: string;
  waitUntil?: string;
  poll?: string;
  waitTimeout?: string;
  onTimeout?: string;
  inputSchema?: Record<string, InputDefinition | null>;
  outputMapping?: WorkflowOutput;
}

export interface MermaidResult {
  code: string;
  nodeMap: Map<string, NodeMetadata>;
}

/** A block returned from processSteps: entry node, exit node, and possibly different */
interface Block {
  entry: string;
  exit: string;
}

// Helpers

function isInlineParticipant(step: unknown): step is Record<string, unknown> & { type: string } {
  return typeof step === 'object' && step !== null && 'type' in step;
}

function isWaitStep(step: unknown): step is { wait: Record<string, unknown> } {
  return typeof step === 'object' && step !== null && 'wait' in step && Object.keys(step as object).length === 1;
}

function isLoopStep(step: unknown): step is { loop: Record<string, unknown> } {
  return typeof step === 'object' && step !== null && 'loop' in step;
}

function isParallelStep(step: unknown): step is { parallel: unknown[] } {
  return typeof step === 'object' && step !== null && 'parallel' in step;
}

function isIfStep(step: unknown): step is { if: Record<string, unknown> } {
  return typeof step === 'object' && step !== null && 'if' in step;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

/** Quote a label for Mermaid using double quotes to avoid special char issues */
function q(str: string): string {
  return `"${str.replace(/"/g, '#quot;')}"`;
}

class MermaidBuilder {
  private lines: string[] = [];
  private clicks: string[] = [];
  private counter = 0;
  private nodeMap = new Map<string, NodeMetadata>();
  private participants: Record<string, Participant>;

  constructor(private workflow: Workflow) {
    this.participants = workflow.participants ?? {};
  }

  private nextId(prefix: string): string {
    // Sanitize prefix: only alphanumeric and underscore
    const safe = prefix.replace(/[^a-zA-Z0-9_]/g, '_');
    return `${safe}_${this.counter++}`;
  }

  private addNode(id: string, meta: NodeMetadata) {
    this.nodeMap.set(id, meta);
    this.clicks.push(`click ${id} onNodeClick`);
  }

  /** Chain blocks sequentially with --> edges */
  private chainBlocks(blocks: Block[]) {
    for (let i = 0; i < blocks.length - 1; i++) {
      this.lines.push(`${blocks[i].exit} --> ${blocks[i + 1].entry}`);
    }
  }

  generate(): MermaidResult {
    this.lines.push('flowchart TD');
    this.lines.push('');

    // Class definitions
    this.lines.push('classDef inline stroke-dasharray: 5 5');
    this.lines.push('classDef anon stroke-dasharray: 5 5,fill:#45475a');
    this.lines.push('classDef waitCls fill:#313244,stroke:#89b4fa');
    this.lines.push('classDef emitCls fill:#45475a,stroke:#f9e2af');
    this.lines.push('classDef ioCls fill:#313244,stroke:#a6e3a1');
    this.lines.push('');

    const blocks: Block[] = [];

    // Inputs node
    if (this.workflow.inputs && Object.keys(this.workflow.inputs).length > 0) {
      const id = 'inputs_node';
      this.lines.push(`${id}([${q('inputs')}]):::ioCls`);
      this.addNode(id, { id, kind: 'inputs', label: 'inputs', inputSchema: this.workflow.inputs });
      blocks.push({ entry: id, exit: id });
    }

    // Process flow steps
    const stepBlocks = this.processSteps(this.workflow.flow);
    blocks.push(...stepBlocks);

    // Output node
    if (this.workflow.output) {
      const id = 'output_node';
      this.lines.push(`${id}([${q('output')}]):::ioCls`);
      this.addNode(id, { id, kind: 'output', label: 'output', outputMapping: this.workflow.output });
      blocks.push({ entry: id, exit: id });
    }

    // Sequential edges between top-level blocks
    this.chainBlocks(blocks);

    this.lines.push('');
    this.lines.push(...this.clicks);

    return { code: this.lines.join('\n'), nodeMap: this.nodeMap };
  }

  private processSteps(steps: FlowStep[]): Block[] {
    const blocks: Block[] = [];

    for (const step of steps) {
      if (typeof step === 'string') {
        const block = this.emitParticipantRef(step);
        blocks.push(block);
        continue;
      }

      if (isLoopStep(step)) {
        blocks.push(this.emitLoop(step));
        continue;
      }

      if (isParallelStep(step)) {
        blocks.push(this.emitParallel(step));
        continue;
      }

      if (isIfStep(step)) {
        blocks.push(this.emitIf(step));
        continue;
      }

      if (isWaitStep(step)) {
        blocks.push(this.emitWait(step));
        continue;
      }

      if (isInlineParticipant(step)) {
        blocks.push(this.emitInline(step));
        continue;
      }

      // Participant override
      const obj = step as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 1) {
        blocks.push(this.emitOverride(keys[0], obj[keys[0]] as Record<string, unknown>));
      }
    }

    return blocks;
  }

  private emitParticipantRef(name: string): Block {
    const id = this.nextId(name);
    const participant = this.participants[name];
    this.lines.push(`${id}[${q(name)}]`);
    this.addNode(id, {
      id, kind: 'participant', label: name,
      participantType: participant?.type as ParticipantType,
      timeout: participant?.timeout, onError: participant?.onError,
      retry: participant?.retry, input: participant?.input as string | Record<string, string>,
      run: (participant as any)?.run, cwd: (participant as any)?.cwd,
      url: (participant as any)?.url, method: (participant as any)?.method,
      headers: (participant as any)?.headers, body: (participant as any)?.body,
      path: (participant as any)?.path, server: (participant as any)?.server,
      tool: (participant as any)?.tool, event: (participant as any)?.event,
      payload: (participant as any)?.payload, ack: (participant as any)?.ack,
    });
    return { entry: id, exit: id };
  }

  private emitLoop(step: { loop: Record<string, unknown> }): Block {
    const loopDef = step.loop;
    const sgId = this.nextId('loop_sg');
    const loopLabel = loopDef.as ? `loop: ${loopDef.as}` : 'loop';

    this.lines.push(`subgraph ${sgId} [${q(loopLabel)}]`);

    const innerSteps = (loopDef.steps ?? []) as FlowStep[];
    const innerBlocks = this.processSteps(innerSteps);

    // Chain inner blocks
    this.chainBlocks(innerBlocks);

    // Back-edge
    if (innerBlocks.length > 1) {
      this.lines.push(`${innerBlocks[innerBlocks.length - 1].exit} -. ${q('loop')} .-> ${innerBlocks[0].entry}`);
    }

    this.lines.push('end');

    const stepNames = innerSteps.map(s => typeof s === 'string' ? s : '(step)');
    this.addNode(sgId, {
      id: sgId, kind: 'loop', label: loopLabel,
      until: loopDef.until as string, max: loopDef.max as number | string,
      as: loopDef.as as string, loopSteps: stepNames,
    });

    // Subgraph entry/exit: first inner block's entry, last inner block's exit
    if (innerBlocks.length > 0) {
      return { entry: sgId, exit: sgId };
    }
    return { entry: sgId, exit: sgId };
  }

  private emitParallel(step: { parallel: unknown[] }): Block {
    const forkId = this.nextId('par_fork');
    const joinId = this.nextId('par_join');

    this.lines.push(`${forkId}{${q('parallel')}}`);
    this.lines.push(`${joinId}([${q('join')}])`);

    this.addNode(forkId, { id: forkId, kind: 'parallel', label: 'parallel' });
    this.addNode(joinId, { id: joinId, kind: 'parallel', label: 'join' });

    const branches = step.parallel as FlowStep[];
    for (const branch of branches) {
      const branchSteps = Array.isArray(branch) ? branch : [branch];
      const branchBlocks = this.processSteps(branchSteps);

      // Chain within branch
      this.chainBlocks(branchBlocks);

      if (branchBlocks.length > 0) {
        this.lines.push(`${forkId} --> ${branchBlocks[0].entry}`);
        this.lines.push(`${branchBlocks[branchBlocks.length - 1].exit} --> ${joinId}`);
      } else {
        this.lines.push(`${forkId} --> ${joinId}`);
      }
    }

    return { entry: forkId, exit: joinId };
  }

  private emitIf(step: { if: Record<string, unknown> }): Block {
    const ifDef = step.if;
    const condStr = truncate(String(ifDef.condition ?? '?'), 25);
    const ifId = this.nextId('if');

    this.lines.push(`${ifId}{${q(condStr)}}`);

    this.addNode(ifId, {
      id: ifId, kind: 'if', label: condStr,
      condition: ifDef.condition as string,
      thenSteps: ((ifDef.then ?? []) as FlowStep[]).map(s => typeof s === 'string' ? s : '(step)'),
      elseSteps: ifDef.else ? (ifDef.else as FlowStep[]).map(s => typeof s === 'string' ? s : '(step)') : undefined,
    });

    const thenBlocks = this.processSteps((ifDef.then ?? []) as FlowStep[]);
    const elseBlocks = ifDef.else ? this.processSteps(ifDef.else as FlowStep[]) : [];

    // Convergence node
    const mergeId = this.nextId('merge');
    this.lines.push(`${mergeId}(( ))`);

    // Then branch
    this.chainBlocks(thenBlocks);
    if (thenBlocks.length > 0) {
      this.lines.push(`${ifId} -- ${q('then')} --> ${thenBlocks[0].entry}`);
      this.lines.push(`${thenBlocks[thenBlocks.length - 1].exit} --> ${mergeId}`);
    }

    // Else branch
    this.chainBlocks(elseBlocks);
    if (elseBlocks.length > 0) {
      this.lines.push(`${ifId} -- ${q('else')} --> ${elseBlocks[0].entry}`);
      this.lines.push(`${elseBlocks[elseBlocks.length - 1].exit} --> ${mergeId}`);
    }

    // No else: skip edge
    if (!ifDef.else) {
      this.lines.push(`${ifId} -- ${q('skip')} --> ${mergeId}`);
    }

    return { entry: ifId, exit: mergeId };
  }

  private emitWait(step: { wait: Record<string, unknown> }): Block {
    const waitDef = step.wait;
    const id = this.nextId('wait');
    this.lines.push(`${id}([${q('wait')}]):::waitCls`);
    this.addNode(id, {
      id, kind: 'wait', label: 'wait',
      waitEvent: waitDef.event as string, match: waitDef.match as string,
      waitUntil: waitDef.until as string, poll: waitDef.poll as string,
      waitTimeout: waitDef.timeout as string, onTimeout: waitDef.onTimeout as string,
    });
    return { entry: id, exit: id };
  }

  private emitInline(step: Record<string, unknown> & { type: string }): Block {
    const obj = step;
    const pType = obj.type as ParticipantType;
    const asName = obj.as as string | undefined;
    const hasWhen = !!obj.when;

    if (pType === 'emit') {
      const id = this.nextId('emit');
      const evtName = (obj.event as string) ?? 'emit';
      const label = asName ?? evtName;
      this.lines.push(`${id}>${q(label)}]:::emitCls`);
      this.addNode(id, {
        id, kind: asName ? 'inline' : 'anonymous', label,
        participantType: 'emit', as: asName, when: obj.when as string,
        event: obj.event as string, payload: obj.payload, ack: obj.ack as boolean,
      });
      return { entry: id, exit: id };
    }

    const isNamed = !!asName;
    const kind = isNamed ? 'inline' : 'anonymous';
    const id = this.nextId(isNamed ? asName! : 'anon');
    const label = (asName ?? pType) + (hasWhen ? ' ◇' : '');
    const cls = isNamed ? ':::inline' : ':::anon';
    this.lines.push(`${id}[${q(label)}]${cls}`);
    this.addNode(id, {
      id, kind, label: asName ?? pType,
      participantType: pType, as: asName, when: obj.when as string,
      timeout: obj.timeout as string, onError: obj.onError as string,
      retry: obj.retry as RetryConfig, input: obj.input as string | Record<string, string>,
      run: obj.run as string, cwd: obj.cwd as string,
      url: obj.url as string, method: obj.method as string,
      headers: obj.headers as Record<string, string>, body: obj.body,
      path: obj.path as string, server: obj.server as string, tool: obj.tool as string,
    });
    return { entry: id, exit: id };
  }

  private emitOverride(name: string, overrides: Record<string, unknown>): Block {
    const participant = this.participants[name];
    const hasWhen = !!overrides?.when;
    const id = this.nextId(name);
    const label = name + (hasWhen ? ' ◇' : '');
    this.lines.push(`${id}[${q(label)}]`);
    this.addNode(id, {
      id, kind: 'participant', label: name,
      participantType: participant?.type as ParticipantType,
      when: overrides?.when as string,
      timeout: (overrides?.timeout ?? participant?.timeout) as string,
      onError: (overrides?.onError ?? participant?.onError) as string,
      retry: (overrides?.retry ?? participant?.retry) as RetryConfig,
      input: overrides?.input as string | Record<string, string>,
      run: (participant as any)?.run, cwd: (participant as any)?.cwd,
      url: (participant as any)?.url, method: (participant as any)?.method,
      headers: (participant as any)?.headers, body: (participant as any)?.body,
      path: (participant as any)?.path, server: (participant as any)?.server,
      tool: (participant as any)?.tool,
    });
    return { entry: id, exit: id };
  }
}

export function generateMermaid(workflow: Workflow): MermaidResult {
  const builder = new MermaidBuilder(workflow);
  return builder.generate();
}
