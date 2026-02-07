/**
 * useColorScheme Hook
 *
 * Tracks the active color scheme (light/dark) from the applied color preset's
 * data-variant attribute on the document root. Falls back to OS preference.
 */

import { useState, useEffect } from 'react';

export type ColorScheme = 'light' | 'dark';

function getVariant(): ColorScheme {
  const variant = document.documentElement.getAttribute('data-variant');
  if (variant === 'light' || variant === 'dark') return variant;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(getVariant);

  useEffect(() => {
    // Watch for preset changes via data-variant attribute
    const observer = new MutationObserver(() => {
      setScheme(getVariant());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-variant'],
    });

    // Also listen to presetChange events from applyPreset()
    const handlePreset = () => setScheme(getVariant());
    window.addEventListener('presetChange', handlePreset);

    return () => {
      observer.disconnect();
      window.removeEventListener('presetChange', handlePreset);
    };
  }, []);

  return scheme;
}
