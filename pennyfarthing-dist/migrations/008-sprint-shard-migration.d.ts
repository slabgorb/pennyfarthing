import { MigrationContext, MigrationResult } from '../../../packages/core/src/cli/utils/migrations.js';

export const id: string;
export const description: string;
export function up(ctx: MigrationContext): Promise<MigrationResult>;
export function check(ctx: MigrationContext): Promise<boolean>;
