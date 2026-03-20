/**
 * ABOUTME: Tests for GitHub Issue → TrackerTask mapping functions.
 * Covers status mapping, priority extraction, label filtering, and full issue conversion.
 */

import { describe, it, expect } from 'bun:test';
import {
  mapStatus,
  extractPriority,
  filterUserLabels,
  formatTaskId,
  parseIssueNumber,
  mapGitHubIssueToTask,
  IN_PROGRESS_LABEL,
} from '../src/mappers.js';
import type { GitHubIssue } from '../src/gh-client.js';

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 'I_abc123',
    number: 42,
    title: 'Test issue',
    state: 'OPEN',
    body: 'Issue body',
    labels: [],
    assignees: [],
    parent: null,
    subIssuesCount: 0,
    blockedBy: [],
    blocking: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    url: 'https://github.com/owner/repo/issues/42',
    ...overrides,
  };
}

describe('mapStatus', () => {
  it('maps CLOSED to completed', () => {
    expect(mapStatus('CLOSED', [])).toBe('completed');
  });

  it('maps OPEN without in-progress label to open', () => {
    expect(mapStatus('OPEN', [])).toBe('open');
    expect(mapStatus('OPEN', ['bug', 'backend'])).toBe('open');
  });

  it('maps OPEN with ralph:in-progress label to in_progress', () => {
    expect(mapStatus('OPEN', [IN_PROGRESS_LABEL])).toBe('in_progress');
    expect(mapStatus('OPEN', ['bug', IN_PROGRESS_LABEL])).toBe('in_progress');
  });

  it('CLOSED overrides in-progress label', () => {
    expect(mapStatus('CLOSED', [IN_PROGRESS_LABEL])).toBe('completed');
  });
});

describe('extractPriority', () => {
  it('returns default P2 when no priority label', () => {
    expect(extractPriority([])).toBe(2);
    expect(extractPriority(['bug', 'backend'])).toBe(2);
  });

  it('extracts priority from label', () => {
    expect(extractPriority(['priority:0'])).toBe(0);
    expect(extractPriority(['priority:1'])).toBe(1);
    expect(extractPriority(['priority:4'])).toBe(4);
  });

  it('ignores invalid priority values', () => {
    expect(extractPriority(['priority:5'])).toBe(2);
    expect(extractPriority(['priority:-1'])).toBe(2);
    expect(extractPriority(['priority:abc'])).toBe(2);
  });

  it('uses first valid priority label', () => {
    expect(extractPriority(['priority:1', 'priority:3'])).toBe(1);
  });
});

describe('filterUserLabels', () => {
  it('removes priority labels', () => {
    expect(filterUserLabels(['bug', 'priority:1', 'backend'])).toEqual(['bug', 'backend']);
  });

  it('removes ralph:in-progress label', () => {
    expect(filterUserLabels(['bug', IN_PROGRESS_LABEL])).toEqual(['bug']);
  });

  it('keeps regular labels', () => {
    expect(filterUserLabels(['bug', 'feature', 'backend'])).toEqual(['bug', 'feature', 'backend']);
  });

  it('returns empty for only internal labels', () => {
    expect(filterUserLabels(['priority:2', IN_PROGRESS_LABEL])).toEqual([]);
  });
});

describe('formatTaskId / parseIssueNumber', () => {
  it('formats issue number to #N', () => {
    expect(formatTaskId(42)).toBe('#42');
    expect(formatTaskId(1)).toBe('#1');
  });

  it('parses #N back to number', () => {
    expect(parseIssueNumber('#42')).toBe(42);
    expect(parseIssueNumber('#1')).toBe(1);
  });
});

describe('mapGitHubIssueToTask', () => {
  it('maps basic open issue', () => {
    const task = mapGitHubIssueToTask(makeIssue());
    expect(task.id).toBe('#42');
    expect(task.title).toBe('Test issue');
    expect(task.status).toBe('open');
    expect(task.priority).toBe(2);
    expect(task.type).toBe('task');
    expect(task.description).toBe('Issue body');
  });

  it('maps closed issue to completed', () => {
    const task = mapGitHubIssueToTask(makeIssue({ state: 'CLOSED' }));
    expect(task.status).toBe('completed');
  });

  it('maps in-progress issue', () => {
    const task = mapGitHubIssueToTask(
      makeIssue({ labels: [IN_PROGRESS_LABEL, 'priority:1'] }),
    );
    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe(1);
  });

  it('maps issue with dependencies', () => {
    const task = mapGitHubIssueToTask(
      makeIssue({ blockedBy: [10, 20], blocking: [30] }),
    );
    expect(task.dependsOn).toEqual(['#10', '#20']);
    expect(task.blocks).toEqual(['#30']);
  });

  it('maps issue with parent', () => {
    const task = mapGitHubIssueToTask(
      makeIssue({ parent: { number: 5, title: 'Epic' } }),
    );
    expect(task.parentId).toBe('#5');
  });

  it('detects epic type from sub-issues', () => {
    const task = mapGitHubIssueToTask(makeIssue({ subIssuesCount: 3 }));
    expect(task.type).toBe('epic');
  });

  it('maps first assignee', () => {
    const task = mapGitHubIssueToTask(
      makeIssue({ assignees: ['alice', 'bob'] }),
    );
    expect(task.assignee).toBe('alice');
  });

  it('includes metadata', () => {
    const task = mapGitHubIssueToTask(makeIssue());
    expect(task.metadata?.githubUrl).toBe('https://github.com/owner/repo/issues/42');
    expect(task.metadata?.githubNodeId).toBe('I_abc123');
    expect(task.metadata?.issueNumber).toBe(42);
  });

  it('filters internal labels from task labels', () => {
    const task = mapGitHubIssueToTask(
      makeIssue({ labels: ['bug', 'priority:1', IN_PROGRESS_LABEL, 'backend'] }),
    );
    expect(task.labels).toEqual(['bug', 'backend']);
  });

  it('omits labels when only internal labels present', () => {
    const task = mapGitHubIssueToTask(
      makeIssue({ labels: ['priority:2'] }),
    );
    expect(task.labels).toBeUndefined();
  });

  it('omits empty body as undefined', () => {
    const task = mapGitHubIssueToTask(makeIssue({ body: '' }));
    expect(task.description).toBeUndefined();
  });
});
