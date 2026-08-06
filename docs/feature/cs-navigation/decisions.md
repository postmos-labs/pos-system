# CS navigation decisions

## 2026-08-06

- Keep the current URL paths and add the six-tab navigation in the shared `(app)` layout. The tab component returns `null` for non-CS paths, so unrelated pages do not gain extra UI.
- Keep `paper-orders` in `BOTTOM_NAV`; it is included in the shared CS tab bar without moving its sidebar position.
- Leave the unused duplicate `nav-items.ts` in place because deleting it is outside the required navigation change and could affect future consumers.
- Use a direct single link for the one-item CS group in `Sidebar.tsx`; this avoids showing a redundant folder heading and leaves the multi-item tech group rendering unchanged.
