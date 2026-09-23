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

- [x] T04 — RED tests cho V2 target guard và checksum drift.
  - Acceptance: thiếu target, target không `_test`, schema lạ và checksum lệch đều fail closed.
  - Verify: focused test phải đỏ trước implementation.
  - Result: focused test RED do target guard chưa tồn tại; sau implementation 5 guard cases PASS.
- [x] T05 — V2 runner opt-in và migration metadata.
  - Acceptance: status/up chạy tách legacy; không sync alter, không auto drop/reset.
  - Verify: T04 xanh + typecheck.
  - Result: runner độc lập chỉ nhận `status`/`up`, chỉ mở explicit `_test` target và dùng metadata `database_v2_migrations` riêng; typecheck/build PASS.
- [x] T06 — Baseline identity/access/organization/customer.
  - Acceptance: 9 bảng đầu, indexes/checks và vòng FK branch-manager tạo đúng thứ tự.
  - Verify: static schema test + focused MySQL test.
  - Result: migration `0001-identity-access` tạo 9 bảng và FK vòng sau `employees`; static test và MySQL 8.4 integration test PASS, rerun chỉ có một metadata row.
- [x] T07 — Baseline catalog.
  - Acceptance: categories/products/sizes/variants/reviews/banners đúng DBML.
  - Verify: static schema test + focused MySQL test.
  - Result: migration `0002-catalog` tạo 6 bảng, FK catalog có thể tạo ngay, checks về giá/rating và index trọng yếu; `reviews.order_item_id` được index và FK defer có chủ đích sang T08.
- [x] T08 — Baseline cart/order/voucher/payment.
  - Acceptance: amount/idempotency/snapshot/unique constraints đúng DBML.
  - Verify: valid/invalid money and duplicate-key integration tests.
  - Result: migration `0003-commerce` tạo 11 bảng và FK `reviews.order_item_id`; 2 unit tests và 6 MySQL 8.4 integration tests PASS (DECIMAL, snapshot, cart/voucher/payment constraints, idempotency). API typecheck/build và full suite PASS.
- [x] T09 — Baseline shipment/return/refund.
  - Acceptance: shipment, event, return item và refund constraints đúng DBML.
  - Verify: focused integration tests.
  - Result: migration `0004-fulfillment` tạo 5 bảng/14 FK; 2 unit tests và 4 MySQL 8.4 integration tests PASS cho snapshot người nhận, dedup shipment event/provider, số lượng hàng trả và refund. API typecheck/build, full suite 146 pass và DBML validator PASS.
- [x] T10 — Baseline inventory/stock/transfer.
  - Acceptance: balance/reservation/movement và transfer constraints/indexes đúng DBML.
  - Verify: XOR/quantity/FK integration tests.
  - Result: migration `0005-inventory` tạo 9 bảng/28 FK; 2 unit tests và 3 MySQL 8.4 integration tests PASS cho stock, reservation XOR/idempotency, transfer quantity và movement source. API typecheck/build, full suite 151 pass và DBML validator PASS.
- [x] T11 — Baseline communication/personalization/outbox.
  - Acceptance: chat state/seq/dedup/lease, behavior stats và outbox đúng DBML.
  - Verify: focused integration tests.
  - Result: migration `0006-communication` tạo 9 bảng/23 FK; 2 unit tests và 4 MySQL 8.4 integration tests PASS cho chat state, message/command dedup, assistant lease/schedule, behavior aggregate và outbox event. API typecheck/build, full suite 157 pass và DBML validator PASS.
- [x] T12 — Full schema metadata verification.
  - Acceptance: đúng 49 bảng nghiệp vụ + migration metadata riêng, 104 FK, rerun zero pending.
  - Verify: V2 infrastructure suite trên MySQL `_test`, không skip.
  - Result: MySQL 8.4 integration test xác nhận đúng danh sách 49 bảng + 1 metadata, 104 FK, 6 migration thực thi một lần và rerun zero pending; full API suite 160 pass, typecheck/build PASS.
- [x] T13 — Seed V2 idempotent.
  - Acceptance: roles, permissions, payment methods và super-admin account/role không nhân đôi.
  - Verify: chạy seed hai lần trên DB test + integration assertions.
  - Result: MySQL `_test` integration xác nhận seed chạy hai lần không trùng role, permission,
    payment method, account/role grant; chỉ `SUPER_ADMIN` nhận permission nền. Runner thực tế
    cũng đạt với credential test tạm thời, luôn bị giới hạn `_test`.
- [x] Checkpoint 1 — Baseline/seed MySQL thật đạt; DB chính chưa bị reset.
  - Result: 49 bảng nghiệp vụ, 104 FK, migration checksum fail-closed và seed V2 đều được kiểm
    chứng trên MySQL `_test`; không reset hay ghi vào `sale_and_managements_db`.

## Phase 2 — Typed persistence theo module

- [x] T14 — Registry, transaction boundary và conventions V2.
  - Acceptance: module sở hữu model; composition root không chứa business logic; không import cycle.
  - Verify: registry unit test + typecheck.
  - Result: registry đóng phát hiện trùng module/model, compose association sau khi đăng ký đủ;
    `inTransaction` và model option explicit `snake_case` sẵn sàng cho module V2 tiếp theo.
- [x] T15 — `identity-access` typed models/associations.
  - Acceptance: accounts/roles/permissions/assignments/customer/address/branch/employee khớp schema.
  - Verify: schema-model contract test.
  - Result: 9 model typed thuộc module `identity-access`; contract MySQL kiểm tra table/cột và compose association PASS.
- [x] T16 — `catalog` typed models/associations.
  - Acceptance: category/product/variant/size/review/banner khớp schema.
  - Verify: schema-model contract test.
- [x] T17 — `inventory-transfer` typed models/associations.
  - Acceptance: inventory/reservation/movement/stock/transfer model ownership rõ.
  - Verify: schema-model contract test.
- [x] T18 — `commerce` + `payment-fulfillment` typed models/associations.
  - Acceptance: cart/order/voucher/payment/shipment/return/refund khớp schema.
  - Verify: schema-model contract test.
- [x] T19 — `communication-ai` + `personalization` + outbox typed models.
  - Acceptance: chat/assistant/notification/behavior/outbox khớp schema.
  - Verify: schema-model contract test.
- [x] T20 — Full registry against V2 MySQL.
  - Acceptance: mọi model query được, table/column/type/nullability drift đều làm test fail.
  - Verify: API integration/typecheck/build.
- [x] Checkpoint 2 — 49-table typed persistence đạt trên DB V2 test.
  - Result: composition root load đủ 49 model; 49 model query được; 104 FK đều có source
    `belongsTo`; cột/type/nullability được contract-test trên MySQL `_test`. API full suite,
    strict typecheck và build PASS; legacy runtime chưa import V2 persistence.

## Phase 3 — Backend compatibility-first

- [ ] T21 — Auth register/OTP và customer login trên Account/Customer.
  - Tiến độ: core service/repository V2, OTP claim lifecycle và MySQL integration đã có; chưa chuyển HTTP route khi consumer legacy còn cần numeric ID.
- [ ] T22 — Google login và admin login trên Account/scoped roles.
  - Tiến độ: core đăng nhập backoffice bằng username/password đã dùng `accounts`, DB-derived
    scoped grants và MySQL integration. Google login chưa được chuyển: hợp đồng 49 bảng hiện
    chưa có immutable provider subject (ví dụ Google `sub`), nên không được liên kết Account
    theo email. Cần một revision schema được phê duyệt trước khi triển khai OAuth V2.
- [ ] T23 — JWT/access context và authorization helpers V2.
  - Tiến độ: V2 JWT (BIGINT string + issuer/audience), DB-derived access context, scoped authorization helper và HTTP middleware fail-closed đã có; route chuyển dần theo capability sau.
- [ ] T24 — User/customer profile endpoints V2.
  - Tiến độ: core own-profile dùng Account + Customer đã có transaction, ownership theo
    DB-derived access context, username uniqueness mapping và MySQL integration. HTTP endpoint
    vẫn chờ auth/middleware V2 được nối vào app compatibility, không trộn với legacy numeric ID.
- [ ] T25 — Role/permission/admin management endpoints V2.
  - Tiến độ: core Role/Permission V2 đã có global-scope authorization, immutable seeded roles,
    atomic replace permission mapping, chặn xóa role đang được gán và MySQL integration; HTTP
    route vẫn chờ composition runtime V2, không mount vào legacy app.
- [ ] T26 — Employee và branch endpoints V2.
  - Tiến độ: employee core đã có branch/global authorization, DECIMAL/ID serialization,
    duplicate code mapping, deactivate thay hard-delete, directory phân trang theo code (20/100)
    và MySQL integration. Branch core đã có create/read/update, mã bất biến, global-only write,
    mapping duplicate code và test MySQL `_test`; directory phân trang theo code (20/100), không
    hard-delete hay tự tạo inventory cũ.
    Gán manager, account-linking, employee transfer, audit cho production HTTP và route V2 vẫn
    là slice tiếp theo vì có audit/scope semantics riêng; chưa mount vào legacy app.
- [ ] T27 — Category/product/size/variant endpoints V2.
  - Tiến độ: category directory V2 public đã có pagination theo code (20/100), BIGINT-safe
    serialization và unit/MySQL `_test` integration. Size directory public đã có pagination
    deterministic theo `name`, rồi `id` (20/100), serialization BIGINT và unit/MySQL `_test`
    integration; nó không trả hoặc suy diễn tồn kho. Product directory/detail public hiện chỉ
    đọc `active`, phân trang `created_at DESC`/`id DESC`, trả DECIMAL/ID an toàn và lọc image JSON
    thành URL `http/https`; nó không join inventory. Variant directory theo product chỉ trả parent
    và variant `active`, định danh variant/size và tên size theo thứ tự deterministic, không lộ
    SKU/stock. Mutation category/product/size/variant, DTO/route compatibility, policy chống
    cycle category và contract availability theo branch vẫn chưa chuyển.
- [ ] T28 — Cart/review/banner endpoints V2.
  - Tiến độ: banner directory public chỉ đọc `active`, có pagination deterministic (20/100),
    serialize BIGINT, lọc JSON ảnh và target URL trước khi ra client; có unit/MySQL `_test`
    integration. Own-cart read core dùng customer ID từ V2 access context, phân trang và trả
    giá DECIMAL string; item ngừng bán vẫn hiện với `catalogActive=false`. Cart add core đã dùng
    DB-derived customer ID, transaction + cart row lock, chặn variant ngừng bán và quantity vượt
    `INT`; unit/MySQL `_test` integration xác nhận cộng dồn đồng thời không mất cập nhật hay trùng
    dòng. Cart remove core xóa atomic theo customer ownership, che phân biệt foreign/missing
    item ID; có MySQL `_test` integration. Cart update core khóa theo owner, chỉ đổi số lượng
    nguyên dương của item còn bán và có test MySQL `_test`. Review create core lấy customer từ
    V2 context, validate rating/comment và dùng unique DB chống review trùng đồng thời; có
    unit/MySQL `_test` integration. Review listing core có pagination 20/100, ordering ổn định,
    projection tránh lộ customer/account ID và test MySQL `_test`. Banner write/xoá media,
    DTO/route compatibility và audit chưa chuyển.
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
