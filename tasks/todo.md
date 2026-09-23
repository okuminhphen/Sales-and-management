# Database V2 Cutover — Task Checklist

Mỗi task giới hạn một boundary và tối đa khoảng 5 file. Mọi thay đổi hành vi đi theo
RED -> GREEN -> REFACTOR; checkpoint MySQL thật không được tính đạt nếu suite bị skip.

## Phase 0 — Contract và artifact

- [x] T01 — Version-control DBML và ADR V2.
  - Acceptance: Git-tracked artifact mô tả đúng 49 bảng/104 quan hệ; `.phunglm` không còn là dependency runtime.
  - Verify: đếm table/ref + parse DBML.
  - Files: `docs/database-v2/target-schema.dbml`, `docs/database-v2/README.md`, ADR.
  - Result: checksum khớp artifact revision 4 đã parse/export PASS; kiểm đếm lại 49 bảng/104 quan hệ.
- [x] T02 — Schema manifest và validator độc lập.
  - Acceptance: manifest khóa table names/revision/checksum; validator chạy từ dependency đã khai báo, không dùng npm cache cá nhân.
  - Verify: focused unit test.
  - Files: manifest, validator, test, package scripts/lock nếu thật sự cần.
  - Result: `@dbml/core@10.1.1` được khóa exact; 7 focused tests và parse/export MySQL đều PASS.
- [x] T03 — ID và money contract bằng test trước.
  - Acceptance: BIGINT ID serialize string; DECIMAL không qua JS Number; response envelope hiện tại không đổi ngoài type bắt buộc.
  - Verify: focused unit tests + API typecheck.
  - Files: shared ID/money types, mapper, tests.
  - Result: branded string contracts, precision/range guards và envelope mapper; 22 focused tests PASS.
- [x] Checkpoint 0 — Artifact/contract được review; focused tests và typecheck pass.
  - Result: review 5 trục hoàn tất; monorepo typecheck/build/test và Database V2 validator đều PASS.

## Phase 1 — `schema-foundation`

- [ ] T04 — RED tests cho V2 target guard và checksum drift.
  - Acceptance: thiếu target, target không `_test`, schema lạ và checksum lệch đều fail closed.
  - Verify: focused test phải đỏ trước implementation.
- [ ] T05 — V2 runner opt-in và migration metadata.
  - Acceptance: status/up chạy tách legacy; không sync alter, không auto drop/reset.
  - Verify: T04 xanh + typecheck.
- [ ] T06 — Baseline identity/access/organization/customer.
  - Acceptance: 9 bảng đầu, indexes/checks và vòng FK branch-manager tạo đúng thứ tự.
  - Verify: static schema test + focused MySQL test.
- [ ] T07 — Baseline catalog.
  - Acceptance: categories/products/sizes/variants/reviews/banners đúng DBML.
  - Verify: static schema test + focused MySQL test.
- [ ] T08 — Baseline cart/order/voucher/payment.
  - Acceptance: amount/idempotency/snapshot/unique constraints đúng DBML.
  - Verify: valid/invalid money and duplicate-key integration tests.
- [ ] T09 — Baseline shipment/return/refund.
  - Acceptance: shipment, event, return item và refund constraints đúng DBML.
  - Verify: focused integration tests.
- [ ] T10 — Baseline inventory/stock/transfer.
  - Acceptance: balance/reservation/movement và transfer constraints/indexes đúng DBML.
  - Verify: XOR/quantity/FK integration tests.
- [ ] T11 — Baseline communication/personalization/outbox.
  - Acceptance: chat state/seq/dedup/lease, behavior stats và outbox đúng DBML.
  - Verify: focused integration tests.
- [ ] T12 — Full schema metadata verification.
  - Acceptance: đúng 49 bảng nghiệp vụ + migration metadata riêng, 104 FK, rerun zero pending.
  - Verify: V2 infrastructure suite trên MySQL `_test`, không skip.
- [ ] T13 — Seed V2 idempotent.
  - Acceptance: roles, permissions, payment methods và super-admin account/role không nhân đôi.
  - Verify: chạy seed hai lần trên DB test + integration assertions.
- [ ] Checkpoint 1 — Baseline/seed MySQL thật đạt; DB chính chưa bị reset.

## Phase 2 — Typed persistence theo module

- [ ] T14 — Registry, transaction boundary và conventions V2.
  - Acceptance: module sở hữu model; composition root không chứa business logic; không import cycle.
  - Verify: registry unit test + typecheck.
- [ ] T15 — `identity-access` typed models/associations.
  - Acceptance: accounts/roles/permissions/assignments/customer/address/branch/employee khớp schema.
  - Verify: schema-model contract test.
- [ ] T16 — `catalog` typed models/associations.
  - Acceptance: category/product/variant/size/review/banner khớp schema.
  - Verify: schema-model contract test.
- [ ] T17 — `inventory-transfer` typed models/associations.
  - Acceptance: inventory/reservation/movement/stock/transfer model ownership rõ.
  - Verify: schema-model contract test.
- [ ] T18 — `commerce` + `payment-fulfillment` typed models/associations.
  - Acceptance: cart/order/voucher/payment/shipment/return/refund khớp schema.
  - Verify: schema-model contract test.
- [ ] T19 — `communication-ai` + `personalization` + outbox typed models.
  - Acceptance: chat/assistant/notification/behavior/outbox khớp schema.
  - Verify: schema-model contract test.
- [ ] T20 — Full registry against V2 MySQL.
  - Acceptance: mọi model query được, table/column/type/nullability drift đều làm test fail.
  - Verify: API integration/typecheck/build.
- [ ] Checkpoint 2 — 49-table typed persistence đạt trên DB V2 test.

## Phase 3 — Backend compatibility-first

- [ ] T21 — Auth register/OTP và customer login trên Account/Customer.
- [ ] T22 — Google login và admin login trên Account/scoped roles.
- [ ] T23 — JWT/access context và authorization helpers V2.
- [ ] T24 — User/customer profile endpoints V2.
- [ ] T25 — Role/permission/admin management endpoints V2.
- [ ] T26 — Employee và branch endpoints V2.
- [ ] T27 — Category/product/size/variant endpoints V2.
- [ ] T28 — Cart/review/banner endpoints V2.
- [ ] T29 — Inventory balance/reservation/movement service V2.
- [ ] T30 — Stock request service V2.
- [ ] T31 — Transfer receipt service V2.
- [ ] T32 — Voucher claim/release service V2.
- [ ] T33 — Order checkout/read/status + transactional outbox V2.
- [ ] T34 — Payment method/payment/webhook V2.
- [ ] T35 — Shipment compatibility và return/refund persistence boundary.
- [ ] T36 — Conversation/message state và Socket contract V2.
- [ ] T37 — Notification/behavior/chat proxy identity V2.
  - Acceptance cho T21–T37: route/envelope hiện hữu giữ tối đa; actor/scope từ JWT+DB; DTO Zod đầy đủ; mỗi slice có RED test và real-DB integration test.
  - Verify từng task: focused unit/integration + API typecheck; mỗi 2–3 task chạy API build/checkpoint regression.
- [ ] Checkpoint 3 — Existing API critical flows đạt hoàn toàn trên DB V2 test.

## Phase 4 — Consumers, cutover và cleanup

- [ ] T38 — Web auth/profile contract cho ID string và Account/Customer.
- [ ] T39 — Web catalog/cart/order/admin contract cho ID string và DECIMAL money.
- [ ] T40 — AI MySQL catalog repository dùng products/product_variants V2.
- [ ] T41 — AI personalization queries dùng customer/behavior V2; không đổi RAG/model.
- [ ] T42 — Full rehearsal Node + Python + critical smoke flows trên DB V2 test.
- [ ] T43 — Guarded local cutover: xác minh target, reset `sale_and_managements_db`, baseline + seed.
- [ ] T44 — Smoke Web/API/AI trên database chính V2.
- [ ] T45 — Xóa 50 migration và migration-order helper/test legacy.
- [ ] T46 — Xóa 32 model legacy và compatibility code tạm; default runner/registry chỉ còn V2.
- [ ] T47 — README/docs/deployment/database/ADR tiếng Việt.
- [ ] T48 — Final full validation và Codex review.
  - Acceptance: local chỉ còn 49 bảng V2 + metadata, zero pending, seed không trùng, không import legacy, Web/API/AI chạy.
  - Verify: `npm run typecheck`, `npm test`, `npm run build`, Python `ruff/mypy/pytest`, Compose config và `git diff --check`.
- [ ] Checkpoint cuối — Chỉ commit/push khi người dùng yêu cầu riêng.
