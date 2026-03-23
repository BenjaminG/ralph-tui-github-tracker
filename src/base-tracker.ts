/**
 * ABOUTME: Local copy of ralph-tui's BaseTrackerPlugin.
 * Inlined to avoid importing the full ralph-tui package (4MB with tree-sitter).
 * Synced from ralph-tui@0.11.0 src/plugins/trackers/base.ts
 */

import type {
  TrackerPlugin,
  TrackerPluginMeta,
  TrackerTask,
  TrackerTaskStatus,
  TaskFilter,
  TaskCompletionResult,
  SyncResult,
  SetupQuestion,
} from 'ralph-tui';

export abstract class BaseTrackerPlugin implements TrackerPlugin {
  abstract readonly meta: TrackerPluginMeta;

  protected config: Record<string, unknown> = {};
  protected ready = false;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = config;
    this.ready = true;
  }

  async isReady(): Promise<boolean> {
    return this.ready;
  }

  abstract getTasks(filter?: TaskFilter): Promise<TrackerTask[]>;

  async getTask(id: string): Promise<TrackerTask | undefined> {
    const tasks = await this.getTasks();
    return tasks.find((t) => t.id === id);
  }

  async getNextTask(filter?: TaskFilter): Promise<TrackerTask | undefined> {
    const mergedFilter: TaskFilter = {
      ...filter,
      status: ['open', 'in_progress'],
      ready: true,
      type: 'task',
    };

    const tasks = await this.getTasks(mergedFilter);

    if (tasks.length === 0) {
      return undefined;
    }

    tasks.sort((a, b) => a.priority - b.priority);

    const inProgress = tasks.find((t) => t.status === 'in_progress');
    if (inProgress) {
      return inProgress;
    }

    return tasks[0];
  }

  abstract completeTask(
    id: string,
    reason?: string
  ): Promise<TaskCompletionResult>;

  abstract updateTaskStatus(
    id: string,
    status: TrackerTaskStatus
  ): Promise<TrackerTask | undefined>;

  async isComplete(filter?: TaskFilter): Promise<boolean> {
    const tasks = await this.getTasks(filter);
    return tasks.every(
      (t) => t.status === 'completed' || t.status === 'cancelled'
    );
  }

  async sync(): Promise<SyncResult> {
    return {
      success: true,
      message: 'Sync not required for this tracker',
      syncedAt: new Date().toISOString(),
    };
  }

  async isTaskReady(id: string): Promise<boolean> {
    const task = await this.getTask(id);
    if (!task) {
      return false;
    }

    const allTasks = await this.getTasks();
    return this.checkTaskReady(task, allTasks);
  }

  async getEpics(): Promise<TrackerTask[]> {
    const tasks = await this.getTasks({ type: 'epic' });
    return tasks.filter((t) => !t.parentId);
  }

  getSetupQuestions(): SetupQuestion[] {
    return [];
  }

  async validateSetup(
    _answers: Record<string, unknown>
  ): Promise<string | null> {
    return null;
  }

  async dispose(): Promise<void> {
    this.ready = false;
  }

  getTemplate(): string {
    return `## Task
**ID**: {{taskId}}
**Title**: {{taskTitle}}

{{#if prdContent}}
## PRD Context
<details>
<summary>Full PRD Document</summary>

{{prdContent}}

</details>
{{/if}}

{{#if codebasePatterns}}
## Codebase Patterns (Study These First)
{{codebasePatterns}}
{{/if}}

{{#if taskDescription}}
## Description
{{taskDescription}}
{{/if}}

{{#if acceptanceCriteria}}
## Acceptance Criteria
{{acceptanceCriteria}}
{{/if}}

{{#if dependsOn}}
**Dependencies**: {{dependsOn}}
{{/if}}

{{#if recentProgress}}
## Recent Progress
{{recentProgress}}
{{/if}}

## Instructions
Complete the task described above.

**IMPORTANT**: If the work is already complete, verify it works correctly and signal completion immediately.

When finished, signal completion with:
<promise>COMPLETE</promise>
`;
  }

  protected filterTasks(
    tasks: TrackerTask[],
    filter?: TaskFilter
  ): TrackerTask[] {
    if (!filter) {
      return tasks;
    }

    let result = tasks;

    if (filter.status) {
      const statuses = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      result = result.filter((t) => statuses.includes(t.status));
    }

    if (filter.labels && filter.labels.length > 0) {
      result = result.filter((t) =>
        filter.labels!.every((label) => t.labels?.includes(label))
      );
    }

    if (filter.priority !== undefined) {
      const priorities = Array.isArray(filter.priority)
        ? filter.priority
        : [filter.priority];
      result = result.filter((t) => priorities.includes(t.priority));
    }

    if (filter.parentId) {
      result = result.filter((t) => t.parentId === filter.parentId);
    }

    if (filter.assignee) {
      result = result.filter((t) => t.assignee === filter.assignee);
    }

    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      result = result.filter((t) => t.type && types.includes(t.type));
    }

    if (filter.excludeIds && filter.excludeIds.length > 0) {
      const excludeSet = new Set(filter.excludeIds);
      result = result.filter((t) => !excludeSet.has(t.id));
    }

    if (filter.ready) {
      result = result.filter((t) => this.checkTaskReady(t, tasks));
    }

    if (filter.offset && filter.offset > 0) {
      result = result.slice(filter.offset);
    }

    if (filter.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  protected checkTaskReady(task: TrackerTask, allTasks: TrackerTask[]): boolean {
    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true;
    }

    return task.dependsOn.every((depId) => {
      const depTask = allTasks.find((t) => t.id === depId);
      return (
        !depTask ||
        depTask.status === 'completed' ||
        depTask.status === 'cancelled'
      );
    });
  }
}
