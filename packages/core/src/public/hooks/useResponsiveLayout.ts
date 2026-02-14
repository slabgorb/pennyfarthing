/**
 * useResponsiveLayout - Responsive breakpoint detection hook
 *
 * Story MSSCI-12770: Responsive Breakpoints
 *
 * Provides:
 * - Breakpoint detection (small <1024, medium 1024-1440, large >1440)
 * - Sidebar width recommendations
 * - Minimum dimension violation detection
 * - Resize event handling
 */

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// Constants
// =============================================================================

/**
 * Breakpoint thresholds in pixels
 */
export const BREAKPOINTS = {
  small: 1024,  // < 1024px
  large: 1440,  // >= 1440px
} as const;

/**
 * Sidebar widths for each breakpoint
 */
export const SIDEBAR_WIDTHS = {
  medium: 300,  // Default width
  large: 400,   // Expanded width for large screens
} as const;

/**
 * Minimum supported dimensions
 */
export const MIN_DIMENSIONS = {
  width: 800,
  height: 600,
} as const;

/**
 * CSS custom property names for breakpoints
 */
export const CSS_BREAKPOINT_VARS = '--breakpoint-small: 1024px; --breakpoint-large: 1440px;';

/**
 * Media query strings for CSS-in-JS usage
 */
export const MEDIA_QUERIES = {
  small: '(max-width: 1023px)',
  medium: '(min-width: 1024px) and (max-width: 1439px)',
  large: '(min-width: 1440px)',
} as const;

// =============================================================================
// Types
// =============================================================================

export type Breakpoint = 'small' | 'medium' | 'large';

export interface MinimumViolation {
  width: boolean;
  height: boolean;
}

export interface ResponsiveLayoutState {
  /** Current breakpoint based on window width */
  breakpoint: Breakpoint;
  /** True if width < 1024px */
  isSmall: boolean;
  /** True if width >= 1024px and < 1440px */
  isMedium: boolean;
  /** True if width >= 1440px */
  isLarge: boolean;
  /** Current window width */
  width: number;
  /** Current window height */
  height: number;
  /** Recommended sidebar width for current breakpoint */
  sidebarWidth: number;
  /** True if either dimension is below minimum */
  isBelowMinimum: boolean;
  /** Which dimensions violate minimums */
  minimumViolation: MinimumViolation;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine breakpoint from width
 */
function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.small) {
    return 'small';
  }
  if (width >= BREAKPOINTS.large) {
    return 'large';
  }
  return 'medium';
}

/**
 * Get sidebar width for breakpoint
 */
function getSidebarWidth(breakpoint: Breakpoint): number {
  if (breakpoint === 'large') {
    return SIDEBAR_WIDTHS.large;
  }
  return SIDEBAR_WIDTHS.medium;
}

/**
 * Check minimum dimension violations
 */
function checkMinimumViolation(width: number, height: number): MinimumViolation {
  return {
    width: width < MIN_DIMENSIONS.width,
    height: height < MIN_DIMENSIONS.height,
  };
}

// =============================================================================
// Hook
// =============================================================================

/**
 * React hook for responsive layout detection
 *
 * Detects current breakpoint based on window dimensions and provides
 * utilities for responsive behavior.
 */
export function useResponsiveLayout(): ResponsiveLayoutState {
  const getWindowDimensions = useCallback(() => {
    return {
      width: typeof window !== 'undefined' ? window.innerWidth : 1200,
      height: typeof window !== 'undefined' ? window.innerHeight : 800,
    };
  }, []);

  const [dimensions, setDimensions] = useState(getWindowDimensions);

  useEffect(() => {
    const handleResize = () => {
      setDimensions(getWindowDimensions());
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [getWindowDimensions]);

  const breakpoint = getBreakpoint(dimensions.width);
  const minimumViolation = checkMinimumViolation(dimensions.width, dimensions.height);

  return {
    breakpoint,
    isSmall: breakpoint === 'small',
    isMedium: breakpoint === 'medium',
    isLarge: breakpoint === 'large',
    width: dimensions.width,
    height: dimensions.height,
    sidebarWidth: getSidebarWidth(breakpoint),
    isBelowMinimum: minimumViolation.width || minimumViolation.height,
    minimumViolation,
  };
}

export default useResponsiveLayout;
