/**
 * Image Preview module for clipboard paste (Story 28-1, 28-6)
 * Displays thumbnail preview of pasted images before sending
 * Supports multiple images with individual remove and clear all (Story 28-6)
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

/** Callback when all images are cleared (Story 28-6) */
let onClearAllCallback = null;

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

/**
 * Set callback for when all images are cleared (Story 28-6)
 * @param {Function} callback - Called when Clear All is clicked
 */
export function setOnClearAll(callback) {
  onClearAllCallback = callback;
}

/**
 * Handle Clear All button click (Story 28-6)
 */
export function handleClearAllClick() {
  if (onClearAllCallback) {
    onClearAllCallback();
  }
}

/**
 * Show image size error message (Story 28-5)
 * Displays a temporary error message when image exceeds max size
 * @param {string} message - Error message to display
 */
export function showImageSizeError(message) {
  if (typeof document === 'undefined') return;

  const container = getPreviewContainer();
  if (!container) return;

  // Clear any existing content
  container.innerHTML = '';
  container.classList.remove('hidden');
  container.setAttribute('aria-hidden', 'false');

  // Create error message
  const errorDiv = document.createElement('div');
  errorDiv.className = 'image-preview-error';
  errorDiv.textContent = message;

  container.appendChild(errorDiv);

  // Auto-hide after 3 seconds
  setTimeout(() => {
    if (container.querySelector('.image-preview-error')) {
      container.classList.add('hidden');
      container.setAttribute('aria-hidden', 'true');
      container.innerHTML = '';
    }
  }, 3000);
}

/**
 * Format file size for display (Story 28-5)
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string (e.g., "2.3 MB")
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
 * Render the preview UI (Story 28-6: supports multiple images)
 * @param {Array} images
 */
function renderPreview(images) {
  const container = getPreviewContainer();
  if (!container) return;

  // Clear existing content and reset references
  container.innerHTML = '';
  thumbnailElement = null;
  labelElement = null;

  if (images.length === 0) return;

  // Create wrapper for all preview items (Story 28-6)
  const itemsWrapper = document.createElement('div');
  itemsWrapper.className = 'image-preview-items';

  // Render each image (Story 28-6: loop over all images)
  images.forEach((image, index) => {
    // Create thumbnail
    const thumbnail = document.createElement('img');
    thumbnail.className = 'image-preview-thumbnail';
    thumbnail.src = image.dataUrl;
    thumbnail.alt = image.filename || 'Pasted image';
    thumbnail.style.maxWidth = `${IMAGE_PREVIEW_SIZE}px`;
    thumbnail.style.maxHeight = `${IMAGE_PREVIEW_SIZE}px`;

    // Store reference to first thumbnail for backward compatibility
    if (index === 0) {
      thumbnailElement = thumbnail;
    }

    // Create label with file size (Story 28-5)
    const label = document.createElement('span');
    label.className = 'image-preview-label';
    const filename = image.filename || 'Pasted Image';
    const sizeText = image.sizeBytes ? ` (${formatFileSize(image.sizeBytes)})` : '';
    label.textContent = filename + sizeText;

    // Store reference to first label for backward compatibility
    if (index === 0) {
      labelElement = label;
    }

    // Add warning class if large image (Story 28-5)
    if (image.isLarge) {
      label.classList.add('image-preview-label-warning');
      label.title = 'Large image - may take longer to process';
    }

    // Create remove button with index-aware handler (Story 28-6)
    const removeBtn = document.createElement('button');
    removeBtn.className = 'image-preview-remove';
    removeBtn.setAttribute('aria-label', `Remove image ${index + 1}`);
    removeBtn.setAttribute('data-action', 'remove');
    removeBtn.setAttribute('data-index', index.toString());
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => handleRemoveClick(index));

    // Assemble preview item
    const wrapper = document.createElement('div');
    wrapper.className = 'image-preview-item';
    // Add warning border for large images (Story 28-5)
    if (image.isLarge) {
      wrapper.classList.add('image-preview-item-warning');
    }
    wrapper.appendChild(thumbnail);
    wrapper.appendChild(label);
    wrapper.appendChild(removeBtn);

    itemsWrapper.appendChild(wrapper);
  });

  container.appendChild(itemsWrapper);

  // Add Clear All button when 2+ images (Story 28-6)
  if (images.length >= 2) {
    const clearAllBtn = document.createElement('button');
    clearAllBtn.className = 'image-preview-clear-all';
    clearAllBtn.setAttribute('aria-label', 'Clear all images');
    clearAllBtn.setAttribute('data-action', 'clear-all');
    clearAllBtn.textContent = 'Clear All';
    clearAllBtn.addEventListener('click', () => handleClearAllClick());
    container.appendChild(clearAllBtn);
  }
}
