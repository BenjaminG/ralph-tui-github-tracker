/**
 * ABOUTME: Wrapper around the `gh` CLI for GitHub API operations.
 * All GitHub interactions go through this client, which shells out to `gh`
 * for authentication and API calls.
 */

import { spawn } from 'node:child_process';

/** Raw GitHub issue data from GraphQL API. */
export interface GitHubIssue {
  id: string; // Global node ID
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  body: string;
  labels: string[];
  assignees: string[];
  parent: { number: number; title: string } | null;
  subIssuesCount: number;
  blockedBy: number[];
  blocking: number[];
  createdAt: string;
  updatedAt: string;
  url: string;
}

/** Repository owner and name. */
export interface RepoInfo {
  owner: string;
  name: string;
}

const ISSUE_FRAGMENT = `
  fragment IssueFields on Issue {
    id
    number
    title
    state
    body
    url
    createdAt
    updatedAt
    labels(first: 50) { nodes { name } }
    assignees(first: 5) { nodes { login } }
    parent { number title }
    subIssues(first: 1) { totalCount }
    blockedBy(first: 50) { nodes { number } }
    blocking(first: 50) { nodes { number } }
  }
`;

function parseIssueNode(node: Record<string, unknown>): GitHubIssue {
  const labels = node.labels as { nodes: { name: string }[] };
  const assignees = node.assignees as { nodes: { login: string }[] };
  const parent = node.parent as { number: number; title: string } | null;
  const subIssues = node.subIssues as { totalCount: number };
  const blockedBy = node.blockedBy as { nodes: { number: number }[] };
  const blocking = node.blocking as { nodes: { number: number }[] };

  return {
    id: node.id as string,
    number: node.number as number,
    title: node.title as string,
    state: node.state as 'OPEN' | 'CLOSED',
    body: (node.body as string) ?? '',
    url: node.url as string,
    createdAt: node.createdAt as string,
    updatedAt: node.updatedAt as string,
    labels: labels.nodes.map((l) => l.name),
    assignees: assignees.nodes.map((a) => a.login),
    parent,
    subIssuesCount: subIssues.totalCount,
    blockedBy: blockedBy.nodes.map((i) => i.number),
    blocking: blocking.nodes.map((i) => i.number),
  };
}

/**
 * Execute a `gh` CLI command and return stdout.
 * Throws on non-zero exit code.
 */
export function execGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`gh ${args[0]} failed (exit ${code}): ${stderr.trim()}`));
      } else {
        resolve(stdout.trim());
      }
    });
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn gh: ${err.message}. Is gh CLI installed?`));
    });
  });
}

/** Execute a GitHub GraphQL query via `gh api graphql`. */
export async function graphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      if (typeof value === 'number') {
        args.push('-F', `${key}=${value}`);
      } else {
        args.push('-f', `${key}=${String(value)}`);
      }
    }
  }
  const result = await execGh(args);
  const parsed = JSON.parse(result) as { data: T; errors?: { message: string }[] };
  if (parsed.errors?.length) {
    throw new Error(`GraphQL error: ${parsed.errors.map((e) => e.message).join(', ')}`);
  }
  return parsed.data;
}

/** Detect the current repo from git remote via `gh repo view`. */
export async function detectRepo(): Promise<RepoInfo> {
  const result = await execGh(['repo', 'view', '--json', 'owner,name']);
  const parsed = JSON.parse(result) as { owner: { login: string }; name: string };
  return { owner: parsed.owner.login, name: parsed.name };
}

/** Fetch a single issue with full dependency and hierarchy data. */
export async function getIssue(
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubIssue> {
  const data = await graphql<{ repository: { issue: Record<string, unknown> } }>(
    `${ISSUE_FRAGMENT}
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) { ...IssueFields }
      }
    }`,
    { owner, repo, number },
  );
  return parseIssueNode(data.repository.issue);
}

/** Fetch all sub-issues of a parent issue. */
export async function getSubIssues(
  owner: string,
  repo: string,
  parentNumber: number,
): Promise<GitHubIssue[]> {
  const data = await graphql<{
    repository: {
      issue: {
        subIssues: {
          nodes: Record<string, unknown>[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };
    };
  }>(
    `${ISSUE_FRAGMENT}
    query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          subIssues(first: 100, after: $cursor) {
            nodes { ...IssueFields }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }`,
    { owner, repo, number: parentNumber },
  );

  const issues = data.repository.issue.subIssues.nodes.map(parseIssueNode);

  // Handle pagination if needed
  let pageInfo = data.repository.issue.subIssues.pageInfo;
  while (pageInfo.hasNextPage) {
    const nextData = await graphql<{
      repository: {
        issue: {
          subIssues: {
            nodes: Record<string, unknown>[];
            pageInfo: { hasNextPage: boolean; endCursor: string };
          };
        };
      };
    }>(
      `${ISSUE_FRAGMENT}
      query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            subIssues(first: 100, after: $cursor) {
              nodes { ...IssueFields }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      }`,
      { owner, repo, number: parentNumber, cursor: pageInfo.endCursor },
    );
    issues.push(...nextData.repository.issue.subIssues.nodes.map(parseIssueNode));
    pageInfo = nextData.repository.issue.subIssues.pageInfo;
  }

  return issues;
}

/** Fetch open issues from a repo, optionally filtered by labels. */
export async function getRepoIssues(
  owner: string,
  repo: string,
  labels?: string[],
): Promise<GitHubIssue[]> {
  const filterParts = ['states: [OPEN]'];
  if (labels?.length) {
    filterParts.push(`labels: [${labels.map((l) => `"${l}"`).join(', ')}]`);
  }

  const data = await graphql<{
    repository: {
      issues: {
        nodes: Record<string, unknown>[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
    };
  }>(
    `${ISSUE_FRAGMENT}
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        issues(first: 100, after: $cursor, ${filterParts.join(', ')}, orderBy: {field: CREATED_AT, direction: ASC}) {
          nodes { ...IssueFields }
          pageInfo { hasNextPage endCursor }
        }
      }
    }`,
    { owner, repo },
  );

  const issues = data.repository.issues.nodes.map(parseIssueNode);

  let pageInfo = data.repository.issues.pageInfo;
  while (pageInfo.hasNextPage) {
    const nextData = await graphql<{
      repository: {
        issues: {
          nodes: Record<string, unknown>[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };
    }>(
      `${ISSUE_FRAGMENT}
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issues(first: 100, after: $cursor, ${filterParts.join(', ')}, orderBy: {field: CREATED_AT, direction: ASC}) {
            nodes { ...IssueFields }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { owner, repo, cursor: pageInfo.endCursor },
    );
    issues.push(...nextData.repository.issues.nodes.map(parseIssueNode));
    pageInfo = nextData.repository.issues.pageInfo;
  }

  return issues;
}

/** Close a GitHub issue. */
export async function closeIssue(
  owner: string,
  repo: string,
  number: number,
): Promise<void> {
  await execGh(['issue', 'close', String(number), '-R', `${owner}/${repo}`]);
}

/** Reopen a GitHub issue. */
export async function reopenIssue(
  owner: string,
  repo: string,
  number: number,
): Promise<void> {
  await execGh(['issue', 'reopen', String(number), '-R', `${owner}/${repo}`]);
}

/** Add a comment to an issue. */
export async function addComment(
  owner: string,
  repo: string,
  number: number,
  body: string,
): Promise<void> {
  await execGh(['issue', 'comment', String(number), '-R', `${owner}/${repo}`, '--body', body]);
}

/** Add a label to an issue. */
export async function addLabel(
  owner: string,
  repo: string,
  number: number,
  label: string,
): Promise<void> {
  await execGh(['issue', 'edit', String(number), '-R', `${owner}/${repo}`, '--add-label', label]);
}

/** Remove a label from an issue. */
export async function removeLabel(
  owner: string,
  repo: string,
  number: number,
  label: string,
): Promise<void> {
  await execGh(['issue', 'edit', String(number), '-R', `${owner}/${repo}`, '--remove-label', label]);
}

/** Get the node ID for an issue (needed for GraphQL mutations). */
export async function getIssueNodeId(
  owner: string,
  repo: string,
  number: number,
): Promise<string> {
  const result = await execGh([
    'issue', 'view', String(number),
    '-R', `${owner}/${repo}`,
    '--json', 'id',
    '--jq', '.id',
  ]);
  return result;
}

/** Link a child issue as a sub-issue of a parent. */
export async function addSubIssue(
  parentNodeId: string,
  childNodeId: string,
): Promise<void> {
  await graphql(
    `mutation($parentId: ID!, $childId: ID!) {
      addSubIssue(input: { issueId: $parentId, subIssueId: $childId }) {
        issue { id }
      }
    }`,
    { parentId: parentNodeId, childId: childNodeId },
  );
}

/** Set a blocked-by dependency between two issues. */
export async function addBlockedBy(
  issueNodeId: string,
  blockingIssueNodeId: string,
): Promise<void> {
  await graphql(
    `mutation($issueId: ID!, $blockerId: ID!) {
      addBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockerId }) {
        blockedByIssue { id }
      }
    }`,
    { issueId: issueNodeId, blockerId: blockingIssueNodeId },
  );
}
