export class WorkflowVariables {
  private values: Record<string, any> = {};

  constructor(initialValues?: Record<string, any>) {
    if (initialValues) {
      this.values = { ...initialValues };
    }
  }

  public get(name: string): any {
    return this.values[name];
  }

  public set(name: string, value: any): void {
    this.values[name] = value;
  }

  public has(name: string): boolean {
    return name in this.values;
  }

  public delete(name: string): void {
    delete this.values[name];
  }

  public getAll(): Record<string, any> {
    return { ...this.values };
  }
}
