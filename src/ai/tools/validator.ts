import { ToolValidator, Tool } from './types';

export class DefaultToolValidator implements ToolValidator {
  public validate(tool: Tool, args: Record<string, any>): void {
    const schema = tool.schema;
    if (!schema || !schema.parameters) return;

    const required = schema.parameters.required || [];
    for (const req of required) {
      if (args[req] === undefined) {
        throw new Error(`Missing required parameter: "${req}"`);
      }
    }

    const properties = schema.parameters.properties || {};
    for (const [key, val] of Object.entries(args)) {
      const propSchema = properties[key];
      if (propSchema) {
        const expectedType = propSchema.type;
        const actualType = typeof val;

        if (expectedType === 'array') {
          if (!Array.isArray(val)) {
            throw new Error(`Type mismatch for parameter "${key}": expected array, got ${actualType}`);
          }
        } else if (expectedType === 'integer') {
          if (!Number.isInteger(val)) {
            throw new Error(`Type mismatch for parameter "${key}": expected integer, got ${actualType}`);
          }
        } else if (expectedType === 'number') {
          if (actualType !== 'number') {
            throw new Error(`Type mismatch for parameter "${key}": expected number, got ${actualType}`);
          }
        } else if (expectedType === 'boolean') {
          if (actualType !== 'boolean') {
            throw new Error(`Type mismatch for parameter "${key}": expected boolean, got ${actualType}`);
          }
        } else if (expectedType === 'string') {
          if (actualType !== 'string') {
            throw new Error(`Type mismatch for parameter "${key}": expected string, got ${actualType}`);
          }
        }

        if (propSchema.enum && !propSchema.enum.includes(val)) {
          throw new Error(
            `Value mismatch for parameter "${key}": expected one of [${propSchema.enum.join(', ')}], got "${val}"`
          );
        }
      }
    }
  }
}

export const toolValidator = new DefaultToolValidator();
