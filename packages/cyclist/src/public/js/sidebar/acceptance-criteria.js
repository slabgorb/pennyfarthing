/**
 * Acceptance Criteria Module - AC checklist display with collapse persistence
 *
 * HTML elements:
 * - #ac-section - Section container (collapsible)
 * - #ac-list - AC items list
 * - #ac-progress - Progress indicator (X/Y)
 */

import { settingsSync, STORAGE_KEYS } from '../settings-sync.js';

/**
 * Get AC panel collapsed state
 * @returns {boolean} True if collapsed
 */
function getAcCollapsed() {
  return settingsSync.get(STORAGE_KEYS.AC_COLLAPSED, false) === true;
}

/**
 * Save AC panel collapsed state
 * @param {boolean} collapsed - Whether panel is collapsed
 */
function setAcCollapsed(collapsed) {
  settingsSync.set(STORAGE_KEYS.AC_COLLAPSED, collapsed);
}

/**
 * Update acceptance criteria checklist
 * @param {Array|null} criteria - Array of criteria items
 */
export function update(criteria) {
  const acSection = document.getElementById('ac-section');
  const acList = document.getElementById('ac-list');
  const acProgress = document.getElementById('ac-progress');

  if (!acSection || !acList) return;

  if (!criteria || criteria.length === 0) {
    acSection.style.display = 'none';
    return;
  }

  acSection.style.display = 'block';

  // Update progress count
  const completed = criteria.filter(c => c.completed).length;
  if (acProgress) {
    acProgress.textContent = `(${completed}/${criteria.length})`;
  }

  // Render criteria items
  acList.innerHTML = criteria.map(c =>
    `<div class="ac-item ${c.completed ? 'ac-done' : ''}">
      <span class="ac-text">${c.text}</span>
    </div>`
  ).join('');

  // Respect saved collapse state
  if (getAcCollapsed()) {
    acSection.classList.add('collapsed');
  } else {
    acSection.classList.remove('collapsed');
  }
}

/**
 * Toggle collapse handler
 */
function handleToggleClick() {
  const acSection = document.getElementById('ac-section');
  if (acSection) {
    const isCollapsed = acSection.classList.toggle('collapsed');
    setAcCollapsed(isCollapsed);
  }
}

/**
 * Initialize acceptance criteria module
 */
export function init() {
  const acHeader = document.querySelector('#ac-section .section-header');
  if (acHeader) {
    acHeader.addEventListener('click', handleToggleClick);
  }
}

/**
 * Cleanup acceptance criteria module
 */
export function destroy() {
  const acHeader = document.querySelector('#ac-section .section-header');
  if (acHeader) {
    acHeader.removeEventListener('click', handleToggleClick);
  }
}

// Legacy exports
export const updateAcceptanceCriteria = update;
