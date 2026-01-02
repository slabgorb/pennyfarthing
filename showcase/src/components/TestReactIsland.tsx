import { useState } from 'react';

/**
 * Test React Island Component
 *
 * Verifies React hydration is working correctly in Astro.
 * Uses client:load directive in the parent .astro file.
 */
export default function TestReactIsland() {
  const [count, setCount] = useState(0);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-sm">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        React Island Test
      </h2>
      <p className="text-gray-600 mb-4">
        Click the button to verify React hydration is working.
      </p>
      <div className="flex items-center gap-4">
        <button
          onClick={() => setCount(c => c + 1)}
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          Count: {count}
        </button>
        {count > 0 && (
          <span className="text-green-600 font-medium">
            Hydration works!
          </span>
        )}
      </div>
    </div>
  );
}
