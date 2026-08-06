# CS navigation flow

```text
Sidebar navItems.ts
  └─ CS 업무 (/dashboard)

(app)/layout.tsx
  └─ CsTabBar (only on six CS paths)
       ├─ CS 대시보드 /dashboard
       ├─ 가맹 접수 /franchise
       ├─ 우국상 관리 /woo
       ├─ 변경 관리 /changes
       ├─ 인터넷 관리 /internet
       └─ 대형 가맹점 /large-franchises
```

`CsTabBar` uses `usePathname()` to mark the active tab with blue text and an underline.

## 2026-08-06 large franchise tab replacement

- The `용지 발송 관리대장` tab and `/paper-orders` route are fully replaced by the `대형 가맹점`
  tab at `/large-franchises`.
- This change is limited to the UI route and navigation. The `paper_orders` table and dashboard
  backup download list remain unchanged.

## 2026-08-06 current audit

- `src/components/layout/navItems.ts` is the live navigation source used by `Sidebar.tsx` and `AppHeader.tsx`.
- `src/components/layout/nav-items.ts` has no imports/usages outside its own declarations; its unused
  duplicate navigation entries were updated only to keep the replacement label and route consistent.
- The tech folder data is unchanged. Sidebar rendering now treats a one-item role group as a direct link, which removes the CS folder header while preserving the existing multi-item tech folder behavior.
