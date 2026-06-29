# UI Premium Upgrade Overrides

Overrides and decisions made for the premium UI refresh of OSPOS Next.js.

## Page / Area: Global

- **Palette**: Industrial slate primary `#334155`, stock-green accent `#059669`, background `#F8FAFC`, foreground `#0F172A`.
- **Typography**: Fira Sans (body), Fira Code (mono/data). Loaded via Google Fonts in `src/app/globals.css`.
- **Radius**: 0.5rem default; cards, inputs, buttons use rounded-lg.
- **Borders**: `--color-border` `#E2E8F0` consistently on cards, tables, inputs.
- **Shadows**: `shadow-sm` on cards; `shadow-md` on hover only for interactive metric cards.
- **Icons**: `lucide-react`, monochrome, 1.5–2px stroke.

## Page / Area: Sidebar

- Slate primary background (`var(--color-primary)`).
- Active item: white/10 background + left 4px accent + icon turns accent color.
- Each link has rounded-r-full right edge, 44pt+ hit area.
- Module icons mapped per module for visual wayfinding.

## Page / Area: Header

- White background, bottom border, sticky top z-30.
- User + store badge left, notification icon + logout button right.
- Logout uses red hover state and visible icon.

## Page / Area: Login

- Centered card with accent top bar.
- Inputs with left icons.
- Primary button uses accent color.

## Page / Area: Home

- Metric cards with color-coded icon badges (blue, emerald, amber, slate).
- Quick actions in a grid.
- Getting-started card with primary CTA link.

## Page / Area: POS Register

- Two-column layout: cart left, controls right.
- Search with live suggestions dropdown.
- Cart table with hover row highlight and remove affordance.
- Mode selector pills with active primary style.
- Payments panel shows paid/due/change and payment dropdown.
- Keyboard shortcuts dialog (Ctrl+H).

## Page / Area: Items List

- Header with record count and icon badge.
- Filter bar: search + location + submit + clear.
- New-item CTA uses accent color.
- Wrapped table in bordered card.
