export class RelationshipRegistry {
  private allowedTypes: Set<string> = new Set([
    'CREATED',
    'PREFERS',
    'BELONGS_TO',
    'REFERENCES',
    'RELATED_TO',
    'WORKS_WITH'
  ]);

  public register(type: string): void {
    this.allowedTypes.add(type.toUpperCase());
  }

  public unregister(type: string): void {
    this.allowedTypes.delete(type.toUpperCase());
  }

  public validateType(type: string): boolean {
    return this.allowedTypes.has(type.toUpperCase());
  }

  public getAllowedTypes(): string[] {
    return Array.from(this.allowedTypes);
  }
}
