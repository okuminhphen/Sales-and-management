# Implementation Plan: HappyShop UI/UX Refresh

Capability map: `.phunglm/specs/ui-ux-refresh-capability-map.md`.

Toàn bộ sáu module đã hoàn thành; downstream được người dùng phê duyệt ngày
2026-09-30 và final quality gate hoàn tất ngày 2026-10-01.

## Dependency order

```text
UF01 tokens/styles ─┬─ UF03 Button ─ UF04 IconButton
UF02 Radix package ─┴─ UF08 Tooltip
UF01 ─ UF05 Surface ─ UF06 StatusBadge ─ UF07 FeedbackState
UF03..UF08 ─ UF09 docs/compatibility ─ UF10 final validation
     │
     ├─ customer-landing ─> customer-commerce ─┐
     └─ admin-shell-dashboard ─> admin-operations ─> ui-quality-gate
```

## Checkpoints

- Checkpoint A: sau UF01–UF02.
- Checkpoint B: sau UF03–UF07.
- Checkpoint C: sau UF08.
- Final quality gate: UF09–UF10.

## Module plans

- `.phunglm/plans/customer-landing.md`: CL01–CL07.
- `.phunglm/plans/customer-commerce.md`: CC01–CC08.
- `.phunglm/plans/admin-shell-dashboard.md`: AS01–AS07.
- `.phunglm/plans/admin-operations.md`: AO01–AO08.
- `.phunglm/plans/ui-quality-gate.md`: QG01–QG05.

## Architecture decisions

- Giữ React/TypeScript/SCSS/React Bootstrap/React Icons và API/Redux contracts.
- Customer dùng editorial luxury, warm ivory/ink/bronze; admin dùng cùng nhận
  diện với mật độ cao hơn và không dùng blur/glass trên vùng dữ liệu.
- Không thêm dependency, font CDN hay asset từ repo tham chiếu.
- Migrate theo vertical slice, loại `@ts-nocheck` ở screen đã migrate và lazy-load
  route/tab để tách customer khỏi admin bundle.

## Approval checkpoint

Người dùng duyệt toàn bộ năm spec/plan downstream trước CL01/AS01. Sau khi duyệt,
hai nhánh customer và admin có thể triển khai độc lập theo dependency order; final
gate QG01–QG05 chỉ chạy khi cả hai nhánh hoàn tất.

Chi tiết task và trạng thái được theo dõi trong `tasks/todo.md`.

## Backend DB readiness — 2026-10-15

**Trạng thái: Đã duyệt 2026-10-15. Người dùng yêu cầu gỡ POS và sửa 5 finding.**
BR00–BR07 hoàn tất, kiểm chứng tiếp ngày 2026-10-16; kết quả và giới hạn tại
`docs/database-v2/backend-readiness-validation.md`. BR08 còn chờ spec riêng.
Evidence: `docs/database-v2/backend-audit-2026-10-15.md`.
Spec/review agent: `.phunglm/specs/backend-db-readiness.md` và review cùng tên.
Các kế hoạch UI/hardening đã hoàn tất ở trên được giữ nguyên.

### Phạm vi và quyết định

- Giữ schema revision 4; chưa có lý do sửa bảng/FK để xử lý các lỗi đã xác nhận.
- Sửa lỗi writer và lifecycle tại backend; giữ API/permissions và transaction
  boundaries. Không sửa trực tiếp dữ liệu cũ hay reset DB.
- Giữ payment provider facts riêng với quyết định hoàn tất đơn; không tự coi
  pending/unknown là failed khi timeout. Không gọi provider thật trong test.
- Worker phải có cấu hình tối thiểu phù hợp, không làm yếu production HTTP
  validation và không cấp thêm JWT/email/payment secrets chỉ để worker khởi động.
- RED trước GREEN; test thật trên `_test`, main DB chỉ đọc. Không thêm dependency.

### BR00 — Gỡ hoàn toàn tính năng POS

Gỡ service/repository/controller/DTO/route POS và client/thunk/types Web; endpoint
`POST /order/in-store` không còn tồn tại. Xóa test feature POS cũ, thay bằng test
route/client không tồn tại. Không sửa schema/migration/historical read model,
không xóa dữ liệu lịch sử. Không thay POS bằng một write path in-store khác.

### BR01 — P1: JSON snapshot ở checkout online

- Acceptance: NULL, [], URL array và media asset array đều checkout online được;
  snapshot là JSON hợp lệ, không đổi khi sửa ảnh catalog; lỗi khác rollback.
- Files: online checkout repository; integration suite; helper snapshot nếu
  thực sự cần (tối đa khoảng 5 file).
- Verify: focused `databaseV2OnlinePickupCheckout`
  bằng `npm run test --workspace @sales/api -- --run ...`, MySQL `_test` bật.
- Dependencies: không. Scope: M.

### BR02 — P1: Paid pickup không bị deadline xử lý của nhân viên chặn

- Acceptance: thanh toán đủ tiền đã verified + active hold đúng nguồn cho phép
  xác nhận sau deadline; unpaid/partial/unknown hoặc hold thực sự finalized
  không được lọt qua; callback/expiry/confirm race không tạo oversell/double effect.
- Giải pháp ưu tiên: bảo vệ active hold đã đủ tiền và tách deadline thanh toán
  khỏi thời gian staff xử lý, kiểm tra dưới order/payment/inventory locks. Không
  cần tự động confirm toàn bộ order ngay khi có callback. Callback tới sau khi
  hold đã thực sự expired/released cần policy exception riêng, không giả thành công.
- Files: confirmation và reservation repository, hai focused integration suites
  lifecycle/payment (khoảng 4 file). Không sửa test bằng SQL để giả recovery.
- Verify: paid-before-deadline/confirm-after-deadline, unpaid expiry,
  partial/pending guard, duplicate/retry/race với real MySQL.
- Dependencies: BR01; duyệt policy paid active hold. Scope: M.

### BR03 — P2: Parser errors có HTTP contract đúng

- Acceptance: malformed JSON → 400, quá limit → 413, lỗi nội bộ thật → 500;
  response an toàn + request ID, không raw body/stack hoặc arbitrary error.status.
- Files: `apps/api/src/app.ts`, test app boundary (2 file).
- Verify: focused app tests qua Supertest, sau đó API suite.
- Dependencies: không. Scope: S.

### Checkpoint A

BR01–BR03 có regression RED → GREEN; API typecheck/build và suite đạt.
Không đổi schema, không nhả payment unresolved, không mất stock/payment ledger.

### BR04 — P1: Cấu hình worker tách khỏi HTTP-only requirements

- Acceptance: outbox/expiry worker parse production env tối thiểu cần thiết;
  thiếu DB/broker config cần thiết phải fail closed; API production vẫn yêu cầu
  JWT/reCAPTCHA/email/payment guards hiện có; logger/connection không kéo lại
  HTTP env parser qua import gián tiếp.
- Files dự kiến: config module(s), connection/logger boundary, unit config tests.
  Chốt dependency graph trước khi code; nếu vượt 5 file, tách config và consumers
  thành hai slice có test độc lập, không refactor toàn bộ env module tùy tiện.
- Verify: parse declared production worker env với giá trị giả; negative tests
  thiếu config; existing API env tests giữ xanh. Không cấp secrets thừa cho worker.
- Dependencies: duyệt phương án config boundary. Scope: M, checkpoint design.

### BR05 — P1: Outbox command/flag local và production

- Acceptance: Compose gọi compiled worker command có thật; enable flag rõ ràng;
  production image không phụ thuộc tsx/devDependencies; fake/isolated event đi
  từ outbox tới broker một lần về business effect dù có retry.
- Files: local/production Compose, worker entrypoint nếu cần, wiring test,
  README (tối đa khoảng 5 file).
- Verify: manifest-to-package/image command contract test; config validate không
  in secrets; isolated `_test`/test-routing broker smoke được duyệt. Không consume
  hay publish outbox chính trong validation.
- Dependencies: BR04. Scope: M.

### BR06a — P1 operational: Expiry worker trong Compose

- Acceptance: local/production có service + flag, config đúng runtime và shutdown;
  unpaid hold quá hạn được nhả; pending/processing/completed giữ guard.
- Files: hai Compose manifests, wiring test, README (khoảng 4 file).
- Verify: service/command/env checks; isolated `_test` worker runOnce workflow.
- Dependencies: BR04. Scope: M.

### BR06b — P1 operational: Expiry worker cho local host launcher

- Acceptance: launcher quản lý đúng PID/start-time và start/stop worker theo scope
  workspace; helper chạy ẩn; không dừng app khác, không xóa Docker volume; không
  chạy chồng host worker và Compose worker ngoài ý muốn.
- Files: start/run-service/stop launcher và launcher test (khoảng 4 file).
- Verify: parse + launcher tests; isolated start/stop smoke nếu được duyệt;
  documentation giải thích host/Compose topology.
- Dependencies: BR06a, duyệt topology local. Scope: M.

### BR07 — Final backend gate và cập nhật evidence

- Acceptance: full API MySQL/Redis suite + các regression mới đạt, API/Web
  typecheck/build đạt; main schema/rows không đổi; mọi worker cần thiết có cách
  kiểm tra readiness/progress, không chỉ API health/live.
- Verify: commands trong audit, `_test` guard, diff check, review nguồn thay đổi.
- Files: validation/report/checklist; không mở thêm source scope. Scope: S.
- Dependencies: BR01–BR06.

### BR08 — Capability checkpoint riêng, không tự triển khai

Sau khi sửa lỗi, ưu tiên đặc tả **pickup handover/completion API**: staff đúng
branch, đã thu đủ tiền, idempotency, consume hold/stock ledger/status history/outbox
trong một transaction. Hiện primitive tồn tại nhưng online HTTP flow chưa nối.
Chốt actor, điều kiện thu tiền, trạng thái đầu/cuối và refund exception trước khi
lập các slice implementation; không mở generic status setter.

Payment reconciliation pending/unknown là spec riêng với provider facts/retry và
exception queue. Delivery/COD, returns/refunds đầy đủ và customer-address CRUD
là roadmap sau, cần business policy/approval, không suy ra từ việc DB đã có bảng.

### Thứ tự và rủi ro

Ưu tiên BR01 → BR02 → Checkpoint A; BR03 độc lập. Sau đó BR04 → BR05/BR06 → BR07.
BR08 chỉ chuyển sang triển khai sau approval riêng. Rủi ro cao nhất là sửa paid
hold bằng cách yếu hóa timeout/payment guards; không chấp nhận workaround SQL
backfill, auto-failed pending payments hay nới production API validation.

## Frontend API readiness — audit 2026-10-16, đề xuất chưa triển khai

Evidence: `docs/ui/frontend-api-audit-2026-10-16.md`. Người dùng yêu cầu kiểm tra
frontend sau khi commit/push backend. Audit không đồng nghĩa duyệt các API/policy
nghiệp vụ mới. Giữ UI hiện tại và schema revision 4.

1. **FR01 — P1: Auth boundary customer/admin.** Tách lựa chọn session đúng cho
   từng API, gửi Bearer customer, xử lý expired/401, tránh adminToken ghi đè
   customer. Test login → cart/profile/order/chat, hai session đồng thời,
   logout/account switch. Không hạ guard backend hay thêm cookie fallback.
2. **FR02 — P1: Employee partial edit.** Chỉ gửi trường thực sự chỉnh hoặc giữ
   giá trị cũ; không ghi null salary/hiredAt từ form không có hai trường đó.
   Regression với salary/hiredAt có giá trị, sửa tên xong dữ liệu vẫn nguyên.
3. **FR03 — P1: Customer order permissions/actions.** Chốt minimum own-read grant
   cho CUSTOMER và provisioning idempotent; test customer đăng ký mới, own/cross
   customer và scoped staff. Ẩn own-cancel chưa hỗ trợ hoặc chốt policy command
   owner/payment/hold riêng; không nới generic internal cancel.
4. **FR04 — P1: Payment/order lifecycle.** Trang kết quả chỉ khẳng định trạng thái
   dựa trên server facts; query giả không được báo đã thu tiền. Nối browser return,
   verified status và pending UI. Tạm bỏ lựa chọn thu tiền tại quầy chưa hỗ trợ;
   không phục hồi POS. Handover/completion + reconciliation theo BR08 cần spec
   actor/state/payment/refund exception riêng trước khi thêm API.
5. **FR05 — P2: Pagination/performance.** Giữ server pagination cho product/order/
   branch/employee/stock/transfer, dùng totalItems cho KPI; không giới hạn âm thầm
   100 bản ghi hoặc nạp variants cho mọi card. Test >100 items, last page/search,
   partial network failure và request count; không suy từ local timing ra SLA.
6. **FR06 — P2: Transfer UI lifecycle.** Nối API dispatch/complete/discrepancy theo
   permissions và branch thực tế, thêm receiving flow. Test request → approve →
   dispatch → receive → reconcile/complete, replay và insufficient stock.
7. **FR07 — P2: Recovery/session/cart.** Persist/resume checkout/payment key và
   order receipt, retry sau mất response/refresh, guest-cart merge, account switch,
   reconcile cart sau thành công. Test slow/offline/double-click/stale response;
   socket reconnect/ack không mất message draft.
8. **FR08 — Capability coverage.** Chốt UI role/permission, employee link/transfer,
   branch manager assignment và notifications đã có backend API. Delivery/refund/
   address CRUD/newsletter là product scope riêng; không dựng nút giả thành công.
9. **FR09 — Release gate.** Actual Web → API tests với fresh seeded customer/admin/
   branch actors, provider sandbox khi có cấu hình, browser desktop/mobile,
   keyboard/error/empty/loading matrix. Không dùng mock-only suite làm bằng chứng
   duy nhất cho sales end-to-end readiness.

Thứ tự: FR01/FR02 → FR03/FR04 → FR05/FR06/FR07 → capability scope → FR09.
Không tự sửa dữ liệu chính, cấp role rộng, đổi schema hoặc gọi provider thật để
đưa kiểm thử qua. Backend checkpoint đã push là `6645a1c`; source UI đang audit
chưa được gộp vào checkpoint đó.
