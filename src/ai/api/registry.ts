import { RouteMetadata, Middleware } from './types';

export class RouteRegistry {
  private routes: RouteMetadata[] = [];

  public register(metadata: RouteMetadata): void {
    const duplicate = this.routes.find(r => r.method === metadata.method && r.path === metadata.path);
    if (duplicate) {
      throw new Error(`Route duplicate registration: ${metadata.method} ${metadata.path}`);
    }
    this.routes.push(metadata);
  }

  public match(method: string, path: string): { metadata: RouteMetadata; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const paramNames: string[] = [];
      const regexStr = route.path.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });
      const regex = new RegExp(`^${regexStr}$`);
      const match = path.match(regex);
      if (match) {
        const params: Record<string, string> = {};
        paramNames.forEach((name, idx) => {
          params[name] = match[idx + 1];
        });
        return { metadata: route, params };
      }
    }
    return null;
  }

  public generateOpenAPI(): any {
    const paths: Record<string, any> = {};

    for (const route of this.routes) {
      const openApiPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }

      const operation: any = {
        summary: route.summary || `${route.method} ${route.path}`,
        description: route.description || '',
        responses: {
          '200': {
            description: 'Successful Response'
          }
        }
      };

      if (route.tags) operation.tags = route.tags;
      if (route.security) operation.security = route.security;

      const parameters: any[] = [];
      if (route.validationSchema?.params) {
        for (const [name, opt] of Object.entries(route.validationSchema.params)) {
          parameters.push({
            name,
            in: 'path',
            required: opt.required ?? true,
            schema: { type: opt.type }
          });
        }
      }
      if (route.validationSchema?.query) {
        for (const [name, opt] of Object.entries(route.validationSchema.query)) {
          parameters.push({
            name,
            in: 'query',
            required: opt.required ?? false,
            schema: { type: opt.type }
          });
        }
      }
      if (parameters.length > 0) {
        operation.parameters = parameters;
      }

      if (route.validationSchema?.body) {
        const properties: Record<string, any> = {};
        const required: string[] = [];
        for (const [name, opt] of Object.entries(route.validationSchema.body)) {
          properties[name] = { type: opt.type };
          if (opt.required) required.push(name);
        }

        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties,
                ...(required.length > 0 ? { required } : {})
              }
            }
          }
        };
      }

      paths[openApiPath][route.method.toLowerCase()] = operation;
    }

    return {
      openapi: '3.0.0',
      info: {
        title: 'AI Platform API Gateway',
        version: '1.0.0'
      },
      paths
    };
  }

  public clear(): void {
    this.routes = [];
  }
}

export class MiddlewareRegistry {
  private list: Array<{ middleware: Middleware; priority: number }> = [];

  public register(middleware: Middleware, priority: number): void {
    this.list.push({ middleware, priority });
  }

  public getMiddlewares(): Middleware[] {
    return this.list
      .sort((a, b) => b.priority - a.priority)
      .map(item => item.middleware);
  }

  public clear(): void {
    this.list = [];
  }
}
