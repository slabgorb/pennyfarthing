/**
 * Git Module - Multi-repo git status display
 *
 * HTML elements:
 * - #git-repos - Container for repo status details
 * - #git-section-summary - Collapsed summary text
 * - #git-section-badge - Badge showing dirty count
 */

/**
 * Build summary text for collapsed git section
 * @param {Array} repos - Array of repo status objects
 * @returns {string} Summary HTML
 */
function buildGitSummary(repos) {
  const dirtyRepos = repos.filter(r => !r.clean);
  const totalDirty = repos.reduce((sum, repo) => sum + (repo.dirtyFiles?.length || 0), 0);

  if (dirtyRepos.length === 0) {
    return '<span class="summary-clean">All clean</span>';
  }

  const repoNames = dirtyRepos.map(r => r.name).join(', ');
  return `<span class="summary-dirty">${repoNames}</span> <span class="summary-count">(${totalDirty} file${totalDirty === 1 ? '' : 's'})</span>`;
}

/**
 * Build detail HTML for expanded git section
 * @param {Array} repos - Array of repo status objects
 * @returns {string} Detail HTML
 */
function buildGitDetail(repos) {
  return repos.map(repo => {
    const statusClass = repo.clean ? 'clean' : 'dirty';
    const statusText = repo.clean ? 'Clean' : 'Dirty';

    let aheadBehind = '';
    if (repo.ahead > 0) aheadBehind += ` \u2191${repo.ahead}`;
    if (repo.behind > 0) aheadBehind += ` \u2193${repo.behind}`;

    const folderName = repo.name;

    let dirtyFilesHtml = '';
    if (!repo.clean && repo.dirtyFiles && repo.dirtyFiles.length > 0) {
      const maxFiles = 10;
      const filesToShow = repo.dirtyFiles.slice(0, maxFiles);
      const remaining = repo.dirtyFiles.length - maxFiles;

      dirtyFilesHtml = `<div class="dirty-files">
        ${filesToShow.map(f => `<div class="dirty-file"><span class="file-status">${f.status}</span>${f.path}</div>`).join('')}
        ${remaining > 0 ? `<div class="dirty-more">+${remaining} more file${remaining === 1 ? '' : 's'}</div>` : ''}
      </div>`;
    }

    return `<div class="repo-row">
      <div class="repo-header">
        <span class="repo-name">${folderName}</span>
        <span class="repo-branch" title="${repo.branch}${aheadBehind}">${repo.branch}${aheadBehind}</span>
        <span class="repo-badge ${statusClass}">${statusText}</span>
      </div>
      ${dirtyFilesHtml}
    </div>`;
  }).join('');
}

/**
 * Update git status display for all configured repos
 * @param {Array} repos - Array of repo status objects
 */
export function update(repos) {
  const detailContainer = document.querySelector('#git-repos');
  const summaryEl = document.querySelector('#git-section-summary');
  const badgeEl = document.querySelector('#git-section-badge');

  if (!detailContainer || !repos || repos.length === 0) return;

  const dirtyRepos = repos.filter(r => !r.clean);
  const totalDirty = repos.reduce((sum, repo) => sum + (repo.dirtyFiles?.length || 0), 0);

  // Update badge
  if (badgeEl) {
    if (dirtyRepos.length > 0) {
      badgeEl.textContent = `${totalDirty}`;
      badgeEl.className = 'section-badge dirty';
      badgeEl.style.display = '';
    } else {
      badgeEl.textContent = '\u2713';
      badgeEl.className = 'section-badge clean';
      badgeEl.style.display = '';
    }
  }

  // Update summary
  if (summaryEl) {
    summaryEl.innerHTML = buildGitSummary(repos);
  }

  // Update detail
  detailContainer.innerHTML = buildGitDetail(repos);
}

/**
 * Initialize git module
 */
export function init() {
  // Export to window for backward compatibility
  window.updateGitStatusAll = update;
}

/**
 * Cleanup git module
 */
export function destroy() {
  // No cleanup needed
}

// Legacy exports
export const updateGitStatusAll = update;
