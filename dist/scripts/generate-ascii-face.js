/**
 * ASCII Chernoff Face Generator - OCEAN → Unicode Art
 *
 * Generates Unicode art Chernoff faces from OCEAN personality scores.
 * Companion to generate-face.ts (SVG version).
 */
import { loadThemeOcean } from './generate-face.js';
export { loadThemeOcean };
/**
 * Map OCEAN score (1-5) to a discrete level (0, 1, 2)
 * 1-2 → 0 (low), 3 → 1 (mid), 4-5 → 2 (high)
 */
function toLevel(score) {
    if (score <= 2)
        return 0;
    if (score >= 4)
        return 2;
    return 1;
}
/**
 * Map OCEAN scores to ASCII face features
 *
 * Mappings:
 * - O (Openness) → Eye size: small • → medium ○ → large ◉
 * - C (Conscientiousness) → Face width: wide → medium → narrow
 * - E (Extraversion) → Mouth: frown ╭─╮ → flat ─── → smile ╰─╯
 * - A (Agreeableness) → Eyebrows: stern ╲ ╱ → flat ─ ─ → raised ╱ ╲
 * - N (Neuroticism) → Border style: rounded (calm) → angular (tense)
 */
export function oceanToAsciiFeatures(ocean) {
    const oLevel = toLevel(ocean.O);
    const cLevel = toLevel(ocean.C);
    const eLevel = toLevel(ocean.E);
    const aLevel = toLevel(ocean.A);
    const nLevel = toLevel(ocean.N);
    // Openness → Eye size
    const eyeChars = ['•', '○', '◉'];
    const eyeChar = eyeChars[oLevel];
    // Conscientiousness → Face width (inverted: high C = narrow)
    const faceWidths = ['wide', 'medium', 'narrow'];
    const faceWidth = faceWidths[cLevel];
    // Extraversion → Mouth shape (with width)
    const mouths = [
        '╭───╮', // Frown (low E)
        '─────', // Flat (mid E)
        '╰───╯', // Smile (high E)
    ];
    const mouth = mouths[eLevel];
    // Agreeableness → Eyebrow angle
    const browsLeft = ['╲', '─', '╱']; // stern → flat → raised
    const browsRight = ['╱', '─', '╲'];
    const browLeft = browsLeft[aLevel];
    const browRight = browsRight[aLevel];
    // Neuroticism → Border style (rectangular, more distinct)
    // Low N: rounded single line (calm, relaxed)
    // Mid N: sharp single line (neutral)
    // High N: double line (tense, anxious)
    const borders = [
        { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }, // Calm (rounded)
        { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }, // Neutral (sharp)
        { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' }, // Tense (double)
    ];
    const border = borders[nLevel];
    return {
        eyeChar,
        faceWidth,
        browLeft,
        browRight,
        mouth,
        borderTL: border.tl,
        borderTR: border.tr,
        borderBL: border.bl,
        borderBR: border.br,
        borderH: border.h,
        borderV: border.v,
    };
}
/**
 * Face dimensions by width category
 */
const FACE_DIMS = {
    narrow: { outer: 11, inner: 9, pad: 3 },
    medium: { outer: 15, inner: 13, pad: 2 },
    wide: { outer: 19, inner: 17, pad: 1 },
};
/**
 * Generate ASCII face string from features
 */
export function generateAsciiFromFeatures(features) {
    const dims = FACE_DIMS[features.faceWidth];
    const { outer, inner, pad } = dims;
    const { borderTL, borderTR, borderBL, borderBR, borderH, borderV } = features;
    // Helper to center content in a field
    const center = (content, width) => {
        const contentLen = [...content].length; // Unicode-aware length
        const leftPad = Math.floor((width - contentLen) / 2);
        const rightPad = width - contentLen - leftPad;
        return ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
    };
    // Helper to create a line with side borders
    const row = (content) => {
        return ' '.repeat(pad) + borderV + center(content, inner) + borderV;
    };
    // Build face lines (rectangular - no diagonals)
    const lines = [];
    // Top border
    lines.push(' '.repeat(pad) + borderTL + borderH.repeat(inner) + borderTR);
    // Empty row
    lines.push(row(''));
    // Eyebrows - spaced apart (odd spacing for centering in odd-width inner)
    const spacing = Math.floor(inner / 2) - 1; // 9→3, 13→5, 17→7
    const browContent = features.browLeft + ' '.repeat(spacing) + features.browRight;
    lines.push(row(browContent));
    // Empty row
    lines.push(row(''));
    // Eyes - same spacing as brows
    const eyeContent = features.eyeChar + ' '.repeat(spacing) + features.eyeChar;
    lines.push(row(eyeContent));
    // Empty row
    lines.push(row(''));
    // Mouth
    lines.push(row(features.mouth));
    // Empty row
    lines.push(row(''));
    // Bottom border
    lines.push(' '.repeat(pad) + borderBL + borderH.repeat(inner) + borderBR);
    return lines.join('\n');
}
/**
 * Generate ASCII face directly from OCEAN scores
 */
export function generateAsciiFromOcean(ocean) {
    const features = oceanToAsciiFeatures(ocean);
    return generateAsciiFromFeatures(features);
}
/**
 * Main function: Generate ASCII face for a theme's agent
 */
export function generateAsciiFace(theme, agent) {
    const ocean = loadThemeOcean(theme, agent);
    return generateAsciiFromOcean(ocean);
}
/**
 * Generate a labeled ASCII face with agent name
 */
export function generateLabeledAsciiFace(theme, agent, characterName) {
    const face = generateAsciiFace(theme, agent);
    const label = characterName || agent;
    const lines = face.split('\n');
    const width = lines[0].length;
    const padding = Math.max(0, Math.floor((width - label.length) / 2));
    const centeredLabel = ' '.repeat(padding) + label;
    return face + '\n' + centeredLabel;
}
//# sourceMappingURL=generate-ascii-face.js.map