import chalk from 'chalk';

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

export interface LoggerOptions {
  quiet?: boolean;
  json?: boolean;
}

class Logger {
  private options: LoggerOptions = {};

  configure(options: LoggerOptions): void {
    this.options = { ...this.options, ...options };
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.options.quiet && level !== 'error') {
      return false;
    }
    return true;
  }

  info(message: string): void {
    if (this.shouldLog('info')) {
      console.log(chalk.blue('i') + ' ' + message);
    }
  }

  success(message: string): void {
    if (this.shouldLog('success')) {
      console.log(chalk.green('✓') + ' ' + message);
    }
  }

  warning(message: string): void {
    if (this.shouldLog('warning')) {
      console.log(chalk.yellow('!') + ' ' + message);
    }
  }

  error(message: string): void {
    console.error(chalk.red('✗') + ' ' + message);
  }

  // File operation feedback
  created(path: string): void {
    if (this.shouldLog('info')) {
      console.log(chalk.green('  + ') + path);
    }
  }

  updated(path: string): void {
    if (this.shouldLog('info')) {
      console.log(chalk.blue('  ~ ') + path);
    }
  }

  skipped(path: string, reason?: string): void {
    if (this.shouldLog('info')) {
      const suffix = reason ? chalk.dim(` (${reason})`) : '';
      console.log(chalk.yellow('  - ') + path + suffix);
    }
  }

  removed(path: string): void {
    if (this.shouldLog('info')) {
      console.log(chalk.red('  x ') + path);
    }
  }

  conflict(path: string): void {
    if (this.shouldLog('warning')) {
      console.log(chalk.red('  ! ') + path + chalk.dim(' (modified locally)'));
    }
  }

  // Section headers
  header(title: string): void {
    if (this.shouldLog('info')) {
      console.log('\n' + chalk.bold(title));
    }
  }

  // Blank line
  newline(): void {
    if (this.shouldLog('info')) {
      console.log();
    }
  }

  // Dry run prefix
  dryRun(message: string): void {
    if (this.shouldLog('info')) {
      console.log(chalk.cyan('[dry-run]') + ' ' + message);
    }
  }

  // Table-like output for doctor command
  check(name: string, status: 'pass' | 'warn' | 'fail', detail?: string): void {
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
