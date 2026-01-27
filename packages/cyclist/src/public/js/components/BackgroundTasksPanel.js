/**
 * BackgroundTasksPanel - Re-export from sidebar module
 *
 * The background tasks panel implementation lives in sidebar/background-tasks.js.
 * This re-export maintains backward compatibility with tests and other imports
 * that expect the component in the components/ directory.
 *
 * Story: MSSCI-12477 - Background tasks: Implement subagent visibility
 */

export {
  renderBackgroundTasksPanel,
  addBackgroundTask,
  updateBackgroundTask,
  dismissBackgroundTask,
  getBackgroundTasks,
  clearBackgroundTasks,
  init,
  initBackgroundTasksPanel,
  destroy,
  destroyBackgroundTasksPanel,
  connectWebSocket,
  disconnectWebSocket,
  isConnected,
  getConnectionState,
  update,
} from '../sidebar/background-tasks.js';
