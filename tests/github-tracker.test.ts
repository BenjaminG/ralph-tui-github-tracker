/**
 * ABOUTME: Tests for the GitHubTrackerPlugin class.
 * Tests plugin metadata, config handling, and task mapping integration.
 * Uses mocked gh-client functions to avoid real API calls.
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { GitHubTrackerPlugin } from '../src/github-tracker.js';

// Mock the gh-client module
const mockDetectRepo = mock(() =>
  Promise.resolve({ owner: 'testowner', name: 'testrepo' }),
);
const mockExecGh = mock(() => Promise.resolve(''));
const mockGetIssue = mock(() =>
  Promise.resolve({
    id: 'I_epic',
    number: 1,
    title: 'Epic Issue',
    state: 'OPEN' as const,
    body: 'Epic description',
    labels: ['epic'],
    assignees: [],
    parent: null,
    subIssuesCount: 3,
    blockedBy: [],
    blocking: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    url: 'https://github.com/testowner/testrepo/issues/1',
  }),
);
const mockGetSubIssues = mock(() =>
  Promise.resolve([
    {
      id: 'I_child1',
      number: 2,
      title: 'US-001: Schema changes',
      state: 'CLOSED' as const,
      body: 'Add column',
      labels: ['priority:1'],
      assignees: ['alice'],
      parent: { number: 1, title: 'Epic Issue' },
      subIssuesCount: 0,
      blockedBy: [],
      blocking: [3],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      url: 'https://github.com/testowner/testrepo/issues/2',
    },
    {
      id: 'I_child2',
      number: 3,
      title: 'US-002: Backend API',
      state: 'OPEN' as const,
      body: 'Create endpoint',
      labels: ['priority:2', 'ralph:in-progress'],
      assignees: [],
      parent: { number: 1, title: 'Epic Issue' },
      subIssuesCount: 0,
      blockedBy: [2],
      blocking: [4],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
      url: 'https://github.com/testowner/testrepo/issues/3',
    },
    {
      id: 'I_child3',
      number: 4,
      title: 'US-003: Build UI',
      state: 'OPEN' as const,
      body: 'Create component',
      labels: ['priority:3'],
      assignees: [],
      parent: { number: 1, title: 'Epic Issue' },
      subIssuesCount: 0,
      blockedBy: [3],
      blocking: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-04T00:00:00Z',
      url: 'https://github.com/testowner/testrepo/issues/4',
    },
  ]),
);
const mockGetRepoIssues = mock(() => Promise.resolve([]));
const mockCloseIssue = mock(() => Promise.resolve());
const mockReopenIssue = mock(() => Promise.resolve());
const mockAddComment = mock(() => Promise.resolve());
const mockAddLabel = mock(() => Promise.resolve());
const mockRemoveLabel = mock(() => Promise.resolve());

mock.module('../src/gh-client.js', () => ({
  detectRepo: mockDetectRepo,
  execGh: mockExecGh,
  getIssue: mockGetIssue,
  getSubIssues: mockGetSubIssues,
  getRepoIssues: mockGetRepoIssues,
  closeIssue: mockCloseIssue,
  reopenIssue: mockReopenIssue,
  addComment: mockAddComment,
  addLabel: mockAddLabel,
  removeLabel: mockRemoveLabel,
  getIssueNodeId: mock(() => Promise.resolve('I_node')),
  addSubIssue: mock(() => Promise.resolve()),
  addBlockedBy: mock(() => Promise.resolve()),
  graphql: mock(() => Promise.resolve({})),
}));

describe('GitHubTrackerPlugin', () => {
  let plugin: GitHubTrackerPlugin;

  beforeEach(() => {
    plugin = new GitHubTrackerPlugin();
    mockDetectRepo.mockClear();
    mockExecGh.mockClear();
    mockGetIssue.mockClear();
    mockGetSubIssues.mockClear();
    mockGetRepoIssues.mockClear();
    mockCloseIssue.mockClear();
    mockAddComment.mockClear();
    mockAddLabel.mockClear();
    mockRemoveLabel.mockClear();
  });

  describe('meta', () => {
    it('has correct plugin metadata', () => {
      expect(plugin.meta.id).toBe('github');
      expect(plugin.meta.name).toBe('GitHub Issues Tracker');
      expect(plugin.meta.supportsDependencies).toBe(true);
      expect(plugin.meta.supportsHierarchy).toBe(true);
    });
  });

  describe('initialize', () => {
    it('detects repo from git remote', async () => {
      await plugin.initialize({ epicId: 1 });
      expect(mockDetectRepo).toHaveBeenCalled();
      expect(await plugin.isReady()).toBe(true);
    });

    it('accepts explicit repo config', async () => {
      await plugin.initialize({ repo: 'owner/repo', epicId: 1 });
      expect(mockDetectRepo).not.toHaveBeenCalled();
    });

    it('accepts numeric epicId', async () => {
      await plugin.initialize({ epicId: 42 });
      expect(plugin.getEpicId()).toBe('#42');
    });

    it('accepts string epicId', async () => {
      await plugin.initialize({ epicId: '#42' });
      expect(plugin.getEpicId()).toBe('#42');
    });

    it('works without epicId', async () => {
      await plugin.initialize({});
      expect(plugin.getEpicId()).toBe('');
      expect(await plugin.isReady()).toBe(true);
    });

    it('parses labels config as array', async () => {
      await plugin.initialize({ labels: ['backend', 'frontend'] });
      expect(await plugin.isReady()).toBe(true);
    });

    it('parses labels config as string', async () => {
      await plugin.initialize({ labels: 'backend' });
      expect(await plugin.isReady()).toBe(true);
    });
  });

  describe('getTasks', () => {
    it('fetches sub-issues when epicId is set', async () => {
      await plugin.initialize({ epicId: 1 });
      const tasks = await plugin.getTasks();

      expect(mockGetSubIssues).toHaveBeenCalledWith('testowner', 'testrepo', 1);
      expect(tasks).toHaveLength(3);
    });

    it('maps tasks correctly', async () => {
      await plugin.initialize({ epicId: 1 });
      const tasks = await plugin.getTasks();

      // First task: completed (CLOSED)
      expect(tasks[0].id).toBe('#2');
      expect(tasks[0].status).toBe('completed');
      expect(tasks[0].priority).toBe(1);

      // Second task: in_progress (OPEN + ralph:in-progress)
      expect(tasks[1].id).toBe('#3');
      expect(tasks[1].status).toBe('in_progress');
      expect(tasks[1].priority).toBe(2);
      expect(tasks[1].dependsOn).toEqual(['#2']);

      // Third task: open
      expect(tasks[2].id).toBe('#4');
      expect(tasks[2].status).toBe('open');
      expect(tasks[2].priority).toBe(3);
      expect(tasks[2].dependsOn).toEqual(['#3']);
    });

    it('fetches repo issues when no epicId', async () => {
      mockGetRepoIssues.mockResolvedValueOnce([]);
      await plugin.initialize({});
      await plugin.getTasks();

      expect(mockGetRepoIssues).toHaveBeenCalledWith('testowner', 'testrepo', undefined);
    });

    it('applies status filter', async () => {
      await plugin.initialize({ epicId: 1 });
      const tasks = await plugin.getTasks({ status: ['open'] });

      expect(tasks.every((t) => t.status === 'open')).toBe(true);
    });
  });

  describe('completeTask', () => {
    const inProgressIssue = {
      id: 'I_child2',
      number: 3,
      title: 'US-002',
      state: 'OPEN' as const,
      body: '',
      labels: ['ralph:in-progress'],
      assignees: [],
      parent: null,
      subIssuesCount: 0,
      blockedBy: [],
      blocking: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      url: 'https://github.com/o/r/issues/3',
    };

    const openIssue = { ...inProgressIssue, labels: [] };

    it('closes issue and adds comment', async () => {
      await plugin.initialize({ epicId: 1 });

      // Queue mock for completeTask's getIssue call (init already consumed one)
      mockGetIssue.mockResolvedValueOnce(inProgressIssue);
      // Queue mock for the getTask call at end of completeTask
      mockGetIssue.mockResolvedValueOnce({ ...inProgressIssue, state: 'CLOSED' as const });

      const result = await plugin.completeTask('#3', 'All tests pass');

      expect(result.success).toBe(true);
      expect(mockRemoveLabel).toHaveBeenCalledWith('testowner', 'testrepo', 3, 'ralph:in-progress');
      expect(mockCloseIssue).toHaveBeenCalledWith('testowner', 'testrepo', 3);
      expect(mockAddComment).toHaveBeenCalledWith(
        'testowner',
        'testrepo',
        3,
        'Completed by ralph-tui: All tests pass',
      );
    });

    it('adds default comment when no reason', async () => {
      await plugin.initialize({ epicId: 1 });

      // Queue mocks for completeTask
      mockGetIssue.mockResolvedValueOnce(openIssue);
      mockGetIssue.mockResolvedValueOnce({ ...openIssue, state: 'CLOSED' as const });

      const result = await plugin.completeTask('#3');

      expect(result.success).toBe(true);
      expect(mockAddComment).toHaveBeenCalledWith(
        'testowner',
        'testrepo',
        3,
        'Completed by ralph-tui',
      );
    });
  });

  describe('setEpicId / getEpicId', () => {
    it('updates epicId', async () => {
      await plugin.initialize({});
      plugin.setEpicId('#99');
      expect(plugin.getEpicId()).toBe('#99');
    });

    it('clears epicId with empty string', async () => {
      await plugin.initialize({ epicId: 42 });
      plugin.setEpicId('');
      expect(plugin.getEpicId()).toBe('');
    });
  });

  describe('sync', () => {
    it('returns success (no-op)', async () => {
      await plugin.initialize({});
      const result = await plugin.sync();
      expect(result.success).toBe(true);
      expect(result.syncedAt).toBeDefined();
    });
  });

  describe('getEpics', () => {
    it('returns epic task when epicId is set', async () => {
      await plugin.initialize({ epicId: 1 });
      const epics = await plugin.getEpics();

      expect(epics).toHaveLength(1);
      expect(epics[0].type).toBe('epic');
      expect(epics[0].metadata?.totalCount).toBe(3);
      expect(epics[0].metadata?.completedCount).toBe(1);
    });

    it('returns empty when no epicId', async () => {
      await plugin.initialize({});
      const epics = await plugin.getEpics();
      expect(epics).toHaveLength(0);
    });
  });

  describe('getPrdContext', () => {
    it('returns epic body as PRD context', async () => {
      await plugin.initialize({ epicId: 1 });
      const context = await plugin.getPrdContext();

      expect(context).not.toBeNull();
      expect(context?.name).toBe('Epic Issue');
      expect(context?.content).toBe('Epic description');
      expect(context?.totalCount).toBe(3);
      expect(context?.completedCount).toBe(1);
    });

    it('returns null when no epicId', async () => {
      await plugin.initialize({});
      const context = await plugin.getPrdContext();
      expect(context).toBeNull();
    });
  });
});
