/**
 * ABOUTME: Ambient type declarations for the ralph-tui package.
 * ralph-tui doesn't ship .d.ts files, so we declare its plugin API here.
 * Synced from ralph-tui@0.11.0 src/plugins/trackers/types.ts
 *
 * If ralph-tui ships its own types in the future, delete this file —
 * all imports already use `from 'ralph-tui'` and will resolve automatically.
 */

declare module 'ralph-tui' {
  export type TaskPriority = 0 | 1 | 2 | 3 | 4;

  export type TrackerTaskStatus =
    | 'open'
    | 'in_progress'
    | 'blocked'
    | 'completed'
    | 'cancelled';

  export interface TrackerTask {
    id: string;
    title: string;
    status: TrackerTaskStatus;
    priority: TaskPriority;
    description?: string;
    labels?: string[];
    type?: string;
    parentId?: string;
    dependsOn?: string[];
    blocks?: string[];
    assignee?: string;
    createdAt?: string;
    updatedAt?: string;
    iteration?: number;
    metadata?: Record<string, unknown>;
  }

  export interface TaskCompletionResult {
    success: boolean;
    message: string;
    task?: TrackerTask;
    error?: string;
  }

  export interface SyncResult {
    success: boolean;
    message: string;
    added?: number;
    updated?: number;
    removed?: number;
    error?: string;
    syncedAt: string;
  }

  export interface SetupQuestion {
    id: string;
    prompt: string;
    type: 'text' | 'password' | 'boolean' | 'select' | 'multiselect' | 'path';
    choices?: Array<{ value: string; label: string; description?: string }>;
    default?: string | boolean | string[];
    required?: boolean;
    pattern?: string;
    help?: string;
  }

  export interface TaskFilter {
    status?: TrackerTaskStatus | TrackerTaskStatus[];
    labels?: string[];
    priority?: TaskPriority | TaskPriority[];
    parentId?: string;
    assignee?: string;
    type?: string | string[];
    ready?: boolean;
    limit?: number;
    offset?: number;
    excludeIds?: string[];
  }

  export interface TrackerPluginMeta {
    id: string;
    name: string;
    description: string;
    version: string;
    author?: string;
    supportsBidirectionalSync: boolean;
    supportsHierarchy: boolean;
    supportsDependencies: boolean;
  }

  export interface TrackerPlugin {
    readonly meta: TrackerPluginMeta;
    initialize(config: Record<string, unknown>): Promise<void>;
    isReady(): Promise<boolean>;
    getTasks(filter?: TaskFilter): Promise<TrackerTask[]>;
    getTask(id: string): Promise<TrackerTask | undefined>;
    getNextTask(filter?: TaskFilter): Promise<TrackerTask | undefined>;
    completeTask(id: string, reason?: string): Promise<TaskCompletionResult>;
    updateTaskStatus(id: string, status: TrackerTaskStatus): Promise<TrackerTask | undefined>;
    isComplete(filter?: TaskFilter): Promise<boolean>;
    sync(): Promise<SyncResult>;
    isTaskReady(id: string): Promise<boolean>;
    getEpics(): Promise<TrackerTask[]>;
    setEpicId?(epicId: string): void;
    getEpicId?(): string;
    getSetupQuestions(): SetupQuestion[];
    validateSetup(answers: Record<string, unknown>): Promise<string | null>;
    dispose(): Promise<void>;
    getTemplate(): string;
    getPrdContext?(): Promise<{
      name: string;
      description?: string;
      content: string;
      completedCount: number;
      totalCount: number;
    } | null>;
    getStateFiles?(): string[];
  }

  export type TrackerPluginFactory = () => TrackerPlugin;
}
