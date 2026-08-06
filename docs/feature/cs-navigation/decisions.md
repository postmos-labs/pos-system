# CS navigation decisions

## 2026-08-06

- Keep the current CS URL paths and add the six-tab navigation in the shared `(app)` layout, except
  for the intentional `/paper-orders` to `/large-franchises` replacement. The tab component
  returns `null` for non-CS paths, so unrelated pages do not gain extra UI.
- Replace the `paper-orders` entry in `BOTTOM_NAV` and the shared CS tab bar with `/large-franchises`
  labeled `대형 가맹점`; the paper-order table itself remains untouched.
- Leave the unused duplicate `nav-items.ts` in place because deleting it is outside the required navigation change and could affect future consumers.
- Use a direct single link for the one-item CS group in `Sidebar.tsx`; this avoids showing a redundant folder heading and leaves the multi-item tech group rendering unchanged.
