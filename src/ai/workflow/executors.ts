import { WorkflowStep } from './types';
import { WorkflowVariables } from './variables';

export interface StepExecutionContext {
  executionId: string;
  workflowId: string;
  services: Record<string, any>;
  resumePayload?: any;
}

export interface StepExecutor {
  execute(step: WorkflowStep, variables: WorkflowVariables, context: StepExecutionContext): Promise<any>;
}

export class StartStepExecutor implements StepExecutor {
  public async execute(step: WorkflowStep, variables: WorkflowVariables): Promise<any> {
    if (step.payload?.inputs) {
      for (const [k, v] of Object.entries(step.payload.inputs)) {
        if (!variables.has(k)) {
          variables.set(k, v);
        }
      }
    }
    return { success: true };
  }
}

export class AgentStepExecutor implements StepExecutor {
  public async execute(step: WorkflowStep, variables: WorkflowVariables, context: StepExecutionContext): Promise<any> {
    const agentRuntime = context.services.agentRuntime;
    if (!agentRuntime) {
      throw new Error("AgentRuntime is not registered in services.");
    }
    const promptTemplate = step.payload.prompt;
    let prompt = promptTemplate;
    const allVars = variables.getAll();
    for (const [k, v] of Object.entries(allVars)) {
      prompt = prompt.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
    }

    const res = await agentRuntime.run({
      requestId: `workflow-agent-${context.executionId}-${step.id}`,
      traceId: `trace-wf-${context.executionId}`,
      creatorId: 'workflow-system',
      workspaceId: 'workflow-workspace',
      prompt
    });

    if (!res.success) {
      throw new Error(res.error || "Agent step failed.");
    }

    const outputVar = step.payload.outputVariable || 'agentOutput';
    variables.set(outputVar, res.output);

    return { success: true, output: res.output };
  }
}

export class ToolStepExecutor implements StepExecutor {
  public async execute(step: WorkflowStep, variables: WorkflowVariables, context: StepExecutionContext): Promise<any> {
    const toolRuntime = context.services.toolRuntime;
    if (!toolRuntime) {
      throw new Error("ToolRuntime is not registered in services.");
    }

    const toolName = step.payload.toolName;
    const toolInput = step.payload.input || {};

    const res = await toolRuntime.execute(toolName, toolInput, {
      requestId: `workflow-tool-${context.executionId}-${step.id}`,
      traceId: `trace-wf-${context.executionId}`,
      creatorId: 'workflow-system',
      workspaceId: 'workflow-workspace',
      sessionId: 'workflow-session'
    });

    if (res.status !== 'SUCCESS') {
      throw new Error(`Tool step "${toolName}" failed: ${res.error || 'Unknown error'}`);
    }

    const outputVar = step.payload.outputVariable || 'toolOutput';
    variables.set(outputVar, res.output);

    return { success: true, output: res.output };
  }
}

export class HumanStepExecutor implements StepExecutor {
  public async execute(step: WorkflowStep, variables: WorkflowVariables, context: StepExecutionContext): Promise<any> {
    if (context.resumePayload !== undefined) {
      const outputVar = step.payload?.outputVariable || 'humanInput';
      variables.set(outputVar, context.resumePayload);
      return { success: true, output: context.resumePayload };
    }
    return { suspend: true };
  }
}

export class ConditionStepExecutor implements StepExecutor {
  public async execute(step: WorkflowStep, variables: WorkflowVariables): Promise<any> {
    const variableName = step.payload.variable;
    const expectedValue = step.payload.value;
    const actualValue = variables.get(variableName);

    const conditionMet = actualValue === expectedValue;
    const nextStepId = conditionMet ? step.payload.trueStepId : step.payload.falseStepId;

    return { success: true, nextStepId };
  }
}

export class ParallelStepExecutor implements StepExecutor {
  public async execute(step: WorkflowStep, variables: WorkflowVariables, context: StepExecutionContext): Promise<any> {
    return { parallel: true, branches: step.nextStepIds || [] };
  }
}

export class DelayStepExecutor implements StepExecutor {
  public async execute(step: WorkflowStep): Promise<any> {
    const delayMs = step.payload.durationMs || 0;
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return { success: true };
  }
}

export class EndStepExecutor implements StepExecutor {
  public async execute(): Promise<any> {
    return { success: true, completed: true };
  }
}

export class StepExecutorRegistry {
  private executors: Map<string, StepExecutor> = new Map();

  constructor() {
    this.register('START', new StartStepExecutor());
    this.register('AGENT', new AgentStepExecutor());
    this.register('TOOL', new ToolStepExecutor());
    this.register('HUMAN', new HumanStepExecutor());
    this.register('CONDITION', new ConditionStepExecutor());
    this.register('PARALLEL', new ParallelStepExecutor());
    this.register('DELAY', new DelayStepExecutor());
    this.register('END', new EndStepExecutor());
  }

  public register(type: string, executor: StepExecutor): void {
    this.executors.set(type.toUpperCase(), executor);
  }

  public resolve(type: string): StepExecutor {
    const executor = this.executors.get(type.toUpperCase());
    if (!executor) {
      throw new Error(`Step executor for type "${type}" is not registered.`);
    }
    return executor;
  }
}
