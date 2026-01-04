#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const THEMES_DIR = path.join(__dirname, '../../pennyfarthing-dist/personas/themes');
const OUTPUT_DIR = __dirname;

const PROMPT_TEMPLATE = `Generate individual character portraits for the {{THEME_NAME}} theme.

**Style:** Traditional woodcut illustration, black and white only, bold linework with crosshatching for shading. High contrast, no grayscale gradients - only pure black lines on white background. Evokes medieval or Renaissance woodblock prints.

**Source:** {{SOURCE}}

**Characters:**
1. **Orchestrator:** {{ORCHESTRATOR}}
2. **SM (Scrum Master):** {{SM}}
3. **TEA (Test Engineer):** {{TEA}}
4. **Dev (Developer):** {{DEV}}
5. **Reviewer:** {{REVIEWER}}
6. **Architect:** {{ARCHITECT}}
7. **PM (Product Manager):** {{PM}}
8. **Tech Writer:** {{TECH_WRITER}}
9. **UX Designer:** {{UX_DESIGNER}}
10. **DevOps:** {{DEVOPS}}

**Requirements:**
- Each portrait clearly identifiable as the named character
- Include a small identifying prop or visual element for each character
- Consistent woodcut style across all portraits
- Bold black lines, white background, crosshatch shading only
- Bust/headshot composition
`;

function getCharacterDescription(agent) {
  if (!agent) return 'Unknown character';
  const name = agent.character || 'Unknown';
  const style = agent.style || '';
  const quirks = agent.quirks ? agent.quirks.slice(0, 2).join(', ') : '';

  let desc = name;
  if (style) desc += ` - ${style.split('.')[0]}`;
  if (quirks) desc += ` (${quirks})`;
  return desc;
}

function generatePrompt(themeData, themeName) {
  const theme = themeData.theme || {};
  const agents = themeData.agents || {};

  let prompt = PROMPT_TEMPLATE;
  prompt = prompt.replace('{{THEME_NAME}}', theme.name || themeName);
  prompt = prompt.replace('{{SOURCE}}', theme.source || 'Unknown source');
  prompt = prompt.replace('{{ORCHESTRATOR}}', getCharacterDescription(agents.orchestrator));
  prompt = prompt.replace('{{SM}}', getCharacterDescription(agents.sm));
  prompt = prompt.replace('{{TEA}}', getCharacterDescription(agents.tea));
  prompt = prompt.replace('{{DEV}}', getCharacterDescription(agents.dev));
  prompt = prompt.replace('{{REVIEWER}}', getCharacterDescription(agents.reviewer));
  prompt = prompt.replace('{{ARCHITECT}}', getCharacterDescription(agents.architect));
  prompt = prompt.replace('{{PM}}', getCharacterDescription(agents.pm));
  prompt = prompt.replace('{{TECH_WRITER}}', getCharacterDescription(agents['tech-writer']));
  prompt = prompt.replace('{{UX_DESIGNER}}', getCharacterDescription(agents['ux-designer']));
  prompt = prompt.replace('{{DEVOPS}}', getCharacterDescription(agents.devops));

  return prompt;
}

function main() {
  const themeFiles = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.yaml'));

  console.log(`Found ${themeFiles.length} theme files`);

  for (const file of themeFiles) {
    const themeName = path.basename(file, '.yaml');
    const themePath = path.join(THEMES_DIR, file);
    const outputPath = path.join(OUTPUT_DIR, `${themeName}.txt`);

    try {
      const content = fs.readFileSync(themePath, 'utf8');
      const themeData = yaml.parse(content);
      const prompt = generatePrompt(themeData, themeName);

      fs.writeFileSync(outputPath, prompt);
      console.log(`Generated: ${themeName}.txt`);
    } catch (err) {
      console.error(`Error processing ${file}: ${err.message}`);
    }
  }

  console.log('Done!');
}

main();
