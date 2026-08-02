import { Tool, ToolContext } from '../tools';
import { MCPTool } from './types';
import { MCPRuntime } from './runtime';

export class MCPToolAdapter implements Tool {
  public name: string;
  public description: string;
  public category = 'mcp';
  public schema: any;

  constructor(
    private mcpRuntime: MCPRuntime,
    private serverId: string,
    private mcpTool: MCPTool
  ) {
    this.name = mcpTool.name;
    this.description = mcpTool.description;
    this.schema = mcpTool.schema;
  }

  public async execute(args: Record<string, any>, context: ToolContext): Promise<any> {
    return this.mcpRuntime.invokeTool(this.serverId, this.name, args);
  }
}
