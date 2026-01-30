/**
 * Editor Resize Module
 * Custom resize handle above the editor for vertical resizing
 */

let resizeHandle = null;
let editorElement = null;
let isResizing = false;
let startY = 0;
let startHeight = 0;

const MIN_HEIGHT = 60;  // Match control buttons height
const MAX_HEIGHT_RATIO = 0.5;  // 50% of viewport

/**
 * Get max height based on viewport
 */
function getMaxHeight() {
  return Math.floor(window.innerHeight * MAX_HEIGHT_RATIO);
}

/**
 * Handle mouse down on resize handle
 */
function onResizeStart(event) {
  if (!editorElement) return;

  isResizing = true;
  startY = event.clientY;
  startHeight = editorElement.offsetHeight;

  resizeHandle.classList.add('dragging');
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';

  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);

  event.preventDefault();
}

/**
 * Handle mouse move during resize
 */
function onResizeMove(event) {
  if (!isResizing || !editorElement) return;

  // Dragging UP (negative deltaY) should INCREASE height
  const deltaY = startY - event.clientY;
  const newHeight = Math.min(Math.max(startHeight + deltaY, MIN_HEIGHT), getMaxHeight());

  editorElement.style.height = newHeight + 'px';
}

/**
 * Handle mouse up after resize
 */
function onResizeEnd() {
  isResizing = false;

  resizeHandle.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);

  // Persist the height
  if (editorElement) {
    localStorage.setItem('cyclist-editor-height', editorElement.offsetHeight);
  }
}

/**
 * Initialize editor resize functionality
 */
export function initEditorResize() {
  resizeHandle = document.getElementById('editor-resize-handle');
  editorElement = document.getElementById('editor');

  if (!resizeHandle || !editorElement) {
    console.warn('[EditorResize] Missing elements:', { resizeHandle: !!resizeHandle, editorElement: !!editorElement });
    return;
  }

  // Restore persisted height
  const savedHeight = localStorage.getItem('cyclist-editor-height');
  if (savedHeight) {
    const height = Math.min(Math.max(parseInt(savedHeight, 10), MIN_HEIGHT), getMaxHeight());
    editorElement.style.height = height + 'px';
  }

  // Set up resize handle
  resizeHandle.addEventListener('mousedown', onResizeStart);

  // Update max height on window resize
  window.addEventListener('resize', () => {
    if (editorElement) {
      const currentHeight = editorElement.offsetHeight;
      const maxHeight = getMaxHeight();
      if (currentHeight > maxHeight) {
        editorElement.style.height = maxHeight + 'px';
      }
    }
  });
}

export default { initEditorResize };
