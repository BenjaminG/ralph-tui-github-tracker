/**
 * ABOUTME: GitHub Issues tracker plugin for ralph-tui.
 * Uses GitHub's native GraphQL API for issue dependencies (blockedBy/blocking)
 * and hierarchy (parent/subIssues). Authenticates via the gh CLI.
 */

import { BaseTrackerPlugin } from './base-tracker.js';
import type {
  TaskCompletionResult,
  TaskFilter,
  TrackerPluginMeta,
  TrackerTask,
  TrackerTaskStatus,
  SyncResult,
} from 'ralph-tui';

import * as gh from './gh-client.js';
import {
  mapGitHubIssueToTask,
  parseIssueNumber,
  formatTaskId,
  IN_PROGRESS_LABEL,
} from './mappers.js';

export class GitHubTrackerPlugin extends BaseTrackerPlugin {
  readonly meta: TrackerPluginMeta = {
    id: 'github',
    name: 'GitHub Issues Tracker',
    description: 'Track tasks using GitHub Issues with native dependencies and sub-issues',
    version: '0.1.0',
    supportsBidirectionalSync: false,
    supportsHierarchy: true,
    supportsDependencies: true,
  };

  private owner = '';
  private repo = '';
  private epicId = '';
  private epicNumber: number | null = null;
  private filterLabels: string[] = [];

  override async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    // Extract config options
    if (typeof config.epicId === 'number') {
      this.epicNumber = config.epicId;
      this.epicId = formatTaskId(config.epicId);
    } else if (typeof config.epicId === 'string' && config.epicId) {
      this.epicNumber = parseIssueNumber(config.epicId);
      this.epicId = formatTaskId(this.epicNumber);
    }

    if (Array.isArray(config.labels)) {
      this.filterLabels = config.labels.map(String);
    } else if (typeof config.labels === 'string' && config.labels) {
      this.filterLabels = [config.labels];
    }

    // Allow explicit repo override
    if (typeof config.repo === 'string' && config.repo.includes('/')) {
      const [owner, name] = config.repo.split('/');
      this.owner = owner;
      this.repo = name;
    }

    // Detect repo from git remote if not explicitly set
    if (!this.owner || !this.repo) {
      try {
        const repoInfo = await gh.detectRepo();
        this.owner = repoInfo.owner;
        this.repo = repoInfo.name;
      } catch (err) {
        this.ready = false;
        console.error(
          `GitHub tracker: failed to detect repo: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
    }

    // Verify gh CLI is available
    try {
      await gh.execGh(['auth', 'status']);
    } catch (err) {
      this.ready = false;
      console.error(
        `GitHub tracker: gh CLI not authenticated: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    // Verify epic exists if specified
    if (this.epicNumber) {
      try {
        await gh.getIssue(this.owner, this.repo, this.epicNumber);
      } catch (err) {
        this.ready = false;
        console.error(
          `GitHub tracker: epic issue #${this.epicNumber} not found: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
    }

    this.ready = true;
  }

  setEpicId(epicId: string): void {
    if (epicId) {
      this.epicNumber = parseIssueNumber(epicId);
      this.epicId = formatTaskId(this.epicNumber);
    } else {
      this.epicNumber = null;
      this.epicId = '';
    }
  }

  getEpicId(): string {
    return this.epicId;
  }

  override async getTasks(filter?: TaskFilter): Promise<TrackerTask[]> {
    let issues: gh.GitHubIssue[];

    if (this.epicNumber) {
      issues = await gh.getSubIssues(this.owner, this.repo, this.epicNumber);
    } else {
      issues = await gh.getRepoIssues(
        this.owner,
        this.repo,
        this.filterLabels.length > 0 ? this.filterLabels : undefined,
      );
    }

    const tasks = issues.map(mapGitHubIssueToTask);
    return this.filterTasks(tasks, filter);
  }

  override async getTask(id: string): Promise<TrackerTask | undefined> {
    try {
      const number = parseIssueNumber(id);
      const issue = await gh.getIssue(this.owner, this.repo, number);
      return mapGitHubIssueToTask(issue);
    } catch {
      return undefined;
    }
  }

  override async updateTaskStatus(
    id: string,
    status: TrackerTaskStatus,
  ): Promise<TrackerTask | undefined> {
    const number = parseIssueNumber(id);

    try {
      switch (status) {
        case 'in_progress': {
          // Reopen if closed, add in-progress label
          const current = await gh.getIssue(this.owner, this.repo, number);
          if (current.state === 'CLOSED') {
            await gh.reopenIssue(this.owner, this.repo, number);
          }
          if (!current.labels.includes(IN_PROGRESS_LABEL)) {
            await gh.addLabel(this.owner, this.repo, number, IN_PROGRESS_LABEL);
          }
          break;
        }
        case 'open': {
          // Reopen if closed, remove in-progress label
          const current = await gh.getIssue(this.owner, this.repo, number);
          if (current.state === 'CLOSED') {
            await gh.reopenIssue(this.owner, this.repo, number);
          }
          if (current.labels.includes(IN_PROGRESS_LABEL)) {
            await gh.removeLabel(this.owner, this.repo, number, IN_PROGRESS_LABEL);
          }
          break;
        }
        case 'completed':
        case 'cancelled': {
          const current = await gh.getIssue(this.owner, this.repo, number);
          if (current.labels.includes(IN_PROGRESS_LABEL)) {
            await gh.removeLabel(this.owner, this.repo, number, IN_PROGRESS_LABEL);
          }
          if (current.state === 'OPEN') {
            await gh.closeIssue(this.owner, this.repo, number);
          }
          break;
        }
        case 'blocked': {
          // Treat blocked as open (GitHub has no blocked state)
          const current = await gh.getIssue(this.owner, this.repo, number);
          if (current.labels.includes(IN_PROGRESS_LABEL)) {
            await gh.removeLabel(this.owner, this.repo, number, IN_PROGRESS_LABEL);
          }
          break;
        }
      }

      return this.getTask(id);
    } catch (err) {
      console.error(
        `GitHub tracker: failed to update status for ${id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  override async completeTask(
    id: string,
    reason?: string,
  ): Promise<TaskCompletionResult> {
    const number = parseIssueNumber(id);

    try {
      // Remove in-progress label if present
      const current = await gh.getIssue(this.owner, this.repo, number);
      if (current.labels.includes(IN_PROGRESS_LABEL)) {
        await gh.removeLabel(this.owner, this.repo, number, IN_PROGRESS_LABEL);
      }

      // Close the issue
      if (current.state === 'OPEN') {
        await gh.closeIssue(this.owner, this.repo, number);
      }

      // Add completion comment
      const comment = reason
        ? `Completed by ralph-tui: ${reason}`
        : 'Completed by ralph-tui';
      await gh.addComment(this.owner, this.repo, number, comment);

      const task = await this.getTask(id);

      return {
        success: true,
        message: `Task ${id} completed`,
        task,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Failed to complete task ${id}`,
        error: message,
      };
    }
  }

  override async getEpics(): Promise<TrackerTask[]> {
    if (!this.epicNumber) {
      return [];
    }

    try {
      const issue = await gh.getIssue(this.owner, this.repo, this.epicNumber);
      const subIssues = await gh.getSubIssues(this.owner, this.repo, this.epicNumber);
      const completedCount = subIssues.filter(
        (i) => i.state === 'CLOSED',
      ).length;

      const task = mapGitHubIssueToTask(issue);
      return [{
        ...task,
        type: 'epic',
        metadata: {
          ...task.metadata,
          totalCount: subIssues.length,
          completedCount,
        },
      }];
    } catch {
      return [];
    }
  }

  override async sync(): Promise<SyncResult> {
    return {
      success: true,
      message: 'GitHub tracker is API-backed; no sync required',
      syncedAt: new Date().toISOString(),
    };
  }

  async getPrdContext(): Promise<{
    name: string;
    description?: string;
    content: string;
    completedCount: number;
    totalCount: number;
  } | null> {
    if (!this.epicNumber) {
      return null;
    }

    try {
      const issue = await gh.getIssue(this.owner, this.repo, this.epicNumber);
      const subIssues = await gh.getSubIssues(this.owner, this.repo, this.epicNumber);
      const completedCount = subIssues.filter((i) => i.state === 'CLOSED').length;

      return {
        name: issue.title,
        description: issue.body || undefined,
        content: issue.body || '',
        completedCount,
        totalCount: subIssues.length,
      };
    } catch {
      return null;
    }
  }
}
