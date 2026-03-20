/**
 * ABOUTME: Entry point for the ralph-tui GitHub Issues tracker plugin.
 * Exports the plugin factory as default export, which is what ralph-tui's
 * plugin registry expects from user plugins.
 */

import { GitHubTrackerPlugin } from './github-tracker.js';
import type { TrackerPluginFactory } from 'ralph-tui';

export { GitHubTrackerPlugin } from './github-tracker.js';
export type { GitHubIssue, RepoInfo } from './gh-client.js';

const createGitHubTracker: TrackerPluginFactory = () => new GitHubTrackerPlugin();
export default createGitHubTracker;
