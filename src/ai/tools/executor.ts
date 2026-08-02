import { ToolExecutor, Tool, ToolContext } from './types';

export class DefaultToolExecutor implements ToolExecutor {
  public async execute(tool: Tool, args: Record<string, any>, context: ToolContext): Promise<any> {
    return await tool.execute(args, context);
  }
}

export const toolExecutor = new DefaultToolExecutor();
