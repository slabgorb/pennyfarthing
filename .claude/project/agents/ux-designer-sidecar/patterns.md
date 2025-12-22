# UX Designer Agent Patterns

> User experience and interface design patterns

## Design Principles

### User-Centered Design
- Understand user goals first
- Design for the common case
- Make errors recoverable
- Provide clear feedback

### Consistency
- Use established patterns
- Maintain visual hierarchy
- Follow platform conventions
- Reuse components

## Component Patterns

### Button Hierarchy
```
Primary   - Main action (one per view)
Secondary - Supporting actions
Tertiary  - Less important actions
Danger    - Destructive actions (red)
```

### Form Design
```
Label (above input)
[Input field        ]
Helper text or error message

✓ Group related fields
✓ Mark required fields
✓ Show validation inline
✓ Preserve user input on error
```

### Table Patterns
```
┌─────────┬──────────┬─────────┐
│ Column  │ Column   │ Actions │
├─────────┼──────────┼─────────┤
│ Data    │ Data     │ Edit ⋯  │
│ Data    │ Data     │ Edit ⋯  │
└─────────┴──────────┴─────────┘
         [Pagination]

✓ Sortable columns
✓ Filterable data
✓ Row actions in last column
✓ Empty state with guidance
```

## Layout Patterns

### Page Structure
```
┌────────────────────────────┐
│ Header / Navigation        │
├────────────────────────────┤
│ Page Title + Actions       │
├────────────────────────────┤
│                            │
│ Main Content Area          │
│                            │
├────────────────────────────┤
│ Footer (if needed)         │
└────────────────────────────┘
```

### Card Layout
```
┌─────────────────────┐
│ Card Header         │
├─────────────────────┤
│                     │
│ Card Content        │
│                     │
├─────────────────────┤
│ Card Actions        │
└─────────────────────┘
```

## Feedback Patterns

### Loading States
- Skeleton screens for initial load
- Spinners for actions (< 3 seconds)
- Progress bars for long operations
- Always indicate something is happening

### Error Messages
```
✗ "Error occurred"           (too vague)
✓ "Email address is invalid" (specific)
✓ "Try again or contact support" (actionable)
```

### Success Confirmation
- Toast for minor actions
- Modal for significant changes
- Inline for form submissions
- Animation for delightful feedback

## Accessibility Patterns

### Keyboard Navigation
- All interactive elements focusable
- Logical tab order
- Visible focus indicators
- Escape to close modals

### Screen Reader Support
```html
<!-- Use semantic HTML -->
<button>Submit</button>  ✓
<div onclick="">Submit</div>  ✗

<!-- Add ARIA when needed -->
<div role="alert" aria-live="polite">
  Form submitted successfully
</div>
```

### Color Contrast
- Text: minimum 4.5:1 ratio
- Large text: minimum 3:1 ratio
- Don't convey info by color alone
- Test with color blindness simulators

## Responsive Design

### Breakpoints
```css
/* Mobile first */
.component { /* base styles */ }

@media (min-width: 640px)  { /* sm */ }
@media (min-width: 768px)  { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
```

### Mobile Considerations
- Touch targets: minimum 44x44px
- Avoid hover-dependent interactions
- Simplify navigation for small screens
- Test on actual devices

## Design Specification Format

### Component Spec
```markdown
## [Component Name]

### Purpose
[What problem does this solve?]

### Variants
- Default
- Active
- Disabled
- Error

### States
- Idle
- Hover
- Focus
- Loading

### Accessibility
- Keyboard: [interactions]
- Screen reader: [announcements]

### Responsive
- Mobile: [behavior]
- Desktop: [behavior]
```

---

*Add design patterns and decisions below*
