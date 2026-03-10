# Visual System Contract

> Premium, calmer, more decisive, less template-like

This document defines the shared visual contract for the HR Dashboard. All UI improvements must follow these guidelines to ensure consistency and a cohesive premium experience.

---

## Design Philosophy

### Core Principles

1. **Calm confidence**: Reduce visual noise. Every element earns its place.
2. **Decisive hierarchy**: Clear distinction between primary actions and secondary options.
3. **Premium surfaces**: Subtle depth through shadows, not just borders.
4. **Purposeful motion**: Animation aids understanding, never distracts.

### What We Avoid

- Template-like generic appearances
- Harsh borders without purpose
- Busy backgrounds or excessive gradients
- Jarring transitions or bouncy animations
- Inconsistent spacing that feels "off"

---

## Color System

### Semantic Colors

Use semantic tokens, not raw color values. All colors use the oklch color space for perceptual uniformity.

| Token | Purpose | Light | Dark |
|-------|---------|-------|------|
| `--background` | Page background | `oklch(0.985 0.002 270)` | `oklch(0.13 0.005 270)` |
| `--foreground` | Primary text | `oklch(0.18 0.01 270)` | `oklch(0.95 0.005 270)` |
| `--muted` | Secondary surfaces | `oklch(0.96 0.005 270)` | `oklch(0.22 0.008 270)` |
| `--muted-foreground` | Secondary text | `oklch(0.52 0.01 270)` | `oklch(0.68 0.01 270)` |
| `--card` | Card backgrounds | `oklch(1 0 0)` | `oklch(0.18 0.008 270)` |
| `--border` | Subtle dividers | `oklch(0.90 0.005 270)` | `oklch(0.28 0.008 270)` |

### Primary Palette

The primary color is a refined indigo-blue that conveys professionalism and trust.

| Token | Light | Dark |
|-------|-------|------|
| `--primary` | `oklch(0.55 0.18 265)` | `oklch(0.72 0.14 265)` |
| `--primary-foreground` | `oklch(0.98 0.01 265)` | `oklch(0.15 0.02 265)` |

### Status Colors

Consistent semantic colors for pipeline and application states:

| Status | Color | Usage |
|--------|-------|-------|
| Success/Ahead/Hired | `oklch(0.62 0.17 145)` | Positive outcomes |
| Warning/On-track | `oklch(0.75 0.15 75)` | Needs attention |
| Danger/Behind/Rejected | `oklch(0.60 0.20 25)` | Critical/negative |
| Neutral/New/Withdrawn | `oklch(0.55 0.02 270)` | Inactive states |

### Stage Colors

Hiring pipeline stages use a deliberate progression:

| Stage | Color Token | Reasoning |
|-------|-------------|-----------|
| NEW | Neutral gray | Awaiting action |
| SCREENING | Calm blue | Initial review |
| INTERVIEWING | Warm amber | Active engagement |
| FINAL_ROUND | Confident purple | High consideration |
| OFFER | Success green | Positive outcome |
| HIRED | Success green | Completed success |
| REJECTED | Muted red | Closed negative |
| WITHDRAWN | Neutral gray | Candidate chose out |

---

## Typography

### Font Stack

- **Sans**: Geist Sans (fallback: Inter, system-ui)
- **Mono**: Geist Mono (fallback: JetBrains Mono, monospace)

### Type Scale

Base size: 16px (1rem). Scale ratio: 1.2 (minor third)

| Name | Size | Line Height | Weight | Usage |
|------|------|-------------|--------|-------|
| `text-xs` | 0.75rem (12px) | 1.5 | 400-500 | Captions, badges |
| `text-sm` | 0.875rem (14px) | 1.5 | 400-500 | Secondary text, table cells |
| `text-base` | 1rem (16px) | 1.5 | 400-500 | Body text |
| `text-lg` | 1.125rem (18px) | 1.4 | 500 | Card titles |
| `text-xl` | 1.25rem (20px) | 1.3 | 600 | Section headers |
| `text-2xl` | 1.5rem (24px) | 1.25 | 600-700 | Page titles |
| `text-3xl` | 1.875rem (30px) | 1.2 | 700 | KPI values |

### Letter Spacing

- Headlines (xl+): `-0.01em` (tighter)
- Body text: `0` (normal)
- Small text/labels: `0.01em` (slightly loose)
- All-caps labels: `0.05em`

---

## Spacing

### Base Unit

4px base unit. All spacing derives from this rhythm.

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Inline gaps, icon spacing |
| `--space-2` | 8px | Tight component padding |
| `--space-3` | 12px | Standard component padding |
| `--space-4` | 16px | Card padding, section gaps |
| `--space-5` | 20px | Medium section spacing |
| `--space-6` | 24px | Large gaps |
| `--space-8` | 32px | Section separation |
| `--space-10` | 40px | Major section breaks |
| `--space-12` | 48px | Page-level spacing |
| `--space-16` | 64px | Hero spacing |

### Component Spacing Guidelines

- **Cards**: 16px padding (py-4 px-4), 24px gap between cards
- **Tables**: 12px cell padding (px-3 py-3), 16px header padding
- **Forms**: 16px field gaps, 24px section gaps
- **Buttons**: 8-12px horizontal padding, based on size
- **Modals**: 24px padding, 16px gap between elements

---

## Border & Radius

### Border Treatment

Borders should be subtle and purposeful:

| Context | Style |
|---------|-------|
| Cards | `ring-1 ring-border` (no hard borders) |
| Inputs | `border border-input` with `ring` on focus |
| Tables | `border-b border-border` for rows |
| Dividers | `border-t border-border` |

### Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small badges, tight UI |
| `--radius-md` | 6px | Buttons, inputs |
| `--radius-lg` | 8px | Cards, dropdowns |
| `--radius-xl` | 12px | Modals, large cards |
| `--radius-2xl` | 16px | Hero cards |
| `--radius-full` | 9999px | Pills, avatars |

---

## Elevation & Shadows

### Shadow Scale

Use shadows to create depth hierarchy, not decoration:

| Level | Shadow | Usage |
|-------|--------|-------|
| `--shadow-xs` | `0 1px 2px oklch(0 0 0 / 0.04)` | Subtle lift (buttons) |
| `--shadow-sm` | `0 1px 3px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04)` | Cards at rest |
| `--shadow-md` | `0 4px 6px oklch(0 0 0 / 0.06), 0 2px 4px oklch(0 0 0 / 0.04)` | Hover states, dropdowns |
| `--shadow-lg` | `0 10px 15px oklch(0 0 0 / 0.08), 0 4px 6px oklch(0 0 0 / 0.04)` | Modals, popovers |
| `--shadow-xl` | `0 20px 25px oklch(0 0 0 / 0.10), 0 8px 10px oklch(0 0 0 / 0.04)` | Toasts, floating panels |

### Dark Mode Shadows

In dark mode, use lighter shadows with reduced opacity:

```css
.dark {
  --shadow-sm: 0 1px 3px oklch(0 0 0 / 0.3), 0 1px 2px oklch(0 0 0 / 0.2);
  /* ... */
}
```

### Ring Treatment

Focus and selection rings use the primary color:

| State | Style |
|-------|-------|
| Focus | `ring-2 ring-ring ring-offset-2` |
| Focus (subtle) | `ring-1 ring-ring/50` |
| Selection | `ring-2 ring-primary/30` |

---

## Motion

### Duration Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 100ms | Micro-interactions (hover) |
| `--duration-normal` | 150ms | Standard transitions |
| `--duration-slow` | 250ms | Complex animations |
| `--duration-slower` | 350ms | Page transitions |

### Easing Functions

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard easing |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exit animations |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Enter animations |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful feedback |

### What Gets Animated

| Property | Duration | Easing |
|----------|----------|--------|
| `background-color` | fast | default |
| `border-color` | fast | default |
| `color` | fast | default |
| `opacity` | normal | default |
| `transform` | normal | out |
| `box-shadow` | normal | default |
| `width/height` | slow | out |

### What Never Animates

- Layout shifts that cause reflow
- Font size changes
- Border width changes
- Anything during initial page load

---

## Component Patterns

### Cards

```
- Background: var(--card)
- Border: ring-1 ring-border (subtle)
- Shadow: var(--shadow-sm) at rest
- Radius: var(--radius-lg)
- Padding: var(--space-4)
- Hover: var(--shadow-md), slight bg shift
```

### Buttons

```
Primary:
- Background: var(--primary)
- Text: var(--primary-foreground)
- Shadow: var(--shadow-xs)
- Hover: darken 10%, var(--shadow-sm)
- Active: darken 15%, no shadow

Secondary:
- Background: var(--secondary)
- Border: ring-1 ring-border
- Hover: bg-muted
```

### Inputs

```
- Background: var(--background)
- Border: border border-input
- Focus: ring-2 ring-ring border-ring
- Radius: var(--radius-md)
- Height: 36px (default), 32px (sm), 40px (lg)
```

### Tables

```
- Header: bg-muted/50, font-medium, text-muted-foreground
- Rows: border-b border-border
- Hover: bg-muted/30
- Cell padding: px-3 py-3
```

---

## Implementation Checklist

When building or updating a component, verify:

- [ ] Uses semantic color tokens, not raw values
- [ ] Follows spacing scale (no arbitrary values like 13px)
- [ ] Radius matches component type guidelines
- [ ] Shadow level appropriate for elevation
- [ ] Transitions use defined durations and easings
- [ ] Focus states are visible and consistent
- [ ] Dark mode works correctly
- [ ] Responsive at all breakpoints

---

## Migration Notes

### Converting Existing Components

1. Replace hex colors with oklch semantic tokens
2. Audit spacing - snap to 4px grid
3. Add appropriate shadows for elevation
4. Ensure consistent radius usage
5. Add motion tokens to transitions
6. Test dark mode thoroughly

### Files to Update

- `globals.css` - Token definitions
- `button-variants.ts` - Button styles
- `card.tsx` - Card component
- `kpi-card.tsx` - Dashboard cards
- Individual page components as needed

---

## Accessibility Requirements

### Color Contrast

All color combinations must meet WCAG 2.1 AA standards:

| Context | Minimum Ratio |
|---------|---------------|
| Body text on background | 4.5:1 |
| Large text (18px+ or 14px bold) | 3:1 |
| UI components and graphics | 3:1 |
| Focus indicators | 3:1 against adjacent colors |

### Focus Indicators

- **Always visible** - Never hide focus rings
- **High contrast** - 2px ring with clear color
- **Consistent** - Same pattern across all interactive elements
- **Keyboard navigable** - All interactive elements focusable via Tab

### Touch Targets

- Minimum: **44x44px** (WCAG 2.1 AAA)
- Recommended: **48x48px** for primary actions
- Spacing: **8px minimum** between adjacent targets

### Motion Preferences

Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Color Independence

- Never use color as the only indicator of meaning
- Pair color with icons, text, or patterns
- Status badges include text labels, not just colors

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-10 | Initial contract definition |
| 1.1 | 2026-03-10 | Added accessibility requirements section |
