/**
 * ABOUTME: Tests for the gh CLI client type shapes.
 * Validates GitHubIssue and RepoInfo types are correctly defined.
 */

import { describe, it, expect } from 'bun:test';
import type { GitHubIssue, RepoInfo } from '../src/gh-client.js';

describe('gh-client', () => {
  describe('GitHubIssue type', () => {
    it('type shape is correct', () => {
      const issue: GitHubIssue = {
        id: 'I_abc',
        number: 1,
        title: 'Test',
        state: 'OPEN',
        body: '',
        labels: [],
        assignees: [],
        parent: null,
        subIssuesCount: 0,
        blockedBy: [],
        blocking: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        url: 'https://github.com/o/r/issues/1',
      };

      expect(issue.number).toBe(1);
      expect(issue.state).toBe('OPEN');
    });

    it('supports parent field', () => {
      const issue: GitHubIssue = {
        id: 'I_abc',
        number: 1,
        title: 'Test',
        state: 'OPEN',
        body: '',
        labels: ['bug'],
        assignees: ['alice'],
        parent: { number: 5, title: 'Parent Epic' },
        subIssuesCount: 0,
        blockedBy: [2, 3],
        blocking: [4],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        url: 'https://github.com/o/r/issues/1',
      };

      expect(issue.parent?.number).toBe(5);
      expect(issue.blockedBy).toEqual([2, 3]);
      expect(issue.blocking).toEqual([4]);
    });
  });

  describe('RepoInfo type', () => {
    it('type shape is correct', () => {
      const info: RepoInfo = {
        owner: 'BenjaminG',
        name: 'ralph-tui-github-tracker',
      };
      expect(info.owner).toBe('BenjaminG');
    });
  });
});
