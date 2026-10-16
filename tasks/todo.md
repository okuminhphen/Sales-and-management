# Task List: HappyShop UI/UX Refresh

> Trạng thái: UI Foundation đã hoàn thành. CL/CC/AS/AO/QG đã được người dùng phê
> duyệt ngày 2026-09-30 và hoàn thành ngày 2026-10-01.

## Phase A — Style and dependency foundation

- [x] **UF01 — Semantic tokens và global style entrypoint**
  - Acceptance:
    - Có token cho color, typography, spacing, radius, elevation, z-index, motion và breakpoint theo spec.
    - Global rules gồm focus-visible, media defaults và reduced-motion; Bootstrap bridge có phạm vi giới hạn.
    - Bootstrap được load trước foundation và không xóa `index.css` legacy.
  - Verify:
    - `npm run typecheck --workspace @sales/web`
    - `npm run build --workspace @sales/web`
    - Focused compatibility test cho import/render baseline.
  - Files dự kiến: `src/styles/_tokens.scss`, `_globals.scss`, `_bootstrap-bridge.scss`, `index.scss`, `src/App.tsx` hoặc `src/index.tsx`.
  - Dependencies: None.

- [x] **UF02 — Radix dependency boundary**
  - Acceptance:
    - `@radix-ui/react-tooltip` được cài ở Web workspace và khóa bằng lockfile;
      không dùng meta-package kéo các primitive ngoài phạm vi.
    - Dependency audit không có critical/high finding mới; không import Radix ngoài `components/ui`.
    - Có test/import guard tối thiểu cho boundary đã duyệt.
  - Verify:
    - `npm audit --workspace @sales/web --omit=dev`
    - `npm run typecheck --workspace @sales/web`
  - Files dự kiến: `apps/web/package.json`, `package-lock.json`, một boundary test.
  - Dependencies: None.

### Checkpoint A

- [x] Focused UI tests, Web typecheck và production build đạt.
- [x] Legacy Bootstrap control coexist với foundation mà không có console error mới.

## Phase B — Native primitives

- [x] **UF03 — Button primitive**
  - Acceptance:
    - Hỗ trợ `primary|secondary|ghost|danger`, size, loading và disabled.
    - Dùng native button semantics, default `type="button"`, token-only styling và focus-visible.
    - Loading không làm mất accessible name và chặn duplicate activation.
  - Verify: focused `button.test.tsx`, Web typecheck.
  - Files dự kiến: `components/ui/Button/*`, `components/ui/index.ts`, `tests/unit/ui/button.test.tsx`.
  - Dependencies: UF01.

- [x] **UF04 — IconButton primitive**
  - Acceptance:
    - Bắt buộc `label`, hỗ trợ ba size và touch target theo spec.
    - Render native button, có accessible name và không dùng empty `src`/decorative text.
    - Styling tái sử dụng button tokens nhưng không phụ thuộc implementation private của Button.
  - Verify: focused `iconButton.test.tsx`, Web typecheck.
  - Files dự kiến: `components/ui/IconButton/*`, `components/ui/index.ts`, test tương ứng.
  - Dependencies: UF01, UF03.

- [x] **UF05 — Surface primitive**
  - Acceptance:
    - Hỗ trợ semantic element hợp lệ và ba elevation `none|raised|overlay`.
    - Không dùng glass/blur mặc định; radius/border/shadow chỉ lấy từ token.
    - Props không cho phép tạo heading hierarchy sai ngầm định.
  - Verify: focused `surface.test.tsx`, Web typecheck.
  - Files dự kiến: `components/ui/Surface/*`, `components/ui/index.ts`, test tương ứng.
  - Dependencies: UF01.

- [x] **UF06 — StatusBadge primitive**
  - Acceptance:
    - Hỗ trợ semantic status đã duyệt với text bắt buộc và optional decorative icon.
    - Trạng thái vẫn phân biệt được khi không nhìn màu.
    - Không nhận raw domain enum trực tiếp; consumer phải map sang UI status.
  - Verify: focused `statusBadge.test.tsx`, Web typecheck.
  - Files dự kiến: `components/ui/StatusBadge/*`, `components/ui/index.ts`, test tương ứng.
  - Dependencies: UF01, UF05.

- [x] **UF07 — FeedbackState primitive**
  - Acceptance:
    - Có `loading|empty|error`, heading/message/action tùy loại.
    - Loading dùng status semantics phù hợp; error được announce nhưng không gây lặp liên tục.
    - Không fetch/retry trực tiếp; action được truyền từ consumer.
  - Verify: focused `feedbackState.test.tsx`, Web typecheck.
  - Files dự kiến: `components/ui/FeedbackState/*`, `components/ui/index.ts`, test tương ứng.
  - Dependencies: UF01, UF03, UF05.

### Checkpoint B

- [x] Toàn bộ native primitive tests đạt.
- [x] Search xác nhận primitives không import Redux/router/Axios/service.
- [x] Web typecheck và build đạt.

## Phase C — Complex interaction adapter

- [x] **UF08 — Tooltip wrapper dùng Radix**
  - Acceptance:
    - HappyShop wrapper là public API duy nhất; consumer không thấy Radix parts/type.
    - Tooltip mở bằng hover/focus, đóng bằng Escape và content có accessible relationship.
    - Motion dùng token và tắt khi `prefers-reduced-motion`.
  - Verify: focused `tooltip.test.tsx`, import-boundary search, Web typecheck/build.
  - Files dự kiến: `components/ui/Tooltip/*`, `components/ui/index.ts`, `tests/unit/ui/tooltip.test.tsx`.
  - Dependencies: UF01, UF02.

### Checkpoint C

- [x] Focused UI suite, typecheck và build đạt.
- [x] Không có direct `@radix-ui/*` import ngoài Tooltip adapter/test cho phép.

## Phase D — Documentation and closure

- [x] **UF09 — Design-system documentation và compatibility harness**
  - Acceptance:
    - Tài liệu mô tả token, primitive API, accessibility và migration examples.
    - Compatibility test render ít nhất một React Bootstrap control cạnh HappyShop primitives.
    - Không tạo production route/showcase hoặc kéo business logic vào foundation.
  - Verify: compatibility test, doc link/path check, Web typecheck.
  - Files dự kiến: `docs/ui/design-system.md`, compatibility test và tối đa ba file hỗ trợ.
  - Dependencies: UF03–UF08.

- [x] **UF10 — Final UI foundation quality gate**
  - Acceptance:
    - Full Web tests, typecheck, build và `git diff --check` đều đạt.
    - Manual checklist ghi nhận keyboard, zoom 200%, reduced motion và viewport 320/375/768/1024/1440.
    - Review xác nhận không đổi API/Redux/auth/database và không lẫn dirty changes ngoài phạm vi.
  - Verify:
    - `npm run test --workspace @sales/web`
    - `npm run typecheck --workspace @sales/web`
    - `npm run build --workspace @sales/web`
    - `git diff --check`
  - Files dự kiến: validation evidence trong `docs/ui/` nếu cần; không mở rộng source scope.
  - Dependencies: UF09.

### Final checkpoint

- [x] Spec success criteria 1–7 đều có evidence tại `docs/ui/ui-foundation-validation.md`.
- [x] Codex review hoàn tất; không có blocker trước khi bắt đầu `customer-landing`.

## Approval checkpoint — Downstream UI

- [x] Người dùng phê duyệt spec/plan `customer-landing`, `customer-commerce`,
  `admin-shell-dashboard`, `admin-operations` và `ui-quality-gate`.
  - Acceptance: hướng thiết kế, phạm vi, build order và boundaries được chấp thuận.
  - Verify: đổi trạng thái năm spec/plan sang `Đã phê duyệt` trước khi code.
  - Files: `.phunglm/specs/*.md`, `.phunglm/plans/*.md` liên quan.

## Customer branch

- [x] **CL01–CL03 — Storefront shell, navigation và content pages**
  - Acceptance: shell semantic, navigation responsive/keyboard, footer, About,
    Contact và Not Found hoàn chỉnh.
  - Verify: focused tests, typecheck, manual 320/1440px.
  - Files: chi tiết tại `.phunglm/plans/customer-landing.md`.
- [x] **CL04–CL07 — ProductCard, landing sections, hero và route checkpoint**
  - Acceptance: Home editorial đầy đủ state; banner/image fallback an toàn; routes
    dùng page mới và không còn warning/`@ts-nocheck` trong phần đã migrate.
  - Verify: focused/full tests, typecheck, build, diff check.
  - Files: chi tiết tại `.phunglm/plans/customer-landing.md`.
- [x] **CC01–CC04 — Form contract, listing, detail và cart**
  - Acceptance: controlled input ổn định; browse → detail → cart responsive và
    giữ V2/store contracts.
  - Verify: commerce + cart/catalog contract tests, typecheck.
  - Files: chi tiết tại `.phunglm/plans/customer-commerce.md`.
- [x] **CC05–CC08 — Auth, account/orders, payment và lazy routes**
  - Acceptance: purchase flow hoàn chỉnh, không React form warning, protected
    routes giữ behavior và customer chunks được tách.
  - Verify: auth/order/payment tests, full tests, typecheck, build.
  - Files: chi tiết tại `.phunglm/plans/customer-commerce.md`.

## Admin branch

- [x] **AS01–AS03 — Typed navigation, responsive shell và admin login**
  - Acceptance: role nav đúng, mobile drawer/desktop collapse accessible, auth
    behavior không đổi.
  - Verify: admin shell/login tests, typecheck, manual viewport matrix.
  - Files: chi tiết tại `.phunglm/plans/admin-shell-dashboard.md`.
- [x] **AS04–AS07 — KPI, charts, recent orders và lazy admin tabs**
  - Acceptance: dashboard typed đầy đủ state, money/status đúng và operation tabs
    không bị eager-load.
  - Verify: admin/V2 tests, full tests, typecheck, build/bundle review.
  - Files: chi tiết tại `.phunglm/plans/admin-shell-dashboard.md`.
- [x] **AO01–AO02 — Shared admin operation composites**
  - Acceptance: header, toolbar, table, form field và confirm dialog có semantics,
    keyboard và responsive tests.
  - Verify: admin-operation component tests, typecheck.
  - Files: chi tiết tại `.phunglm/plans/admin-operations.md`.
- [x] **AO03–AO05 — Catalog, branch/inventory và order screens**
  - Acceptance: screen dùng shared patterns; mutation payload giữ contract; branch
    update 400 hiển thị actionable error và không gửi null sai contract.
  - Verify: screen + V2/service tests, typecheck after each family.
  - Files: chi tiết tại `.phunglm/plans/admin-operations.md`.
- [x] **AO06–AO08 — Stock/transfer, compatibility và operations checkpoint**
  - Acceptance: fulfillment flows/permissions giữ nguyên; migrated screens không
    còn `@ts-nocheck`; cleanup có consumer proof.
  - Verify: focused/full tests, typecheck, build, diff check.
  - Files: chi tiết tại `.phunglm/plans/admin-operations.md`.

## Final UI quality gate

- [x] **QG01–QG03 — Contract, console, accessibility và responsive matrix**
  - Acceptance: không form/image/async warning; route×viewport×state checklist đạt;
    keyboard/zoom/reduced motion có evidence.
  - Verify: focused/full tests và manual validation records.
  - Files: chi tiết tại `.phunglm/plans/ui-quality-gate.md`.
- [x] **QG04–QG05 — Bundle, cleanup và final reviews**
  - Acceptance: route/tab splitting được chứng minh; no P0/P1; năm review docs và
    limitation/follow-up đầy đủ.
  - Verify: full tests, typecheck, build, diff check, final Git status review.
  - Files: chi tiết tại `.phunglm/plans/ui-quality-gate.md`.

## Database runtime hardening — 2026-10-15

- [x] Thống nhất session UTC cho API, worker và DB utilities; test epoch/ISO và
  voucher window trên MySQL `_test`, không backfill timestamp cũ.
- [x] Startup xác minh đúng migration inventory/checksum và tập bảng V2.
- [x] Sửa port host local 4306 và thêm DB preflight chỉ đọc trước launcher.
- [x] Web hỗ trợ đủ 5 trạng thái stock request; test cancel → reload/fulfilled.
- [x] Kiểm chứng 104 FK và 65 CHECK, API transaction/concurrency suites,
  typecheck/build API/Web và full Web 175/175 (một fork worker, exit 0).
- [x] Review và evidence: `docs/database-v2/runtime-hardening-validation.md`.
  Docker Engine tắt ở checkpoint hardening này; đã bật và kiểm chứng lại ở
  backend readiness bên dưới. Không reset DB, không commit/push.

## Backend DB readiness — duyệt 2026-10-15, kiểm chứng 2026-10-16

Evidence: `docs/database-v2/backend-audit-2026-10-15.md`; chi tiết acceptance,
files, verification và dependencies tại phần cùng tên trong `tasks/plan.md`.

- [x] Người dùng duyệt gỡ POS, BR01–BR07 và policy paid active hold.
- [x] BR00: gỡ implementation POS và Web client/thunk/types; route cũ trả 404.
- [x] BR01: JSON snapshot regression + fix cho online checkout.
- [x] BR02: paid pickup sau deadline vẫn xử lý được, giữ unpaid/unknown guards.
- [x] BR03: parser malformed/oversized request trả đúng 400/413.
- [x] Checkpoint A: regression + typecheck/build đạt, không schema/data workaround.
- [x] BR04: worker env/connection/logger không phụ thuộc HTTP-only config.
- [x] BR05: command/flag outbox local/production và isolated publish wiring.
- [x] BR06a: expiry worker có Compose service và guarded unpaid-release test.
- [x] BR06b: launcher quản lý worker theo PID/start-time; 16 test đạt;
  chưa chạy full launcher với DB chính (xem limitation).
- [x] BR07: API 645/645, Web 175/175, build/typecheck, worker/HTTP/DB audit đạt;
  evidence: `docs/database-v2/backend-readiness-validation.md`.
- [ ] BR08: chốt spec/approval riêng cho pickup handover và payment reconciliation;
  chưa triển khai delivery/returns/refunds chỉ từ plan sửa lỗi này.
