export class SDKGenerator {
  public generateTS(spec: any): string {
    let code = `/**\n * Strongly Typed Client generated from OpenAPI\n */\n`;
    code += `import { SDKClient } from './runtime';\n\n`;
    code += `export class GeneratedSDKClient extends SDKClient {\n`;

    const paths = spec.paths || {};
    for (const [pathKey, methods] of Object.entries(paths)) {
      const pathParams = pathKey.match(/{([a-zA-Z0-9_]+)}/g) || [];
      const cleanPath = pathKey.replace(/{/g, '${');

      for (const [methodKey, operationVal] of Object.entries(methods as any)) {
        const op = operationVal as any;
        const method = methodKey.toUpperCase();
        
        let methodName = methodKey.toLowerCase() + pathKey
          .replace(/\/v[0-9]+\//, '')
          .replace(/:/g, '')
          .replace(/{/g, '')
          .replace(/}/g, '')
          .split('/')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join('');

        code += `  /**\n`;
        if (op.summary) code += `   * ${op.summary}\n`;
        if (op.description) code += `   * ${op.description}\n`;
        code += `   */\n`;

        const args: string[] = [];
        pathParams.forEach(p => {
          const name = p.replace(/{/g, '').replace(/}/g, '');
          args.push(`${name}: string`);
        });

        if (op.requestBody) {
          args.push(`body: any`);
        }
        args.push(`options?: any`);

        code += `  public async ${methodName}(${args.join(', ')}): Promise<any> {\n`;
        code += `    return this.request({\n`;
        code += `      method: '${method}',\n`;
        code += `      url: \`\${this.config.baseUrl}${cleanPath}\`,\n`;
        if (op.requestBody) {
          code += `      body,\n`;
        }
        code += `      ...options\n`;
        code += `    });\n`;
        code += `  }\n\n`;
      }
    }

    code += `}\n`;
    return code;
  }
}
