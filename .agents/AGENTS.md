# Project Rules & Design Guidelines

## 1. Strict Emoji Ban
- **NO EMOJIS IN CODE, UI OR TEXT**: Under no circumstances should emojis (such as 📅, 🏆, 🔥, 🛡️, 🟡, 🎓, etc.) be added to UI text, modals, banners, alerts, buttons, generated code, or documentation. Always use clean vector SVGs, CSS indicators, or clean typography instead.

## 2. Layout & Alignment Rules
- **Pixel-Perfect Centering & Alignment**: All modals, hero cards, header banners, and empty states MUST be horizontally centered with `margin: 0 auto;` or `display: flex; justify-content: center; align-items: center;`.
- **Grid Symmetry**: Equal-column grids (such as 4-week calendar cards or activity pickers) must use explicit `grid-template-columns` or `repeat(auto-fit, minmax(..., 1fr))` with balanced `gap` spacing to prevent awkward line breaks or ragged edges.
- **Consistent Vertical Spacing**: Maintain uniform padding (`padding: 24px 28px;`) and vertical gaps (`gap: 16px;` or `gap: 20px;`) across sub-components inside modals and cards.
- **Flexbox Alignment Integrity**: Every flex container (`display: flex;`) must explicitly define both `align-items` (e.g. `center`) and `justify-content` (e.g. `space-between` or `center`) to eliminate misaligned text, floating icons, or offset buttons.
- **Responsive Fluid Balance**: Container widths, max-widths, and padding must adapt cleanly without clipping text or causing horizontal scrollbars on smaller screens.

## 3. Payment & External Integration Rules
- **Database Logging**: All payment transactions must be logged in the database (`orders` or similar table) with status tracking (pending, completed, failed) before initiating requests to external providers.
- **Webhook Security**: All webhooks from external providers (like Shopier) MUST be verified using signature or token validation to prevent spoofing.
- **Idempotency**: Any operation that increments user balances (like adding coins) must be idempotent. Always check if the order status is already `completed` before updating balances to prevent double-spending.
