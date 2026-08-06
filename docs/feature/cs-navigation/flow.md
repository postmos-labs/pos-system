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
       └─ 용지 요청 /paper-orders
```

The existing URLs remain unchanged. `CsTabBar` uses `usePathname()` to mark the active tab with blue text and an underline.

## 2026-08-06 current audit

- `src/components/layout/navItems.ts` is the live navigation source used by `Sidebar.tsx` and `AppHeader.tsx`.
- `src/components/layout/nav-items.ts` has no imports/usages outside its own declarations, so it is intentionally left untouched.
- The tech folder data is unchanged. Sidebar rendering now treats a one-item role group as a direct link, which removes the CS folder header while preserving the existing multi-item tech folder behavior.
