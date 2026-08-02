import { GraphStorage } from './types';

export interface TraversalStrategy {
  traverse(storage: GraphStorage, startNodeId: string, endNodeId?: string): Promise<string[]>;
}

export class BFSTraversalStrategy implements TraversalStrategy {
  public async traverse(storage: GraphStorage, startNodeId: string, endNodeId?: string): Promise<string[]> {
    if (!endNodeId) {
      const visited = new Set<string>();
      const queue: string[] = [startNodeId];
      const result: string[] = [];

      visited.add(startNodeId);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        result.push(curr);

        const neighbors = await storage.getNeighbors(curr);
        for (const n of neighbors) {
          if (!visited.has(n.node.id)) {
            visited.add(n.node.id);
            queue.push(n.node.id);
          }
        }
      }
      return result;
    }

    const queue: string[] = [startNodeId];
    const parent: Map<string, string> = new Map();
    const visited = new Set<string>();

    visited.add(startNodeId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === endNodeId) {
        break;
      }

      const neighbors = await storage.getNeighbors(curr);
      for (const n of neighbors) {
        if (!visited.has(n.node.id)) {
          visited.add(n.node.id);
          parent.set(n.node.id, curr);
          queue.push(n.node.id);
        }
      }
    }

    if (!visited.has(endNodeId)) {
      return [];
    }

    const path: string[] = [];
    let step: string | undefined = endNodeId;
    while (step) {
      path.push(step);
      step = parent.get(step);
    }
    return path.reverse();
  }
}

export class GraphAlgorithms {
  constructor(private storage: GraphStorage) {}

  public async getShortestPath(
    startNodeId: string,
    endNodeId: string,
    strategy: TraversalStrategy = new BFSTraversalStrategy()
  ): Promise<string[] | null> {
    const path = await strategy.traverse(this.storage, startNodeId, endNodeId);
    return path.length > 0 ? path : null;
  }
}
