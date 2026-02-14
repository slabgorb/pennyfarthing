/**
 * API route factory stubs for server module.
 * STUB: Will be replaced with real implementations from cyclist/src/api/
 *
 * Each factory should return an Express Router. These stubs return null
 * to intentionally fail tests (RED state).
 */

import { Router } from 'express';

// Stats
export function createStatsRouter(): Router { return null as unknown as Router; }
export function broadcastStats(): void { /* stub */ }
export function getCurrentStats(): unknown { return null; }
export function getStatsClients(): Set<unknown> { return new Set(); }
export function updatePwd(_pwd: string): void { /* stub */ }

// Portrait
export function createPortraitRouter(): Router { return null as unknown as Router; }
export function getCurrentPortrait(): unknown { return null; }

// Persona
export function createPersonaRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }
export function broadcastPersona(_persona: unknown): void { /* stub */ }
export function getPersonaClients(): Set<unknown> { return new Set(); }
export function getStreamingState(): boolean { return false; }
export function setStreamingState(_streaming: boolean): void { /* stub */ }

// Git
export function createGitRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }
export function getGitInfo(_projectDir: string): unknown { return null; }
export function getAllReposGitInfo(_projectDir: string): unknown[] { return []; }
export function getGitInfoAsync(_projectDir: string): Promise<unknown> { return Promise.resolve(null); }
export function getAllReposGitInfoAsync(_projectDir: string): Promise<unknown[]> { return Promise.resolve([]); }
export interface GitInfo { branch: string; clean: boolean; }

// OTLP
export function createOTLPRouter(): Router { return null as unknown as Router; }

// Story
export function createStoryRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }

// Hotspots
export function createHotspotsRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }

// File Browser
export function createFileBrowserRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }

// Token Stats
export function createTokenStatsRouter(): Router { return null as unknown as Router; }
export function broadcastTokenStats(_stats: unknown): void { /* stub */ }
export function getTokenStatsClients(): Set<unknown> { return new Set(); }
export function initTokenStatsBroadcast(): void { /* stub */ }

// Context
export function createContextRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }
export function getContextUsage(_projectDir: string): unknown { return null; }
export interface ContextInfo { percent: number; tokens: number; }

// Theme Agents
export function createThemeAgentsRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }
export function getThemeAgents(_projectDir: string): unknown { return null; }
export interface AgentCharacterMap { [agent: string]: string; }

// Mode
export function createModeRouter(): Router { return null as unknown as Router; }
export function getModeInfo(): unknown { return null; }
export interface ModeInfo { mode: string; }

// Telemetry
export function createTelemetryRouter(): Router { return null as unknown as Router; }

// Evaluation
export function createEvaluationRouter(): Router { return null as unknown as Router; }

// Settings
export function createSettingsRouter(): Router { return null as unknown as Router; }

// Background Tasks
export function createBackgroundTasksRouter(): Router { return null as unknown as Router; }
export function getBackgroundTaskClients(): Set<unknown> { return new Set(); }
export function broadcastBackgroundTaskEvent(_event: unknown): void { /* stub */ }
export function initBackgroundTaskBroadcast(): void { /* stub */ }

// Spans
export function createSpansRouter(): Router { return null as unknown as Router; }

// Bell
export function getBellClients(): Set<unknown> { return new Set(); }
export function broadcastBellConsumed(_text: string): void { /* stub */ }

// Hook Request
export function createHookRequestRouter(): Router { return null as unknown as Router; }
export function getHookClients(): Set<unknown> { return new Set(); }
export function addHookClient(_ws: unknown): void { /* stub */ }
export function resolveApproval(_id: string, _approved: boolean): void { /* stub */ }
export function handleHookWebSocketMessage(_ws: unknown, _data: string): void { /* stub */ }

// Identity
export function createIdentityRouter(): Router { return null as unknown as Router; }
export interface IdentityInfo { email: string | null; }

// Todos
export function createTodosRouter(): Router { return null as unknown as Router; }
export function setWebModeTodos(_todos: unknown[]): void { /* stub */ }
export function getWebModeTodos(): unknown[] { return []; }

// Audit Log
export function createAuditLogRouter(): Router { return null as unknown as Router; }

// Permissions
export function createPermissionsRouter(): Router { return null as unknown as Router; }

// Agent Load
export function createAgentLoadRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }

// Code Markers
export function createCodeMarkersRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }

// Dead Code
export function createDeadCodeRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }

// Complexity
export function createComplexityRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }

// Dependencies
export function createDependenciesRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }

// Health Score
export function createHealthScoreRouter(_getProjectDir: () => string): Router { return null as unknown as Router; }
