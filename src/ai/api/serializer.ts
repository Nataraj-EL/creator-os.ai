import { APIResponse, ResponseSerializer } from './types';

export class DefaultResponseSerializer implements ResponseSerializer {
  public serializeJSON(response: APIResponse): string {
    const body: Record<string, any> = {};
    if (response.error) {
      body.error = {
        code: response.error.code,
        message: response.error.message,
        details: response.error.details,
        correlationId: response.error.correlationId
      };
    } else {
      body.data = response.payload;
    }
    return JSON.stringify(body);
  }

  public serializeSSE(event: string, data: any, id?: string): string {
    let chunk = `event: ${event}\n`;
    chunk += `data: ${JSON.stringify(data)}\n`;
    if (id) {
      chunk += `id: ${id}\n`;
    }
    chunk += `\n`;
    return chunk;
  }
}
