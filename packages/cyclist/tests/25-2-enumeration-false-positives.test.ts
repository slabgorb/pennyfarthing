/**
 * Story 25-2: Fix Enumeration False Positives
 *
 * Tests to ensure numbered lists are not incorrectly detected as choices
 * when they are actually enumerations (file lists, step lists, etc.)
 */

import { describe, it, expect } from 'vitest';
import { getMessageView } from './helpers/suggested-prompts-helpers.js';

describe('25-2: Enumeration False Positives', () => {

  describe('AC1: Numbered lists without question context are ignored', () => {

    it('should not detect list when there is no question being asked', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `I completed the following tasks:
1. Updated the configuration
2. Fixed the database connection
3. Deployed to staging`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect findings list as choices', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Here are the issues I found:
1. Database connection slow
2. API returning errors
3. UI not rendering properly`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect list of completed steps', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Steps I took to fix the bug:
1. Identified the root cause
2. Applied the patch
3. Verified the fix works`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

  });

  describe('AC2: "Here are the files" type enumeration lists not shown as choices', () => {

    it('should not detect "here are the files" enumeration', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Here are the files I modified:
1. src/index.ts
2. src/utils.ts
3. tests/index.test.ts`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "the following" enumeration prefix', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `The following changes were made:
1. Added new validation
2. Updated error handling
3. Improved logging`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "i found" enumeration prefix', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `I found these problems in the code:
1. Missing null check
2. Unhandled promise rejection
3. Memory leak in event handler`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "there are N" enumeration prefix', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `There are 3 main issues:
1. Performance degradation
2. Security vulnerability
3. API compatibility`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "list of" enumeration prefix', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Here's a list of dependencies:
1. react@18.2.0
2. typescript@5.0.0
3. vitest@1.0.0`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "here\'s what" enumeration prefix', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Here's what I did:
1. Cloned the repository
2. Installed dependencies
3. Ran the tests`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "files were modified" enumeration', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `These files were modified in this commit:
1. package.json
2. src/main.ts
3. README.md`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

  });

  describe('AC3: Long lists (>5 items) treated as enumeration by default', () => {

    it('should not detect 6-item list without strong choice indicator', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Here are the options available:
1. Option A
2. Option B
3. Option C
4. Option D
5. Option E
6. Option F`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect 8-item documentation list', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `The API supports these endpoints:
1. GET /users
2. POST /users
3. GET /users/:id
4. PUT /users/:id
5. DELETE /users/:id
6. GET /posts
7. POST /posts
8. GET /posts/:id`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should STILL detect 6-item list WITH strong choice indicator "which"', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Which of these approaches would you prefer?
1. Approach A
2. Approach B
3. Approach C
4. Approach D
5. Approach E
6. Approach F`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(6);
    });

    it('should STILL detect 6-item list WITH strong choice indicator "choose"', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Please choose one of the following:
1. First option
2. Second option
3. Third option
4. Fourth option
5. Fifth option
6. Sixth option`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(6);
    });

    it('should STILL detect 6-item list WITH strong choice indicator "select"', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Select the option you want:
1. Option 1
2. Option 2
3. Option 3
4. Option 4
5. Option 5
6. Option 6`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(6);
    });

    it('should handle boundary case of exactly 5 items (should still work with weak context)', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Here are your options:
1. Option A
2. Option B
3. Option C
4. Option D
5. Option E`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(5);
    });

  });

  describe('AC4: Reduces false positive rate (regression tests)', () => {

    it('should STILL detect valid 3-item choice list with "which"', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Which approach would you prefer?
1. Use TypeScript
2. Use JavaScript
3. Use both`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(3);
    });

    it('should STILL detect valid 2-item choice list with "choose"', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Choose one:
1. Fast but risky
2. Slow but safe`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should STILL detect valid choice list with "select"', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Select an option:
1. Create new file
2. Modify existing file
3. Delete file`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(3);
    });

    it('should STILL detect valid choice list with "pick"', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Pick the one you want:
1. Red
2. Green
3. Blue`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(3);
    });

    it('should STILL detect valid choice list with "prefer"', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Which do you prefer?
1. Morning deployment
2. Evening deployment`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should STILL detect "would you like" combined with numbered options', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Would you like me to proceed with one of these?
1. Quick fix
2. Full refactor
3. Skip for now`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(3);
    });

  });

});
