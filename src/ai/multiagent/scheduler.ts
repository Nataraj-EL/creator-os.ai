import { AgentTask } from './types';

export class TaskScheduler {
  /**
   * Resolves the task dependencies and groups tasks into parallel execution batches.
   * Throws an error if cyclic dependencies are detected.
   */
  public schedule(tasks: AgentTask[]): AgentTask[][] {
    const layers: AgentTask[][] = [];
    const visited = new Set<string>();
    
    let remainingTasks = [...tasks];
    while (remainingTasks.length > 0) {
      const readyTasks = remainingTasks.filter(task => {
        if (!task.dependencies || task.dependencies.length === 0) {
          return true;
        }
        return task.dependencies.every(depId => visited.has(depId));
      });

      if (readyTasks.length === 0) {
        throw new Error("Cyclic dependencies detected in task workflow graph.");
      }

      layers.push(readyTasks);
      for (const t of readyTasks) {
        visited.add(t.id);
      }

      remainingTasks = remainingTasks.filter(task => !visited.has(task.id));
    }

    return layers;
  }
}
