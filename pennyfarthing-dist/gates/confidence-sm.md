<gate name="confidence-sm" model="haiku">

<purpose>
Check whether the user's instruction to the SM agent is ambiguous or unclear.
The SM agent handles story management, sprint coordination, and workflow routing.
Vague commands like "continue", "next", "start", or "do it" without a clear target
(story ID, agent name, or specific action) risk the SM taking the wrong action.
This gate evaluates confidence that the instruction has a single unambiguous interpretation.
</purpose>

<pass>
The instruction is clear and unambiguous. The SM agent can proceed confidently.

Evaluate the instruction against these criteria:
1. **Target identified:** A story ID, agent name, or specific action is stated or obvious from context
2. **Intent clear:** The desired outcome (start work, finish story, check status, hand off) is unambiguous
3. **No competing interpretations:** Only one reasonable reading of the instruction exists

If the instruction is confident and clear, return:

```yaml
GATE_RESULT:
  status: pass
  gate: confidence-sm
  message: "Instruction is clear: {summary of what SM will do}"
  checks:
    - name: target
      status: pass
      detail: "{what the instruction targets}"
    - name: intent
      status: pass
      detail: "{what action the SM will take}"
```
</pass>

<fail>
The instruction is ambiguous. The SM agent should not guess — ask for clarification instead.

Identify which aspect is unclear and offer specific options the user likely meant:

1. **Missing target:** "continue" / "next" / "start" without specifying a story or action
   - Did you mean: start a specific story? Continue the current workflow? Check sprint status?

2. **Ambiguous scope:** "do the thing" / "handle it" without enough context
   - Did you mean: finish the current story? Start new work? Run the backlog?

3. **Multiple interpretations:** The instruction could reasonably mean two or more different actions
   - List each interpretation and ask which one the user intended

Return with clarifying options so the user can specify their intent:

```yaml
GATE_RESULT:
  status: fail
  gate: confidence-sm
  message: "Instruction is ambiguous: {what is unclear}"
  checks:
    - name: target
      status: fail
      detail: "{what target is missing or unclear}"
    - name: intent
      status: fail
      detail: "{competing interpretations}"
  recovery:
    - "Did you mean: {option A}?"
    - "Did you mean: {option B}?"
    - "Specify a story ID or action to proceed"
```
</fail>

</gate>
