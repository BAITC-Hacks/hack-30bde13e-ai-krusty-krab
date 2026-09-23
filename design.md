# Design — Hackalem AI

## Genre
Modern minimal, utilitarian. The interface is a working surface for comparing organisational documents.

## Macrostructure family
- App pages: Workbench. A concise heading, clear primary action, then the actual working data.
- Navigation: edge aligned minimal. Footer: one quiet line.

## Theme
Warm paper, white surfaces, dark slate ink, a restrained terracotta accent. `frontend/tokens.css` is the source of values.

## Typography
Geist Variable for display and body, upright throughout. Labels and numeric metadata use a small mono role when needed.

## Spacing and motion
Use the named 4-point scale and short transform/opacity transitions in `frontend/tokens.css`. No page reveals. Respect reduced motion.

## Interaction
Show focus visibly. Keep success quiet. Keep primary actions filled and secondary actions outlined. Upload and analysis states stay explicit.

## Per-page allowances
App pages use no decorative imagery. Their documents, status, metrics, and evidence provide the visual content.
