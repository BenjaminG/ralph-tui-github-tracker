/**
 * ABOUTME: Maps GitHub Issues to ralph-tui TrackerTask format.
 * Handles status mapping (OPEN/CLOSED + in-progress label),
 * priority extraction from labels, and dependency resolution.
 */

import type { TaskPriority, TrackerTask, TrackerTaskStatus } from 'ralph-tui';
import type { GitHubIssue } from './gh-client.js';

/** Label used to track in-progress status (GitHub only has OPEN/CLOSED). */
export const IN_PROGRESS_LABEL = 'ralph:in-progress';

/** Prefix for priority labels (e.g., "priority:1"). */
const PRIORITY_LABEL_PREFIX = 'priority:';

/** Default priority when no priority label is present. */
const DEFAULT_PRIORITY: TaskPriority = 2;

/**
 * Map a GitHub issue state + labels to a TrackerTaskStatus.
 * GitHub only has OPEN/CLOSED, so we use the ralph:in-progress label
 * to distinguish between open and in_progress.
 */
export function mapStatus(state: 'OPEN' | 'CLOSED', labels: string[]): TrackerTaskStatus {
  if (state === 'CLOSED') {
    return 'completed';
  }
  if (labels.includes(IN_PROGRESS_LABEL)) {
    return 'in_progress';
  }
  return 'open';
}

/**
 * Extract priority from labels. Looks for "priority:N" label.
 * Returns DEFAULT_PRIORITY (2) if no priority label found.
 */
export function extractPriority(labels: string[]): TaskPriority {
  for (const label of labels) {
    if (label.startsWith(PRIORITY_LABEL_PREFIX)) {
      const num = parseInt(label.slice(PRIORITY_LABEL_PREFIX.length), 10);
      if (num >= 0 && num <= 4) {
        return num as TaskPriority;
      }
    }
  }
  return DEFAULT_PRIORITY;
}

/**
 * Filter out internal labels (priority:N, ralph:in-progress) from the labels list.
 * Returns only user-facing labels.
 */
export function filterUserLabels(labels: string[]): string[] {
  return labels.filter(
    (l) => !l.startsWith(PRIORITY_LABEL_PREFIX) && l !== IN_PROGRESS_LABEL,
  );
}

/**
 * Format an issue number as a task ID string.
 * Uses "#N" format for readability within the repo context.
 */
export function formatTaskId(issueNumber: number): string {
  return `#${issueNumber}`;
}

/** Parse an issue number from a task ID string like "#42". */
export function parseIssueNumber(taskId: string): number {
  return parseInt(taskId.replace('#', ''), 10);
}

/**
 * Convert a GitHub issue to a ralph-tui TrackerTask.
 */
export function mapGitHubIssueToTask(issue: GitHubIssue): TrackerTask {
  const status = mapStatus(issue.state, issue.labels);
  const priority = extractPriority(issue.labels);
  const userLabels = filterUserLabels(issue.labels);

  const hasSubIssues = issue.subIssuesCount > 0;
  const type = hasSubIssues ? 'epic' : 'task';

  const dependsOn = issue.blockedBy.length > 0
    ? issue.blockedBy.map(formatTaskId)
    : undefined;

  const blocks = issue.blocking.length > 0
    ? issue.blocking.map(formatTaskId)
    : undefined;

  const parentId = issue.parent
    ? formatTaskId(issue.parent.number)
    : undefined;

  return {
    id: formatTaskId(issue.number),
    title: issue.title,
    status,
    priority,
    description: issue.body || undefined,
    labels: userLabels.length > 0 ? userLabels : undefined,
    type,
    parentId,
    dependsOn,
    blocks,
    assignee: issue.assignees[0],
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    metadata: {
      githubUrl: issue.url,
      githubNodeId: issue.id,
      issueNumber: issue.number,
    },
  };
}
