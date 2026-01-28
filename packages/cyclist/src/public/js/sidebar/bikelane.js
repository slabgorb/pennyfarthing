/**
 * BikeLane Module - Workflow visualization
 *
 * Renders workflow visualization including:
 * - Workflow type badge (TDD, BDD, etc.)
 * - Phase progress visualization with icons
 * - Phase history timeline with durations
 * - Collapse/expand with persistence
 *
 * HTML elements:
 * - #bikelane-section - Section container (collapsible)
 * - .workflow-type-badge - Workflow type badge
 * - .phase-progress - Phase progress visualization
 * - .phase-history-list - Phase history timeline
 */

/**
 * Format workflow type for display
 * @param {string} type - Workflow type
 * @returns {string} Formatted type
 */
export function formatWorkflowType(type) {
  if (!type) return '\u2014';

  const upperTypes = ['tdd', 'bdd'];
  if (upperTypes.includes(type.toLowerCase())) {
    return type.toUpperCase();
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Render phase progress visualization HTML
 * @param {Array} phases - Array of phase objects
 * @returns {string} HTML string
 */
export function renderPhaseProgress(phases) {
  if (!phases || phases.length === 0) return '';

  return phases.map((phase, index) => {
    const statusClass = phase.status || 'pending';
    const icon = statusClass === 'done' ? '\u2713' : statusClass === 'current' ? '\u25CF' : '\u25CB';
    const label = phase.label || phase.agent?.toUpperCase() || phase.name?.toUpperCase() || '';
    const name = phase.name?.toUpperCase() || '';

    let html = '';

    if (index > 0) {
      html += '<span class="phase-arrow">\u2192</span>';
    }

    html += `
      <div class="phase-step ${statusClass}">
        <span class="phase-icon">${icon}</span>
        <span class="phase-label">${label}</span>
        <span class="phase-name">${name}</span>
      </div>
    `;

    return html;
  }).join('');
}

/**
 * Render phase history timeline HTML
 * @param {Array} history - Array of history entries
 * @returns {string} HTML string
 */
export function renderPhaseHistory(history) {
  if (!history || history.length === 0) return '';

  return history.map(entry => {
    const statusClass = entry.status || 'pending';
    const icon = statusClass === 'done' ? '\u2713' : statusClass === 'current' ? '\u2192' : '\u25CB';
    const phase = entry.phase?.toUpperCase() || '';
    const agent = entry.agent || '';

    let durationText = '';
    if (entry.status === 'done' && entry.duration) {
      durationText = entry.duration;
    } else if (entry.status === 'current') {
      durationText = '<span class="in-progress">in progress</span>';
    } else if (entry.status === 'pending') {
      durationText = 'pending';
    }

    return `
      <div class="phase-history-item ${statusClass}">
        <span class="history-icon">${icon}</span>
        <span class="history-phase">${phase}</span>
        <span class="history-agent">${agent}</span>
        <span class="history-duration">${durationText}</span>
      </div>
    `;
  }).join('');
}

/**
 * Render collapsed phase summary
 * @param {Array} phases - Array of phase objects
 * @returns {string} HTML string
 */
export function renderPhaseSummary(phases) {
  if (!phases || phases.length === 0) return '';

  return phases.map(phase => {
    const label = phase.label || phase.agent?.toUpperCase() || phase.name || '';
    const isCurrent = phase.status === 'current';
    return isCurrent
      ? `<span class="current">${label}</span>`
      : label;
  }).join(' \u2192 ');
}

/**
 * Update the BikeLane section with workflow data
 * @param {Object|null} workflow - Workflow data or null
 */
export function update(workflow) {
  const section = document.getElementById('bikelane-section');
  if (!section) return;

  if (!workflow) {
    section.classList.add('hidden');
    section.style.display = 'none';
    return;
  }

  section.classList.remove('hidden');
  section.style.display = '';

  // Update workflow type badge
  const badge = section.querySelector('.workflow-type-badge');
  if (badge) {
    badge.textContent = formatWorkflowType(workflow.type);
    badge.setAttribute('data-workflow-type', workflow.type || '');
  }

  // Update phase summary (collapsed view)
  const summary = section.querySelector('.phase-summary');
  if (summary) {
    summary.innerHTML = renderPhaseSummary(workflow.phases);
  }

  // Update phase progress visualization
  const progress = section.querySelector('.phase-progress');
  if (progress) {
    progress.innerHTML = renderPhaseProgress(workflow.phases);
  }

  // Update phase history
  const historyList = section.querySelector('.phase-history-list');
  if (historyList) {
    historyList.innerHTML = renderPhaseHistory(workflow.phaseHistory);
  }
}

/**
 * Initialize bikelane module
 */
export function init() {
  // Register with collapsed sections system if available
  if (window.collapsedSections?.initSection) {
    window.collapsedSections.initSection('bikelane-section');
  }

  // Export to window for backward compatibility
  window.bikelaneSection = {
    update,
    formatWorkflowType,
    renderPhaseProgress,
    renderPhaseHistory,
    renderPhaseSummary,
  };

  console.log('[BikeLane] Module initialized');
}

/**
 * Clear the BikeLane section
 * MSSCI-12471: Called on context clear to reset workflow visualization
 * @export
 */
export function clearBikeLane() {
  // Hide the section
  const section = document.getElementById('bikelane-section');
  if (section) {
    section.classList.add('hidden');
    section.style.display = 'none';
  }

  // Clear workflow name (for test DOM structure)
  const workflowName = document.getElementById('workflow-name');
  if (workflowName) {
    workflowName.textContent = '';
  }

  // Clear the badge
  const badge = document.querySelector('.workflow-type-badge');
  if (badge) {
    badge.textContent = '';
  }

  // Clear phase visualizations
  const progress = document.querySelector('.phase-progress');
  if (progress) {
    progress.innerHTML = '';
  }

  const historyList = document.querySelector('.phase-history-list');
  if (historyList) {
    historyList.innerHTML = '';
  }

  const summary = document.querySelector('.phase-summary');
  if (summary) {
    summary.innerHTML = '';
  }

  console.log('[BikeLane] Cleared workflow visualization');
}

/**
 * Cleanup bikelane module
 */
export function destroy() {
  // No cleanup needed
}

// Legacy exports
export const updateBikelaneSection = update;
