import { Serializer } from './types';

export class JSONSerializer implements Serializer {
  public serialize(data: any): string {
    return JSON.stringify(data);
  }

  public deserialize<T = any>(text: string): T {
    return JSON.parse(text);
  }
}
