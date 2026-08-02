import { GraphQuery } from './types';

export class GraphQueryBuilder {
  private query: GraphQuery = {};

  public filterNodeType(nodeType: string): this {
    this.query.nodeType = nodeType;
    return this;
  }

  public filterEdgeType(edgeType: string): this {
    this.query.edgeType = edgeType;
    return this;
  }

  public hasProperty(name: string, value: any): this {
    if (!this.query.propertyFilters) {
      this.query.propertyFilters = {};
    }
    this.query.propertyFilters[name] = value;
    return this;
  }

  public matchesText(searchQuery: string): this {
    this.query.searchQuery = searchQuery;
    return this;
  }

  public limit(limitNum: number): this {
    this.query.limit = limitNum;
    return this;
  }

  public build(): GraphQuery {
    return { ...this.query };
  }
}
