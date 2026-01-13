/**
 * BMAD Project Context Reader - Story 32-4
 *
 * Parses BMAD project-context.md files and extracts technology stack,
 * implementation rules, and AI agent guidance for Pennyfarthing integration.
 */
/**
 * Extract sections from markdown content by splitting on ## headers.
 */
function extractSections(content) {
    // Normalize line endings
    const normalized = content.replace(/\r\n/g, '\n');
    const sections = [];
    // Split on ## headers, keeping the header
    const parts = normalized.split(/^##(?!#)\s*/m);
    for (const part of parts) {
        if (!part.trim())
            continue;
        // First line is the header name, rest is content
        const lines = part.split('\n');
        const headerLine = lines[0].trim();
        const sectionContent = lines.slice(1).join('\n').trim();
        // Skip if this is the H1 title (starts with # Project Context or similar)
        if (headerLine.startsWith('# '))
            continue;
        sections.push({
            name: headerLine,
            content: sectionContent,
        });
    }
    return sections;
}
/**
 * Find a section by name (case-insensitive, handles variations with extra spaces).
 */
function findSection(sections, name) {
    const normalizedName = name.toLowerCase().trim();
    return sections.find(s => s.name.toLowerCase().trim() === normalizedName);
}
// =============================================================================
// Technology Stack parsing
// =============================================================================
/**
 * Extract subsections (### headers) from a section's content.
 */
function extractSubsections(content) {
    const subsections = new Map();
    const parts = content.split(/^###\s*/m);
    for (const part of parts) {
        if (!part.trim())
            continue;
        const lines = part.split('\n');
        const headerLine = lines[0].trim();
        const subsectionContent = lines.slice(1).join('\n').trim();
        // Skip if there's no header
        if (!headerLine)
            continue;
        subsections.set(headerLine.toLowerCase(), subsectionContent);
    }
    return subsections;
}
/**
 * Parse a technology field from a line like "- **Framework:** React" or "- Framework: React"
 */
function parseTechField(content, fieldName) {
    // Try with bold markers first: - **Field:** Value
    const boldPattern = new RegExp(`^-\\s*\\*\\*${fieldName}:\\*\\*\\s*(.+)$`, 'im');
    let match = content.match(boldPattern);
    if (match) {
        return match[1].trim();
    }
    // Try without bold markers: - Field: Value
    const plainPattern = new RegExp(`^-\\s*${fieldName}:\\s*(.+)$`, 'im');
    match = content.match(plainPattern);
    if (match) {
        return match[1].trim();
    }
    return undefined;
}
/**
 * Parse the Technology Stack section.
 */
function parseTechnologyStack(content) {
    const stack = {};
    const subsections = extractSubsections(content);
    // Parse Frontend
    const frontendContent = subsections.get('frontend');
    if (frontendContent) {
        stack.frontend = {
            framework: parseTechField(frontendContent, 'Framework'),
            language: parseTechField(frontendContent, 'Language'),
            stateManagement: parseTechField(frontendContent, 'State Management'),
            styling: parseTechField(frontendContent, 'Styling'),
            buildTool: parseTechField(frontendContent, 'Build Tool'),
        };
        // Clean up undefined fields
        if (!stack.frontend.framework && !stack.frontend.language &&
            !stack.frontend.stateManagement && !stack.frontend.styling &&
            !stack.frontend.buildTool) {
            delete stack.frontend;
        }
    }
    // Parse Backend
    const backendContent = subsections.get('backend');
    if (backendContent) {
        stack.backend = {
            language: parseTechField(backendContent, 'Language'),
            framework: parseTechField(backendContent, 'Framework'),
            database: parseTechField(backendContent, 'Database'),
            cache: parseTechField(backendContent, 'Cache'),
            apiStyle: parseTechField(backendContent, 'API Style'),
        };
        // Clean up undefined fields
        if (!stack.backend.language && !stack.backend.framework &&
            !stack.backend.database && !stack.backend.cache &&
            !stack.backend.apiStyle) {
            delete stack.backend;
        }
    }
    // Parse Infrastructure
    const infraContent = subsections.get('infrastructure');
    if (infraContent) {
        stack.infrastructure = {
            cloudProvider: parseTechField(infraContent, 'Cloud Provider'),
            containerRuntime: parseTechField(infraContent, 'Container Runtime'),
            orchestration: parseTechField(infraContent, 'Orchestration'),
            ciCd: parseTechField(infraContent, 'CI/CD'),
        };
        // Clean up undefined fields
        if (!stack.infrastructure.cloudProvider && !stack.infrastructure.containerRuntime &&
            !stack.infrastructure.orchestration && !stack.infrastructure.ciCd) {
            delete stack.infrastructure;
        }
    }
    return stack;
}
// =============================================================================
// Implementation Rules parsing
// =============================================================================
/**
 * Parse the Critical Implementation Rules section.
 * Format: 1. **Title:** Description (possibly multi-line)
 */
function parseImplementationRules(content) {
    const rules = [];
    const lines = content.split('\n');
    let currentRule = null;
    let currentDescription = [];
    for (const line of lines) {
        // Check for a new rule: N. **Title:** Description or N. Title: Description
        const boldMatch = line.match(/^(\d+)\.\s*\*\*(.+?):\*\*\s*(.*)$/);
        const plainMatch = line.match(/^(\d+)\.\s*(.+?):\s*(.+)$/);
        if (boldMatch) {
            // Save previous rule if exists
            if (currentRule && currentRule.number !== undefined) {
                rules.push({
                    number: currentRule.number,
                    title: currentRule.title,
                    description: currentDescription.join('\n').trim(),
                });
            }
            currentRule = {
                number: parseInt(boldMatch[1], 10),
                title: boldMatch[2].trim(),
            };
            currentDescription = boldMatch[3] ? [boldMatch[3].trim()] : [];
        }
        else if (plainMatch) {
            // Save previous rule if exists
            if (currentRule && currentRule.number !== undefined) {
                rules.push({
                    number: currentRule.number,
                    title: currentRule.title,
                    description: currentDescription.join('\n').trim(),
                });
            }
            currentRule = {
                number: parseInt(plainMatch[1], 10),
                title: plainMatch[2].trim(),
            };
            currentDescription = plainMatch[3] ? [plainMatch[3].trim()] : [];
        }
        else if (currentRule && line.trim() && !line.match(/^\d+\./)) {
            // Continuation line for multi-line description
            currentDescription.push(line.trim());
        }
    }
    // Don't forget the last rule
    if (currentRule && currentRule.number !== undefined) {
        rules.push({
            number: currentRule.number,
            title: currentRule.title,
            description: currentDescription.join('\n').trim(),
        });
    }
    return rules;
}
// =============================================================================
// AI Agent Guidance parsing
// =============================================================================
/**
 * Parse bullet list items from content.
 */
function parseBulletList(content) {
    const items = [];
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ')) {
            items.push(trimmed.substring(2).trim());
        }
    }
    return items;
}
/**
 * Parse the AI Agent Guidance section.
 */
function parseAiAgentGuidance(content) {
    const guidance = {};
    const subsections = extractSubsections(content);
    // Parse Do section
    const doContent = subsections.get('do');
    if (doContent) {
        guidance.do = parseBulletList(doContent);
    }
    // Parse Don't section
    const dontContent = subsections.get("don't");
    if (dontContent) {
        guidance.dont = parseBulletList(dontContent);
    }
    // Parse Context Loading section
    const contextContent = subsections.get('context loading');
    if (contextContent) {
        guidance.contextLoading = contextContent;
    }
    return guidance;
}
// =============================================================================
// External Dependencies parsing
// =============================================================================
/**
 * Parse the External Dependencies table.
 * Format: | Dependency | Purpose | Documentation |
 */
function parseExternalDependencies(content) {
    const dependencies = [];
    const lines = content.split('\n');
    for (const line of lines) {
        // Skip header rows and separator rows
        if (line.includes('Dependency') && line.includes('Purpose'))
            continue;
        if (line.match(/^\|[-\s|]+\|$/))
            continue;
        // Match table row: | Name | Purpose | URL |
        const match = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
        if (match) {
            const name = match[1].trim();
            const purpose = match[2].trim();
            const documentation = match[3].trim();
            // Skip if any field is empty or looks like a header
            if (name && purpose && documentation &&
                name !== 'Dependency' && purpose !== 'Purpose') {
                dependencies.push({ name, purpose, documentation });
            }
        }
    }
    return dependencies;
}
// =============================================================================
// Main Parser Function
// =============================================================================
/**
 * Parse a BMAD project-context.md file and extract structured context.
 *
 * @param content - Raw markdown content of project-context.md
 * @returns ContextParseResult with success status and either context or errors
 */
export function parseBmadContext(content) {
    const errors = [];
    // Handle empty content
    if (!content || !content.trim()) {
        return {
            success: false,
            errors: [{ section: 'Content', message: 'Content is empty' }],
        };
    }
    // Extract sections
    const sections = extractSections(content);
    // Parse Overview (required)
    const overviewSection = findSection(sections, 'Overview');
    let overview = '';
    if (!overviewSection) {
        errors.push({
            section: 'Overview',
            message: 'Missing Overview section.',
        });
    }
    else {
        overview = overviewSection.content.trim();
    }
    // Parse Technology Stack (required)
    const techSection = findSection(sections, 'Technology Stack');
    let technologyStack = {};
    if (!techSection) {
        errors.push({
            section: 'Technology Stack',
            message: 'Missing Technology Stack section.',
        });
    }
    else {
        technologyStack = parseTechnologyStack(techSection.content);
    }
    // Parse Critical Implementation Rules (required)
    const rulesSection = findSection(sections, 'Critical Implementation Rules');
    let implementationRules = [];
    if (!rulesSection) {
        errors.push({
            section: 'Critical Implementation Rules',
            message: 'Missing Critical Implementation Rules section.',
        });
    }
    else {
        implementationRules = parseImplementationRules(rulesSection.content);
    }
    // Return errors if required sections are missing
    if (errors.length > 0) {
        return {
            success: false,
            errors,
        };
    }
    // Parse optional sections
    const projectStructureSection = findSection(sections, 'Project Structure');
    const projectStructure = projectStructureSection?.content.trim() || undefined;
    const codingStandardsSection = findSection(sections, 'Coding Standards');
    const codingStandards = codingStandardsSection?.content.trim() || undefined;
    const aiGuidanceSection = findSection(sections, 'AI Agent Guidance');
    let aiAgentGuidance;
    if (aiGuidanceSection) {
        const parsed = parseAiAgentGuidance(aiGuidanceSection.content);
        if (parsed.do || parsed.dont || parsed.contextLoading) {
            aiAgentGuidance = parsed;
        }
    }
    const externalDepsSection = findSection(sections, 'External Dependencies');
    let externalDependencies;
    if (externalDepsSection) {
        const parsed = parseExternalDependencies(externalDepsSection.content);
        if (parsed.length > 0) {
            externalDependencies = parsed;
        }
    }
    const envSetupSection = findSection(sections, 'Environment Setup');
    const environmentSetup = envSetupSection?.content.trim() || undefined;
    return {
        success: true,
        context: {
            overview,
            technologyStack,
            implementationRules,
            projectStructure,
            codingStandards,
            aiAgentGuidance,
            externalDependencies,
            environmentSetup,
        },
    };
}
//# sourceMappingURL=context-reader.js.map