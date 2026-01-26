/**
 * B-12451: BikeLane Workflow Sidebar Section
 *
 * Renders workflow visualization including:
 * - Workflow type badge (TDD, BDD, etc.)
 * - Phase progress visualization with icons
 * - Phase history timeline with durations
 * - Collapse/expand with persistence
 */

/**
 * Format workflow type for display
 * @param {string} type - Workflow type (tdd, bdd, trivial, etc.)
 * @returns {string} Formatted type for display
 */
export function formatWorkflowType(type) {
  if (!type) return '—';

  // Common types that should be uppercase
  const upperTypes = ['tdd', 'bdd'];
  if (upperTypes.includes(type.toLowerCase())) {
    return type.toUpperCase();
  }

  // Title case for other types
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Render phase progress visualization HTML
 * @param {Array} phases - Array of phase objects {name, agent, label, status}
 * @returns {string} HTML string for phase progress
 */
export function renderPhaseProgress(phases) {
  if (!phases || phases.length === 0) return '';

  return phases.map((phase, index) => {
    const statusClass = phase.status || 'pending';
    const icon = statusClass === 'done' ? '✓' : statusClass === 'current' ? '●' : '○';
    const label = phase.label || phase.agent?.toUpperCase() || phase.name?.toUpperCase() || '';
    const name = phase.name?.toUpperCase() || '';

    let html = '';

    // Add arrow before step (except first)
    if (index > 0) {
      html += '<span class="phase-arrow">→</span>';
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
 * @param {Array} history - Array of history entries {phase, agent, duration, status}
 * @returns {string} HTML string for phase history
 */
export function renderPhaseHistory(history) {
  if (!history || history.length === 0) return '';

  return history.map(entry => {
    const statusClass = entry.status || 'pending';
    const icon = statusClass === 'done' ? '✓' : statusClass === 'current' ? '→' : '○';
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
 * @param {Array} phases - Array of phase objects {name, agent, label, status}
 * @returns {string} HTML string for collapsed summary (e.g., "SM → TEA → Dev → Rev")
 */
export function renderPhaseSummary(phases) {
  if (!phases || phases.length === 0) return '';

  return phases.map(phase => {
    const label = phase.label || phase.agent?.toUpperCase() || phase.name || '';
    const isCurrent = phase.status === 'current';
    return isCurrent
      ? `<span class="current">${label}</span>`
      : label;
  }).join(' → ');
}

/**
 * Update the BikeLane section with workflow data
 * @param {Object|null} workflow - Workflow data or null to hide section
 */
export function updateBikelaneSection(workflow) {
  const section = document.getElementById('bikelane-section');
  if (!section) return;

  // Hide section if no workflow
  if (!workflow) {
    section.classList.add('hidden');
    section.style.display = 'none';
    return;
  }

  // Show section
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
 * Initialize the BikeLane section
 * - Register with collapsed-sections.js for persistence
 * - Set up WebSocket listener for story updates
 */
function initBikelaneSection() {
  // Register with collapsed sections system if available
  if (window.collapsedSections?.initSection) {
    window.collapsedSections.initSection('bikelane-section');
  }

  console.log('[BikeLane] Section initialized');
}

// Export for external use
window.bikelaneSection = {
  update: updateBikelaneSection,
  formatWorkflowType,
  renderPhaseProgress,
  renderPhaseHistory,
  renderPhaseSummary,
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBikelaneSection);
} else {
  initBikelaneSection();
}
