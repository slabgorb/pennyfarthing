# Step 10: Install Cyclist (Optional)

<purpose>
Optionally install Cyclist, the visual terminal interface for Claude Code. Cyclist provides a graphical interface with panels for sprint tracking, workflow visualization, and enhanced tool display.
</purpose>

<instructions>
1. Explain what Cyclist provides
2. Check if Cyclist is already installed
3. Offer installation options
4. Guide through setup if desired
5. Verify installation works
</instructions>

<output>
- User informed about Cyclist features
- Cyclist installed if user requested
- Basic verification completed
- User knows how to launch Cyclist
</output>

## WHAT IS CYCLIST?

```
🚴 Cyclist - Visual Terminal for Claude Code
═════════════════════════════════════════════

Cyclist provides a graphical interface that enhances Claude Code with:

┌─────────────────────────────────────────────────────────────────────┐
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ Sprint Panel │ │ Workflow     │ │ Changed      │                │
│  │              │ │ Panel        │ │ Files        │                │
│  │ • Status     │ │              │ │              │                │
│  │ • Stories    │ │ • Phase      │ │ • Diffs      │                │
│  │ • Progress   │ │ • Handoffs   │ │ • Staging    │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                     Message Panel                              │ │
│  │                                                                │ │
│  │  Claude: I'll help you implement that feature...               │ │
│  │                                                                │ │
│  │  [Tool Call] Reading src/components/App.tsx                    │ │
│  │  [Tool Call] Writing src/components/Feature.tsx                │ │
│  │                                                                │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

Features:
  • 📊 Sprint panel - Live sprint status and story tracking
  • 🔄 Workflow panel - BikeLane phase visualization
  • 📁 Changed files panel - Git diff integration
  • 🎨 Themed personas - Character portraits and styles
  • 🛠️ Tool visualization - Enhanced tool call display
  • ⌨️ Quick actions - One-click workflow commands
```

## INSTALLATION CHECK

```bash
# Check if Cyclist is installed
npm list @pennyfarthing/cyclist 2>/dev/null || echo "Not installed"

# Check for global installation
which cyclist 2>/dev/null || echo "No global cyclist"

# Check for local installation
ls -la node_modules/@pennyfarthing/cyclist 2>/dev/null || echo "Not in node_modules"
```

## INSTALLATION OPTIONS

```
🚴 Cyclist Installation
═══════════════════════

Cyclist is the visual terminal for Pennyfarthing. Would you like to install it?

[1] Install Cyclist (recommended)
    npm install @pennyfarthing/cyclist
    Adds ~160MB to node_modules

[2] Install globally
    npm install -g @pennyfarthing/cyclist
    Available system-wide

[3] Use standalone app (macOS)
    Download Cyclist.app from releases
    No npm installation needed

[4] Skip - I'll use terminal only
    Cyclist is optional, CLI works fine without it

[5] Learn more about Cyclist
    Show detailed feature breakdown
```

### Installation Flow

If user selects [1] or [2]:

```bash
# Local installation
npm install @pennyfarthing/cyclist

# Or global installation
npm install -g @pennyfarthing/cyclist
```

### Post-Installation Setup

```
✓ Cyclist installed successfully

Quick setup:
  1. Add to justfile (if created):
     cyclist:
         npx cyclist

  2. Or run directly:
     npx cyclist

  3. Or add to package.json scripts:
     "cyclist": "cyclist"
```

## VERIFICATION

After installation:

```bash
# Verify installation
npx cyclist --version

# Quick test (opens Cyclist)
npx cyclist --help
```

```
✓ Cyclist v9.1.1 installed

Launching Cyclist for verification...

{Cyclist window opens or web preview starts}

Did Cyclist launch correctly?
[Y] Yes, it works
[N] No, troubleshoot
[S] Skip verification
```

### Troubleshooting

If issues:

```
🔧 Cyclist Troubleshooting
═══════════════════════════

Common issues:

1. "Cannot find module" error
   → Run: npm install @pennyfarthing/cyclist

2. Port already in use
   → Kill existing process: lsof -i :3457 | kill

3. Electron not found
   → Cyclist needs Electron: npm install electron

4. Blank window
   → Check browser console for errors
   → Try: npx cyclist --no-sandbox

[R] Retry installation
[M] More troubleshooting options
[S] Skip Cyclist for now
```

## JUSTFILE INTEGRATION

If justfile was created in step 6, offer to add Cyclist recipe:

```
Add Cyclist recipe to justfile?

[Y] Yes, add recipe:
    cyclist:
        npx cyclist

[N] No, I'll launch it manually
```

## CYCLIST FEATURES DEEP DIVE

If user selects "Learn more":

```
🚴 Cyclist Features
════════════════════

PANELS (draggable, resizable):
┌────────────────┬─────────────────────────────────────────────┐
│ Panel          │ Features                                    │
├────────────────┼─────────────────────────────────────────────┤
│ Message        │ Conversation display, streaming, markdown   │
│ Sprint         │ Current sprint, stories, progress bars      │
│ Workflow       │ BikeLane phases, handoff detection          │
│ Changed Files  │ Git status, staged/unstaged, diffs          │
│ Acceptance     │ Story AC checkboxes                         │
│ Todos          │ Task list tracking                          │
│ Background     │ Background task monitoring                  │
│ Debug          │ OTEL spans, performance data                │
│ Git            │ Branch info, commit history                 │
│ Settings       │ Theme, fonts, colors                        │
└────────────────┴─────────────────────────────────────────────┘

TOOL VISUALIZATION:
  • Collapsible tool calls with intent summaries
  • Stacked consecutive tool calls
  • Color-coded by tool type
  • Execution time display

PERSONA INTEGRATION:
  • Character portraits for each agent
  • Theme-specific colors and styles
  • Agent popup with role info

QUICK ACTIONS:
  • Detected from CYCLIST markers
  • One-click workflow commands
  • Handoff buttons
```

## SUCCESS CRITERIA

✅ User informed about Cyclist features
✅ Installation completed (if requested)
✅ Verification passed (if installed)
✅ Justfile updated (if applicable)
✅ User knows how to launch Cyclist

## NEXT STEP

After Cyclist setup, proceed to `step-11-complete.md` to finalize project setup and run validation.
