# Expo design language

The shared source of truth is `apps/mobile/src/ui/theme.ts`, with controls in `components.tsx`, typography in `Text.tsx`, original pictograms in `Icon.tsx` and reduced-motion behavior in `Motion.tsx`.

## Foundations

- Charcoal canvas (#19191C), raised surfaces (#252529) and warm text (#F4EFE8).
- Peach action color (#E8A27D), with blue, orange and lavender nutrient accents.
- DM Sans for controls and numeric information; Newsreader for selected editorial headings.
- Compact rows and inline review instead of repeated oversized panels. Use depth to explain interaction, not simulated glossy shading.
- The five destinations are Today, Library, central circular **+ Log**, Discover and History. Voice is an entry method within Log.

Reuse shared fields, buttons and feedback components. Keep selected, disabled, focus and error states readable. Maintain useful touch targets, semantic labels, screen-reader nutrient descriptions and layouts that survive narrow widths and enlarged text. Respect reduced-motion settings.

Use actual source records and fictional diaries in screenshots. Unknown nutrition stays visually distinct from zero. Preparation distinctions and unresolved matches must remain visible. Ordinary resolved logging, repeating and consuming a saved portion should remain one-action flows.

The root DESIGN_SYSTEM.md documents an earlier Swift/light-theme direction and is preserved for historical context, not as current Expo styling guidance.
