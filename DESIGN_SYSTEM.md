> Historical design/decision record. The active app uses the [Expo design language](docs/DESIGN.md); see the [documentation index](docs/README.md) for current guides.

# Design system — light appearance, revision 1

Touche Grasse should feel like familiar, carefully maintained software. Editorial hierarchy, compact native lists, meaningful quantities and direct actions take precedence over decorative dashboards. The temporary wordmark is the literal name set in the system serif, semibold/bold. It is not a finished trademark or logo.

## Palette

Exact owner-selected base tokens in `ToucheGrasse/Design/Tokens.swift`:

| Token | Hex | Role |
|---|---|---|
| Ocean | #4B8299 | Brand accent; not small white-on-color text |
| Forrest | #44724F | Reserved for confirmed/saved state accents |
| Skyline | #99BFDF | Light supporting accent |
| Tangerine | #E99E26 | Reserved for cooking/time emphasis |
| Toffee | #DA682F | Culinary accent |
| Salsa | #DB3100 | Strong emphasis; not the default error text |

Use these selectively. Initial screens primarily use the Ocean family and warm background. Base tokens remain unchanged even when their contrast is unsuitable for body text.

| Semantic token | Hex | Assignment |
|---|---|---|
| background | #FAF8F2 | Page canvas |
| surface | #FFFFFF | Native list/form surfaces |
| ink | #172B32 | Primary text |
| secondary | #52626A | Supporting text |
| action | #28566B | Accessible Ocean-family links/buttons |
| error | #AC2B09 | Error text |
| divider | #D9DFDB | Decorative separation only |
| selection | #E6EFF1 | Confirmation strip/selection support |

Computed WCAG sRGB contrast: ink/background **13.85:1**, secondary/background **5.97:1**, action/background **7.51:1**, white/action **7.97:1**, error/white **6.77:1**, ink/selection **12.59:1**. See `verification/contrast.json` and the runnable check. These are token checks, not full accessibility certification. Native control, focus and increased-contrast appearances require simulator/device inspection. Never use the low-contrast decorative divider as the only control boundary.

## Type and numbers

Use Dynamic Type text styles, no fixed-size body labels:

| Use | Style |
|---|---|
| Temporary wordmark | System serif title2, bold |
| Page heading | Native large navigation title |
| Sheet heading | Native inline navigation title |
| Energy total | Rounded largeTitle, semibold, tabular digits |
| Food name | Body, medium where used in logs |
| Section/action label | Headline |
| Quantity / supporting value | Subheadline, tabular digits |
| Source / timestamp | Caption |
| Guidance / errors | Footnote or caption with explicit text |

Nutrition is formatted using `nb_NO`, normally one fractional digit, calories zero digits. Stored values remain unrounded. Unknown is an en dash plus a visible explanation; never display zero for an unknown. Dates and times use native locale formatting. The app copy is Norwegian; English food aliases are searchable. Full UI translation is future work.

## Layout and controls

Spacing scale: 4 / 8 / 16 / 24 points. Use 16-point horizontal padding where custom containers need it; native List/Form own their margins. Control radius 8, exceptional panel radius 12; native controls keep platform geometry. Avoid nesting a card system inside native lists. Dividers are structural, not decoration.

Standard actions use SF Symbols by semantic name. Bookmark saves; plus adds/repeats; search resolves; arrows change a match; minus removes a draft line; gear opens data settings. No generic icon package or mascot.

Primary commit is anchored above the safe area/keyboard with a 48-point minimum height. Icon actions have at least 44×44-point targets and explicit accessibility labels. Lists grow vertically; no food name is clipped to a decorative fixed height. The nutrient strip uses `ViewThatFits` to stack macro values at large text sizes. Form/editor sizing, very long names, all accessibility text sizes and VoiceOver order still require native review.

## Interaction states

- Quick Entry is a retained draft, independent of presentation. Dismissing it preserves text, selected foods, quantities, units and meal.
- Text parsing creates unresolved structured lines. Selecting a match retains the original quantity and unit. Every ambiguity needs a deliberate selection.
- Invalid quantities, missing conversions and unresolved foods remain visible and disable commit. Unknown nutrient values are allowed and visibly propagate to totals.
- Manual food confirmation labels missing fields clearly and disables accidental swipe dismissal once content exists. Explicit cancellation discards that manual form; the meal draft survives.
- A successful log/repeat gives a light native selection haptic and a compact text confirmation with **Angre**. It never waits for an animation.
- Native loading indicators appear at initial catalog preparation and search. Empty states explain the next action. Failures surface as errors without deleting the database or draft.
- Editing a recipe is a staged form. Save persists; cancel discards that edit. Recipe ingredient identity and exact amounts are retained.

## Motion and accessibility

Token for future nonblocking feedback: 160 ms. No custom animation is currently needed. Native navigation and sheets use platform behavior; do not add entry delays or celebration animations. Any future custom transition must honor Reduce Motion and be interruptible. Haptics follow committed actions only, independent of nutritional totals.

No under-target streaks, deficit badges, exercise calorie deduction, or praise for undereating. Target configuration is not implemented yet; do not invent targets. Color never carries the only state meaning.

Light appearance is deliberately locked for this revision. Semantic tokens make dark appearance possible, but a separately designed dark palette and native accessibility review are required before enabling it. No inverted placeholder dark mode is shipped.
