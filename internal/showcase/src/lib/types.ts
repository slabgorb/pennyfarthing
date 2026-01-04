/**
 * TypeScript interfaces for Pennyfarthing theme data
 *
 * These types represent the structure of theme YAML files
 * transformed for client-side consumption.
 */

/**
 * OCEAN personality scores (Big Five model)
 * Each score ranges from 1-5
 */
export interface OceanScores {
  O: number; // Openness
  C: number; // Conscientiousness
  E: number; // Extraversion
  A: number; // Agreeableness
  N: number; // Neuroticism
}

/**
 * Agent helper configuration
 */
export interface AgentHelper {
  name: string;
  style: string;
}

/**
 * Individual agent persona within a theme
 */
export interface Agent {
  role: string; // Agent role key (sm, tea, dev, etc.)
  character: string;
  shortName: string; // Display name for portraits
  ocean: OceanScores;
  style: string;
  expertise: string;
  roleSummary: string; // Original 'role' field from YAML
  quote: string;
  trait: string;
  quirks: string[];
  catchphrases: string[];
  emoji: string;
  helper: AgentHelper;
}

/**
 * Theme metadata from YAML theme block
 */
export interface ThemeMetadata {
  name: string;
  description: string;
  source: string;
  defaultEmojiUse: string;
  defaultHumor: string;
  characterImmersion: string;
  userTitle: string;
}

/**
 * Complete theme with all agents
 */
export interface Theme {
  id: string; // Filename without .yaml extension
  metadata: ThemeMetadata;
  agents: Agent[];
}

/**
 * Raw YAML structure for parsing
 */
export interface RawThemeYaml {
  theme: {
    name: string;
    description: string;
    source: string;
    default_emoji_use?: string;
    default_humor?: string;
    character_immersion?: string;
    user_title?: string;
  };
  agents: Record<
    string,
    {
      character: string;
      shortName?: string;
      ocean: OceanScores;
      style: string;
      expertise: string;
      role: string;
      quote: string;
      trait: string;
      quirks?: string[];
      catchphrases?: string[];
      emoji?: string;
      helper?: {
        name: string;
        style: string;
      };
    }
  >;
}
