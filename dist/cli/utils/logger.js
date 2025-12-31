import chalk from 'chalk';
class Logger {
    options = {};
    configure(options) {
        this.options = { ...this.options, ...options };
    }
    shouldLog(level) {
        if (this.options.quiet && level !== 'error') {
            return false;
        }
        return true;
    }
    info(message) {
        if (this.shouldLog('info')) {
            console.log(chalk.blue('i') + ' ' + message);
        }
    }
    success(message) {
        if (this.shouldLog('success')) {
            console.log(chalk.green('✓') + ' ' + message);
        }
    }
    warning(message) {
        if (this.shouldLog('warning')) {
            console.log(chalk.yellow('!') + ' ' + message);
        }
    }
    error(message) {
        console.error(chalk.red('✗') + ' ' + message);
    }
    // File operation feedback
    created(path) {
        if (this.shouldLog('info')) {
            console.log(chalk.green('  + ') + path);
        }
    }
    updated(path) {
        if (this.shouldLog('info')) {
            console.log(chalk.blue('  ~ ') + path);
        }
    }
    skipped(path, reason) {
        if (this.shouldLog('info')) {
            const suffix = reason ? chalk.dim(` (${reason})`) : '';
            console.log(chalk.yellow('  - ') + path + suffix);
        }
    }
    removed(path) {
        if (this.shouldLog('info')) {
            console.log(chalk.red('  x ') + path);
        }
    }
    conflict(path) {
        if (this.shouldLog('warning')) {
            console.log(chalk.red('  ! ') + path + chalk.dim(' (modified locally)'));
        }
    }
    // Section headers
    header(title) {
        if (this.shouldLog('info')) {
            console.log('\n' + chalk.bold(title));
        }
    }
    // Blank line
    newline() {
        if (this.shouldLog('info')) {
            console.log();
        }
    }
    // Dry run prefix
    dryRun(message) {
        if (this.shouldLog('info')) {
            console.log(chalk.cyan('[dry-run]') + ' ' + message);
        }
    }
    // Table-like output for doctor command
    check(name, status, detail) {
        if (this.shouldLog('info')) {
            const icon = status === 'pass' ? chalk.green('✓')
                : status === 'warn' ? chalk.yellow('!')
                    : chalk.red('✗');
            const suffix = detail ? chalk.dim(` - ${detail}`) : '';
            console.log(`  ${icon} ${name}${suffix}`);
        }
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map