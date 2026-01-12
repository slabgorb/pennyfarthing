/**
 * Image Preview module for clipboard paste (Story 28-1)
 * Displays thumbnail preview of pasted images before sending
 */

import { IMAGE_PREVIEW_SIZE } from './constants.js';

// ============================================================================
// State
// ============================================================================

/** Whether preview is currently visible */
let previewVisible = false;

/** Current images being previewed */
let currentImages = [];

/** Callback when image is removed */
let onImageRemovedCallback = null;

/** DOM element references (set during runtime) */
let thumbnailElement = null;
let labelElement = null;

// ============================================================================
// Public API
// ============================================================================

/**
 * Show the image preview container
 */
export function showImagePreview() {
  previewVisible = true;
  if (typeof document !== 'undefined') {
    const container = getPreviewContainer();
    if (container) {
      container.classList.remove('hidden');
      container.setAttribute('aria-hidden', 'false');
    }
  }
}

/**
 * Hide the image preview container
 */
export function hideImagePreview() {
  previewVisible = false;
  if (typeof document !== 'undefined') {
    const container = getPreviewContainer();
    if (container) {
      container.classList.add('hidden');
      container.setAttribute('aria-hidden', 'true');
    }
  }
}

/**
 * Check if preview is currently visible
 * @returns {boolean}
 */
export function isPreviewVisible() {
  return previewVisible;
}

/**
 * Update the preview with new images
 * @param {Array<{dataUrl: string, mimeType: string, filename: string}>} images
 */
export function updateImagePreview(images) {
  currentImages = images;

  if (images.length === 0) {
    hideImagePreview();
    return;
  }

  showImagePreview();

  if (typeof document !== 'undefined') {
    renderPreview(images);
  }
}

/**
 * Get the thumbnail element (for testing)
 * @returns {HTMLElement|null}
 */
export function getThumbnailElement() {
  if (typeof document === 'undefined') return thumbnailElement || null;
  
  // Return stored reference first (most reliable for direct access)
  if (thumbnailElement) {
    return thumbnailElement;
  }
  
  // Fallback to querying the DOM in case element was created differently
  const container = getPreviewContainer();
  if (container) {
    return container.querySelector('.image-preview-thumbnail');
  }
  
  return null;
}

/**
 * Get the preview label text
 * @returns {string}
 */
export function getPreviewLabel() {
  if (currentImages.length === 0) return '';
  const image = currentImages[0];
  return image.filename || 'Pasted Image';
}

/**
 * Set callback for when an image is removed
 * @param {Function} callback - Called with index of removed image
 */
export function setOnImageRemoved(callback) {
  onImageRemovedCallback = callback;
}

/**
 * Handle remove button click
 * @param {number} index - Index of image to remove
 */
export function handleRemoveClick(index) {
  if (onImageRemovedCallback) {
    onImageRemovedCallback(index);
  }
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Get the preview container element (queries DOM fresh each time)
 * @returns {HTMLElement|null}
 */
function getPreviewContainer() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('#image-preview, .image-preview');
}

/**
 * Render the preview UI
 * @param {Array} images
 */
function renderPreview(images) {
  const container = getPreviewContainer();
  if (!container) return;

  // Clear existing content and reset references
  container.innerHTML = '';
  thumbnailElement = null;
  labelElement = null;

  // Show first image (single image support for 28-1, multiple in 28-6)
  const image = images[0];
  if (!image) return;

  // Create thumbnail
  const thumbnail = document.createElement('img');
  thumbnail.className = 'image-preview-thumbnail';
  thumbnail.src = image.dataUrl;
  thumbnail.alt = image.filename || 'Pasted image';
  thumbnail.style.maxWidth = `${IMAGE_PREVIEW_SIZE}px`;
  thumbnail.style.maxHeight = `${IMAGE_PREVIEW_SIZE}px`;
  thumbnailElement = thumbnail;

  // Create label
  const label = document.createElement('span');
  label.className = 'image-preview-label';
  label.textContent = image.filename || 'Pasted Image';
  labelElement = label;

  // Create remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'image-preview-remove';
  removeBtn.setAttribute('aria-label', 'Remove image');
  removeBtn.setAttribute('data-action', 'remove');
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => handleRemoveClick(0));

  // Assemble preview
  const wrapper = document.createElement('div');
  wrapper.className = 'image-preview-item';
  wrapper.appendChild(thumbnail);
  wrapper.appendChild(label);
  wrapper.appendChild(removeBtn);

  container.appendChild(wrapper);
}
