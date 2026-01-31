/**
 * Vitest setup file
 *
 * Configures testing environment with:
 * - @testing-library/jest-dom matchers
 * - Global test utilities
 */

import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
