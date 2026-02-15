/**
 * Consultation Protocol for Story 86-2
 *
 * Active request/response mechanism for tandem agent consultation.
 * Unlike passive backseat observation (95-2), consultation is leader-initiated:
 * the primary agent spawns a partner agent with a focused question and receives
 * a structured recommendation.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Consultation request from leader to partner.
 */
export interface ConsultationRequest {
  /** Leader agent name (e.g., 'dev') */
  leader: string;
  /** Leader character name from persona (e.g., 'Jack Torrance') */
  leaderCharacter: string;
  /** Partner agent name (e.g., 'architect') */
  partner: string;
  /** Brief background context for the question */
  context: string;
  /** The specific decision point / question */
  question: string;
  /** Alternatives the leader has already considered */
  alternativesConsidered: string[];
  /** Relevant code snippets or file references */
  relevantCode: string;
  /** Token budget from workflow tandem config */
  tokenBudget: number;
}

/**
 * Parsed consultation response from partner.
 */
export interface ConsultationResponse {
  /** Partner's recommended approach */
  recommendation: string;
  /** Reasoning behind the recommendation */
  rationale: string;
  /** Pitfalls or edge cases to watch for */
  watchOutFor: string;
  /** Partner's confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Actual token count of the response (self-reported) */
  tokenCount: number;
}

/**
 * Validation result for request/response completeness.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Parameters for building the partner spawn prompt.
 */
export interface PartnerPromptParams {
  /** Agent definition markdown content */
  agentDefinition: string;
  /** Persona block for the partner */
  personaBlock: string;
  /** Formatted consultation request */
  formattedRequest: string;
  /** Token budget instruction */
  tokenBudget: number;
}

/**
 * Parameters for executing a full consultation.
 */
export interface ExecuteConsultationParams {
  /** Consultation request */
  request: ConsultationRequest;
  /** Agent definition content for the partner */
  agentDefinition: string;
  /** Persona block for the partner */
  personaBlock: string;
  /** Adapter for spawning the partner */
  adapter: ConsultationAdapter;
}

/**
 * Adapter for spawning consultation partner (like ProcessAdapter for backseat).
 * Callers inject the real Task tool implementation; tests use mocks.
 */
export interface ConsultationAdapter {
  /** Spawn partner and return their response text */
  spawn(params: {
    prompt: string;
    model: string;
  }): Promise<{ responseText: string }>;
}

/**
 * Result of a consultation execution.
 */
export interface ConsultationResult {
  success: boolean;
  data?: {
    response: ConsultationResponse;
    overBudget: boolean;
  };
  error?: string;
  /** True if consultation failed and leader should continue solo */
  degraded?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const VALID_CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);

// =============================================================================
// Implementations
// =============================================================================

/**
 * Format a consultation request as structured markdown.
 */
export function formatConsultationRequest(request: ConsultationRequest): string {
  const alternatives = request.alternativesConsidered
    .map(alt => `- ${alt}`)
    .join('\n');

  return `**Leader:** ${request.leader} (${request.leaderCharacter})
**Partner:** ${request.partner}
**Context:** ${request.context}
**Question:** ${request.question}
**Alternatives Considered:**
${alternatives}
**Relevant Code/Files:** ${request.relevantCode}
**Token Budget:** ${request.tokenBudget}`;
}

/**
 * Extract a markdown field value from text.
 * Handles leading/trailing whitespace around the value.
 */
function extractField(markdown: string, fieldName: string): string | undefined {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
  const match = markdown.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Parse a consultation response from partner's markdown output.
 * Returns null if the response cannot be parsed.
 */
export function parseConsultationResponse(markdown: string): ConsultationResponse | null {
  const recommendation = extractField(markdown, 'Recommendation');
  if (!recommendation) {
    return null;
  }

  const rationale = extractField(markdown, 'Rationale') ?? '';
  const watchOutFor = extractField(markdown, 'Watch-Out-For') ?? '';
  const confidenceRaw = extractField(markdown, 'Confidence');
  const tokenCountRaw = extractField(markdown, 'Token Count');

  if (!confidenceRaw || !VALID_CONFIDENCE_LEVELS.has(confidenceRaw)) {
    return null;
  }

  const tokenCount = tokenCountRaw ? parseInt(tokenCountRaw, 10) : 0;

  return {
    recommendation,
    rationale,
    watchOutFor,
    confidence: confidenceRaw as 'high' | 'medium' | 'low',
    tokenCount: Number.isNaN(tokenCount) ? 0 : tokenCount,
  };
}

/**
 * Validate a consultation request has all required fields.
 */
export function validateConsultationRequest(request: ConsultationRequest): ValidationResult {
  const errors: string[] = [];

  if (!request.leader) errors.push('leader is required');
  if (!request.partner) errors.push('partner is required');
  if (!request.context) errors.push('context is required');
  if (!request.question) errors.push('question is required');
  if (!request.relevantCode) errors.push('relevantCode is required');
  if (request.tokenBudget <= 0) errors.push('tokenBudget must be a positive number');

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a consultation response has all required fields.
 */
export function validateConsultationResponse(response: ConsultationResponse): ValidationResult {
  const errors: string[] = [];

  if (!response.recommendation) errors.push('recommendation is required');
  if (!response.rationale) errors.push('rationale is required');
  if (!response.watchOutFor) errors.push('watchOutFor is required');
  if (!VALID_CONFIDENCE_LEVELS.has(response.confidence)) {
    errors.push('confidence must be high, medium, or low');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build the full prompt for spawning the consultation partner.
 * Includes: agent definition, persona, formatted request, token budget instruction.
 */
export function buildPartnerPrompt(params: PartnerPromptParams): string {
  return `${params.agentDefinition}

${params.personaBlock}

# Consultation Request

${params.formattedRequest}

# Response Format

Respond using this exact format:

**Recommendation:** {your concise recommendation}
**Rationale:** {why you recommend this approach}
**Watch-Out-For:** {pitfalls or edge cases}
**Confidence:** {high|medium|low}
**Token Count:** {approximate token count of your response}

Your response must not exceed ${params.tokenBudget} tokens. Be concise and focused.`;
}

/**
 * Build spawn parameters for the consultation partner.
 * Returns model: 'sonnet' per ADR-0012 (advisors use Sonnet, not Haiku).
 */
export function buildConsultationSpawnParams(request: ConsultationRequest): {
  model: string;
  partner: string;
} {
  return {
    model: 'sonnet',
    partner: request.partner,
  };
}

/**
 * Execute a full consultation: format request → build prompt → spawn partner → parse response.
 * On failure, returns degraded result so leader can continue solo.
 */
export async function executeConsultation(
  params: ExecuteConsultationParams,
): Promise<ConsultationResult> {
  const { request, agentDefinition, personaBlock, adapter } = params;

  const formattedRequest = formatConsultationRequest(request);
  const prompt = buildPartnerPrompt({
    agentDefinition,
    personaBlock,
    formattedRequest,
    tokenBudget: request.tokenBudget,
  });
  const spawnParams = buildConsultationSpawnParams(request);

  let responseText: string;
  try {
    const result = await adapter.spawn({ prompt, model: spawnParams.model });
    responseText = result.responseText;
  } catch (err) {
    return {
      success: false,
      degraded: true,
      error: `Consultation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const parsed = parseConsultationResponse(responseText);
  if (!parsed) {
    return {
      success: false,
      degraded: true,
      error: 'Failed to parse consultation response',
    };
  }

  return {
    success: true,
    data: {
      response: parsed,
      overBudget: parsed.tokenCount > request.tokenBudget,
    },
  };
}
