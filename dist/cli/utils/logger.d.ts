export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';
export interface LoggerOptions {
    quiet?: boolean;
    json?: boolean;
}
declare class Logger {
    private options;
    configure(options: LoggerOptions): void;
    private shouldLog;
    info(message: string): void;
    success(message: string): void;
    warning(message: string): void;
    error(message: string): void;
    created(path: string): void;
    updated(path: string): void;
    skipped(path: string, reason?: string): void;
    removed(path: string): void;
    conflict(path: string): void;
    header(title: string): void;
    newline(): void;
    dryRun(message: string): void;
    check(name: string, status: 'pass' | 'warn' | 'fail', detail?: string): void;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map