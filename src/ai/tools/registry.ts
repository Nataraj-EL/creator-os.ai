import { Tool } from './types';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  public register(tool: Tool): void {
    this.tools.set(tool.name.toLowerCase(), tool);
  }

  public unregister(name: string): void {
    this.tools.delete(name.toLowerCase());
  }

  public resolve(name: string): Tool {
    const tool = this.tools.get(name.toLowerCase());
    if (!tool) {
      throw new Error(`[ToolRegistry] Tool "${name}" is not registered.`);
    }
    return tool;
  }

  public listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  public getToolsByCategory(category: string): Tool[] {
    return this.listTools().filter(t => t.category.toLowerCase() === category.toLowerCase());
  }

  public clear(): void {
    this.tools.clear();
  }
}

export const toolRegistry = new ToolRegistry();
