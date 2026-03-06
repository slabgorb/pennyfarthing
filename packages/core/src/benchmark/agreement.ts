/**
 * Agreement Metrics Module
 * Story 44-2: Implement Krippendorff Alpha calculation
 *
 * Inter-rater agreement (Krippendorff's Alpha, interval scale) and
 * internal consistency (Cronbach's Alpha) for multi-judge benchmark evaluation.
 */

// ============================================================================
// Types
// ============================================================================

export interface AlphaResult {
  alpha: number;
  classification: 'reliable' | 'acceptable' | 'unreliable';
  reliable: boolean;
  flagged: boolean;
  recommendation?: string;
}

export interface DimensionAgreement {
  krippendorff: AlphaResult;
  cronbach: AlphaResult;
  flagged: boolean;
  recommendation?: string;
}

export interface AgreementReport {
  overall: {
    krippendorff: AlphaResult;
    cronbach: AlphaResult;
  };
  dimensions: Record<string, DimensionAgreement>;
}

interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function variance(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

// ============================================================================
// Classification
// ============================================================================

export function classifyAlpha(alpha: number): {
  classification: 'reliable' | 'acceptable' | 'unreliable';
  reliable: boolean;
  flagged: boolean;
} {
  if (alpha >= 0.80) return { classification: 'reliable', reliable: true, flagged: false };
  if (alpha >= 0.67) return { classification: 'acceptable', reliable: false, flagged: false };
  return { classification: 'unreliable', reliable: false, flagged: true };
}

// ============================================================================
// Krippendorff's Alpha (interval scale)
// ============================================================================

export function calculateKrippendorffAlpha(judges: number[][]): Result<AlphaResult> {
  if (!judges || judges.length < 2) {
    return { success: false, error: 'At least 2 judges required' };
  }

  const numJudges = judges.length;
  const numItems = judges[0].length;

  if (numItems === 0) {
    return { success: false, error: 'No items to evaluate' };
  }

  for (let j = 1; j < numJudges; j++) {
    if (judges[j].length !== numItems) {
      return { success: false, error: 'All judges must rate the same number of items' };
    }
  }

  if (numItems === 1) {
    return {
      success: true,
      data: { alpha: NaN, classification: 'unreliable', reliable: false, flagged: true },
    };
  }

  // D_observed: mean squared difference within each item
  let dObserved = 0;
  const pairsPerItem = (numJudges * (numJudges - 1)) / 2;
  for (let i = 0; i < numItems; i++) {
    for (let j1 = 0; j1 < numJudges; j1++) {
      for (let j2 = j1 + 1; j2 < numJudges; j2++) {
        const diff = judges[j1][i] - judges[j2][i];
        dObserved += diff * diff;
      }
    }
  }
  dObserved = dObserved / (numItems * pairsPerItem);

  // D_expected: mean squared difference across all pooled values
  const allValues: number[] = [];
  for (let j = 0; j < numJudges; j++) {
    for (let i = 0; i < numItems; i++) {
      allValues.push(judges[j][i]);
    }
  }
  const totalValues = allValues.length;
  let dExpected = 0;
  for (let i = 0; i < totalValues; i++) {
    for (let j = i + 1; j < totalValues; j++) {
      const diff = allValues[i] - allValues[j];
      dExpected += diff * diff;
    }
  }
  dExpected = dExpected / ((totalValues * (totalValues - 1)) / 2);

  if (dExpected === 0) {
    return { success: true, data: { alpha: 1.0, ...classifyAlpha(1.0) } };
  }

  const alpha = Math.round((1 - dObserved / dExpected) * 10000) / 10000;
  return { success: true, data: { alpha, ...classifyAlpha(alpha) } };
}

// ============================================================================
// Cronbach's Alpha
// ============================================================================

export function calculateCronbachAlpha(judges: number[][]): Result<AlphaResult> {
  if (!judges || judges.length < 2) {
    return { success: false, error: 'At least 2 judges required' };
  }

  const numJudges = judges.length;
  const numItems = judges[0].length;

  if (numItems === 0) {
    return { success: false, error: 'No items to evaluate' };
  }

  for (let j = 1; j < numJudges; j++) {
    if (judges[j].length !== numItems) {
      return { success: false, error: 'All judges must rate the same number of items' };
    }
  }

  const k = numItems;

  // Variance of each item across judges
  let sumItemVariances = 0;
  for (let i = 0; i < k; i++) {
    const itemScores: number[] = [];
    for (let j = 0; j < numJudges; j++) {
      itemScores.push(judges[j][i]);
    }
    sumItemVariances += variance(itemScores);
  }

  // Variance of judge totals
  const judgeTotals: number[] = [];
  for (let j = 0; j < numJudges; j++) {
    judgeTotals.push(judges[j].reduce((a, b) => a + b, 0));
  }
  const varTotal = variance(judgeTotals);

  if (varTotal === 0) {
    return { success: true, data: { alpha: 1.0, ...classifyAlpha(1.0) } };
  }

  const alpha = Math.round((k / (k - 1)) * (1 - sumItemVariances / varTotal) * 10000) / 10000;
  return { success: true, data: { alpha, ...classifyAlpha(alpha) } };
}

// ============================================================================
// Per-Dimension Agreement
// ============================================================================

export function calculateAgreement(
  judgeVerdicts: Array<Record<string, number>>
): Result<AgreementReport> {
  if (!judgeVerdicts || judgeVerdicts.length < 2) {
    return { success: false, error: 'At least 2 judge verdicts required' };
  }

  const numJudges = judgeVerdicts.length;
  const dimensions = Object.keys(judgeVerdicts[0]);

  if (dimensions.length === 0) {
    return { success: false, error: 'Verdicts must contain at least one dimension' };
  }

  const dimensionResults: Record<string, DimensionAgreement> = {};

  for (const dim of dimensions) {
    const scores: number[] = [];
    for (let j = 0; j < numJudges; j++) {
      scores.push(judgeVerdicts[j][dim]);
    }

    const allSame = scores.every(s => s === scores[0]);
    let dimAlpha: AlphaResult;

    if (allSame) {
      dimAlpha = { alpha: 1.0, classification: 'reliable', reliable: true, flagged: false };
    } else {
      // Single item per dimension — use variance-based heuristic
      const v = variance(scores);
      const range = Math.max(...scores) - Math.min(...scores);
      const maxVar = (range * range) / 4;
      const heuristicAlpha = maxVar > 0 ? 1 - v / maxVar : 1.0;
      const cls = classifyAlpha(heuristicAlpha);
      dimAlpha = { alpha: Math.round(heuristicAlpha * 10000) / 10000, ...cls };
    }

    const flagged = dimAlpha.flagged;
    dimensionResults[dim] = {
      krippendorff: dimAlpha,
      cronbach: dimAlpha,
      flagged,
      recommendation: flagged ? `Revise rubric anchors for ${dim}` : undefined,
    };
  }

  // Overall: treat dimensions as items, judges as raters
  const overallMatrix: number[][] = [];
  for (let j = 0; j < numJudges; j++) {
    overallMatrix.push(dimensions.map(dim => judgeVerdicts[j][dim]));
  }

  const overallKrippendorff = calculateKrippendorffAlpha(overallMatrix);
  const overallCronbach = calculateCronbachAlpha(overallMatrix);

  const fallback: AlphaResult = { alpha: NaN, classification: 'unreliable', reliable: false, flagged: true };

  return {
    success: true,
    data: {
      overall: {
        krippendorff: overallKrippendorff.data ?? fallback,
        cronbach: overallCronbach.data ?? fallback,
      },
      dimensions: dimensionResults,
    },
  };
}
