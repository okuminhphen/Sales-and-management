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
  - Tiến độ: core, OTP claim lifecycle, HTTP V2 riêng và MySQL integration đã có. Test đi hết OTP fake email -> verification token -> Account/Customer -> login JWT; email/username trùng trả 409. Chưa mount runtime vì consumer legacy còn numeric ID.
- [ ] T22 — Google login và admin login trên Account/scoped roles.
  - Tiến độ: core và HTTP backoffice bằng username hoặc email/password đã dùng `accounts`, DB-derived
    scoped grants và MySQL integration. Seed SUPER_ADMIN không có username nên chấp nhận email làm định danh đăng nhập. Google login chưa được chuyển: hợp đồng 49 bảng hiện
    chưa có immutable provider subject (ví dụ Google `sub`), nên không được liên kết Account
    theo email. Cần một revision schema được phê duyệt trước khi triển khai OAuth V2.
- [ ] T23 — JWT/access context và authorization helpers V2.
  - Tiến độ: V2 JWT (BIGINT string + issuer/audience), DB-derived access context, scoped authorization helper và HTTP middleware fail-closed đã có; auth/profile và T28 HTTP V2 riêng đã dùng. Context bỏ grant nội bộ khi employee không active, bỏ CUSTOMER khi customer không active; test MySQL xác nhận. Runtime mount chờ cutover.
- [ ] T24 — User/customer profile endpoints V2.
  - Tiến độ: core own-profile dùng Account + Customer đã có transaction, ownership theo
    DB-derived access context, username uniqueness mapping và MySQL integration. HTTP V2 riêng có GET `/user/:id`, PUT `/user/update/:userId` (chỉ own profile) và test MySQL; runtime legacy chưa mount.
- [ ] T25 — Role/permission/admin management endpoints V2.
  - Tiến độ: core Role/Permission V2 đã có global-scope authorization, immutable seeded roles,
    atomic replace permission mapping, chặn xóa role đang được gán và MySQL integration; HTTP V2 riêng đã có `/role/read`, `/role/permissions`, `/role/create`, `/role/update/:roleId`, `/role/delete/:roleId` và MySQL test. Account/admin management legacy chưa chuyển; runtime chưa mount.
- [ ] T26 — Employee và branch endpoints V2.
  - Tiến độ: employee core và HTTP V2 riêng đã có branch/global authorization, DECIMAL/ID serialization,
    duplicate code mapping, deactivate thay hard-delete, directory phân trang theo code (20/100)
    và MySQL integration. Branch core đã có create/read/update, mã bất biến, global-only write,
    mapping duplicate code và test MySQL `_test`; directory phân trang theo code (20/100), không
    hard-delete hay tự tạo inventory cũ.
    HTTP V2 có tạo/đọc/sửa branch và tạo/đọc/sửa/deactivate employee; gán manager chỉ nhận employee active cùng branch. Account-linking và transfer yêu cầu grant global, không tự cấp role mới; transfer thu hồi grant branch nguồn trong transaction và clear manager cũ. Deactivate cũng clear manager. Test MySQL/JWT đã có; runtime chưa mount. Legacy `/employee/read` toàn hệ thống, admin/account management và quyết định hợp đồng Web vẫn cần chuyển.
- [ ] T27 — Category/product/size/variant endpoints V2.
  - Tiến độ: standalone HTTP router `catalog-v2.ts` đã nối public category/size/product/variant
    read models với DTO Zod, envelope `EM/EC/DT`, pagination, 400/404/503; test HTTP/MySQL `_test`
    và strict typecheck đạt. Category create/update/delete đã có quyền global từ DB,
    transaction khóa hierarchy chống cycle kể cả hai request đồng thời, cấm xóa khi có
    child/product; unit/MySQL test. Size create/update/delete đã có duplicate-name 409 và
    FK-in-use 409, unit/MySQL test. Product metadata create/update/deactivate đã có: giá DECIMAL
    string, create mặc định draft, category FK được kiểm tra, không hard-delete; outbox event
    được ghi cùng transaction. Variant create/update/deactivate đã có SKU unique, cặp
    product/size unique, không hard-delete và không nhận stock; outbox product event commit
    cùng mutation. Product media replace/clear 1–5 ảnh đã có pre-auth trước buffering,
    chữ ký file, 5 MiB/file, reservation/cleanup outbox bền vững và worker đối chiếu
    reference banner/product. MySQL test có rollback và mất commit acknowledgement;
    Cloudinary thật chưa gọi. Product-by-category public V2 đã có pagination/MySQL test.
    Core catalog V2 hoàn tất; router chưa mount vào app legacy (T38–T44).
    Category directory V2 public đã có pagination theo code (20/100), BIGINT-safe
    serialization và unit/MySQL `_test` integration. Size directory public đã có pagination
    deterministic theo `name`, rồi `id` (20/100), serialization BIGINT và unit/MySQL `_test`
    integration; nó không trả hoặc suy diễn tồn kho. Product directory/detail public hiện chỉ
    đọc `active`, phân trang `created_at DESC`/`id DESC`, trả DECIMAL/ID an toàn và lọc image JSON
    thành URL `http/https`; nó không join inventory. Variant directory theo product chỉ trả parent
    và variant `active`, định danh variant/size và tên size theo thứ tự deterministic, không lộ
    SKU/stock. Legacy `/category/check` vốn handler rỗng, Web không dùng; recommendation
    phụ thuộc AI/MySQL sẽ chuyển T40. Contract Web thuộc T39; availability theo branch T29.
- [ ] T28 — Cart/review/banner endpoints V2.
  - [x] Core banner directory: chỉ đọc `active`, phân trang 20/100, serialize BIGINT,
    lọc JSON ảnh và target URL trước khi ra client; unit/MySQL `_test` integration.
  - [x] Core own-cart: read/add/update/remove theo customer ID từ V2 access context;
    transaction/row lock cho mutation, giới hạn quantity, không mất cập nhật đồng thời,
    không lộ item của owner khác; unit/MySQL `_test` integration.
  - [x] Core review: create theo customer V2 context, unique DB chống trùng đồng thời;
    listing phân trang ổn định, không lộ customer/account ID; unit/MySQL `_test` integration.
  - [x] Core banner metadata: create/update/delete khi không có media; global catalog
    permission từ role nội bộ (`SUPER_ADMIN` không cần employee profile), validate đầu vào,
    transaction/row lock; unit/MySQL `_test`.
  - [x] Core admin banner directory: thấy đủ draft/active/inactive, phân trang ổn định,
    chỉ cho global catalog manager; lọc ảnh/target URL và có unit/MySQL `_test`.
  - [x] Banner media lifecycle: upload ảnh hợp lệ, dọn ảnh cũ sau khi DB commit và bảo đảm
    cleanup có retry/durable record; không xóa DB row chứa media khi cơ chế này chưa sẵn sàng.
  - [x] DTO/HTTP route compatibility cho cart, review và banner trên V2 access context;
    hiện các core trên **chưa được mount** vào runtime HTTP legacy.
    - Cart/review: đã có DTO, controller, route factory và HTTP tests; cart đọc ảnh an toàn,
      chuyển cặp product/size cũ sang variant active, mọi mutation lấy customer ID từ
      V2 auth context. Banner đã có DTO/controller/route, giới hạn 5 MiB trước buffering,
      quyền global trước đọc file, metadata + ảnh atomic, HTTP contract test. Media worker
      chạy riêng sau V2 cutover. DB lỗi chưa rõ commit được reconcile, không xóa ảnh ngay.
    - Cart read V2 mặc định giới hạn 100 item/trang; T39 phải cập nhật Web đọc `pagination`
      trước khi cutover để không bỏ sót giỏ hàng lớn.
  - [x] Audit vận hành và kiểm thử hợp đồng HTTP xuyên suốt trên composition V2 riêng:
    `catalog-commerce-v2.ts`, JWT ký thật + DB-derived access context + MySQL `_test`.
    Audit structured log không ghi body/secret; không phải transactional audit ledger.
    MySQL test kiểm chứng cả rollback và mất commit acknowledgement, customer ownership,
    duplicate review, account khóa và auth/permission fail-closed.
  - [ ] Mount runtime cuối cùng và smoke Web/API sau auth/consumer cutover (T38–T44).
    Phần HTTP/core đã kiểm chứng; T28 chưa tính đóng runtime khi app chính còn legacy.
  - Verification: API typecheck (kể cả strict cho catalog/composition), build và full suite
    với MySQL V2 bật đạt 334 tests; 6 skip thuộc Redis/infra follow-up, không thuộc T28.
    `git diff --check` đạt. Cloudinary thật chưa được gọi; test dùng fake provider.
- [x] T29 — Inventory balance/reservation/movement service V2 (phạm vi inventory primitives theo xác nhận của người dùng ngày 2026-09-24; orchestration/HTTP thuộc T31/T33/T35).
  - [x] Lát cắt balance read: MySQL V2 tính `available = stock - SUM(active holds)`;
    hold đã quá hạn nhưng chưa được worker release vẫn bị trừ. Unit test và MySQL
    `_test` integration test đã kiểm chứng; read model không dùng thay kiểm tra
    dưới inventory row lock khi checkout/điều chuyển.
  - [x] Lát cắt reserve order item nội bộ: service lấy branch/variant/quantity từ
    order/item trong DB, khóa order → item → inventory → reservation, dùng locking
    read tính active holds, unique idempotency key và retry deadlock bounded.
    Test MySQL `_test` kiểm tra replay, key mismatch, order đã hủy và hai checkout
    tranh đơn vị cuối. Repository nhận transaction của checkout; rollback của
    outer transaction đã được kiểm chứng trên MySQL. Chưa nối use-case T33;
    không mount HTTP.
  - [x] Lát cắt manual stock adjustment nội bộ: quyền theo branch/global grant,
    lock inventory và active holds, cập nhật stock + append-only movement cùng
    transaction, idempotency replay/conflict; MySQL `_test` kiểm chứng mở tồn,
    không giảm dưới hold và hai điều chỉnh cạnh tranh. Chưa mount HTTP.
  - [x] Standalone V2 `GET /inventory/:branchId` giữ envelope/grouping legacy,
    trả ID/money dạng string và `stock` (vật lý), `reserved`, `available` theo
    variant; auth lấy grants từ DB, scope branch/global, Zod ID, MySQL HTTP test.
    App chính chưa mount; Web hiện còn dùng `stock` nên phải dùng `available`
    cho quyết định có thể bán ở T39. Danh sách chưa phân trang để giữ contract
    legacy, cần xem lại khi dữ liệu chi nhánh lớn.
  - [x] Confirm order reservation nội bộ chỉ khi order đã `confirmed`:
    lock order → item → inventory → reservation; đặt `confirmed_at`, xóa
    `expires_at`, không trừ stock; từ chối hold đã hết hạn ngay cả khi worker
    chưa release. MySQL test rollback outer transaction, expired hold và
    idempotent replay. T34/T35 vẫn phải xác minh payment/COD policy trong cùng
    transaction trước khi gọi; chưa expose HTTP.
  - [x] Release order hold khi order và fulfillment cùng `cancelled`, payment
    không có attempt pending/processing/completed. Lock order → payment → item
    → inventory → reservation; chỉ đổi hold sang `released`, không cộng stock.
    MySQL test chặn payment chưa rõ, rollback transaction và idempotent replay.
    Expiry worker V2 đã quét hold online quá hạn dưới cùng thứ tự lock và chỉ
    expire khi payment đều `failed`/`cancelled`; payment unresolved giữ hold để
    đối soát. Refund/partial-payment policy vẫn thuộc T34/T35.
  - [x] Consume order hold nội bộ khi fulfillment `shipping`/`fulfilled` và
    hold đã confirm: lock order → item → inventory → reservation; giảm stock,
    chuyển hold `consumed`, ghi movement typed `order_item_id` cùng transaction.
    Test MySQL rollback, replay và không xuất kho trước bàn giao. Caller T33/T35
    vẫn phải xác minh payment/COD và cập nhật fulfillment cùng transaction.
  - [x] Giữ kho nguồn khi duyệt transfer item: kiểm tra receipt/request `approved`,
    đối chiếu chiều branch requester/supplier và variant, khóa request → receipt
    → item → inventory → active holds, không trừ stock khi duyệt. Repository nhận
    outer transaction của T31; MySQL test replay/conflict, rollback và hai phiếu
    tranh đơn vị cuối. Dispatch/receive có primitive riêng bên dưới; chưa mount HTTP.
  - [x] Hardening transaction/timezone: service không retry thao tác con khi
    caller sở hữu transaction; deadlock/lock timeout được ném lại cho checkout/approval
    retry toàn use-case. Repository chỉ retry khi tự mở transaction. Unit tests và
    typecheck đạt. So sánh/ghi `TIMESTAMP` cùng múi giờ session qua
    `CURRENT_TIMESTAMP(3)`; hai test MySQL với session `+07:00`/`-07:00` đã đạt
    trên `_test`, cùng focused reservation/transfer/adjustment (24 tests).
  - [x] Expire worker nội bộ: chỉ chuyển order hold đã hết hạn sang `expired`
    khi order còn pending/unfulfilled và mọi payment đã failed/cancelled;
    khóa order → payment → item → inventory → reservation rồi kiểm tra lại.
    Cursor tránh bị payment chưa rõ ở đầu hàng đợi chặn hold khác; runner
    độc lập có explicit flag, chưa bật trên API legacy. Unit + MySQL `_test`
    kiểm chứng pending/processing/completed, failed, confirmed order, replay.
  - [x] Dispatch nguồn nội bộ: T31 đổi receipt sang `in_transit` trong cùng
    transaction rồi gọi primitive theo transfer item và actor đã xác thực.
    Khóa request → receipt → item → inventory → holds; giảm stock, consume
    hold và append movement typed `transfer_receipt_item_id` một lần. MySQL
    `_test` kiểm chứng replay sau completed, key conflict, rollback và hai
    dispatch đồng thời; chưa nối HTTP.
  - [x] Receipt đích và cancellation release: kiểm tra dispatch nguồn/hold consumed,
    chỉ cộng `received_quantity` bán được, ghi movement typed, replay và rollback
    trong transaction chủ quản. Chênh lệch `lost_quantity`/`non_sellable_quantity`
    vẫn fail-closed; T31 phải yêu cầu người có quyền duyệt điều chuyển khác
    người ghi nhận, rồi lưu note/audit và nối orchestration trong cùng transaction.
    Cancel/reject trước dispatch chỉ nhả hold, không cộng stock.
  - [x] Return restock nội bộ: chỉ cộng `restocked_quantity` của item đã
    inspected/completed và có order handover movement đúng loại/reference;
    hàng không bán được không cộng stock. MySQL `_test` kiểm tra replay,
    cạnh tranh, thiếu nguồn và rollback; T35 nối eligibility/authorization.
  - [x] Ranh giới giao dịch: duplicate movement trong outer transaction phải
    throw để caller rollback toàn bộ; test unit cho dispatch/receipt/restock.
    HTTP compatibility và atomic checkout không thuộc T29, theo xác nhận của
    người dùng: T31 nối transfer, T33 nối checkout, T35 nối return/fulfillment.
- [x] T30 — Stock request service V2.
  - [x] Lát cắt tạo yêu cầu nội bộ: actor lấy từ V2 access context,
    quyền `stock_request.manage.branch` theo branch người yêu cầu; kiểm tra
    branch/variant hợp lệ, không trùng variant, không nhận ID dạng JS Number.
    Ghi request + items + `REQUESTED` history cùng transaction, code từ BIGINT
    ID sau insert, chưa tạo transfer/giữ/chuyển stock. Unit + MySQL `_test` đạt.
  - [x] Query V2 theo branch requester và hàng chờ duyệt: quyền branch/global
    đọc từ access context; phân trang 1–100, mapper giữ tên branch, item
    product/size và history cho Web. Unit + MySQL `_test` đạt.
  - [x] Update/cancel pending chỉ bởi người tạo còn quyền branch, cancel là
    trạng thái có audit (không hard-delete); approve/reject đòi quyền global,
    approve tạo transfer pending liên kết cùng transaction, chống duyệt trùng.
    DTO Zod, route/envelope V2 độc lập và HTTP/MySQL tests đã đạt. Giữ/xuất/nhận
    kho thuộc T31; runtime legacy chưa mount cho tới cutover T40.
- [x] T31 — Transfer receipt service V2; nối reserve/dispatch/receive/release T29 trong transaction chủ quản. Approval chênh lệch phải do người có quyền, khác người ghi nhận, có note/audit.
  - [x] Lát cắt approve: chỉ global `transfer.manage.branch` được duyệt;
    request/transfer đối chiếu chiều branch và tổng variant, khóa theo thứ tự;
    chuyển `approved` + tạo các hold T29 + history trong một transaction.
    Thiếu stock ở bất kỳ item nào rollback toàn bộ, không trừ/cộng kho.
    Unit + MySQL `_test` cho concurrent approve và rollback đã đạt.
  - [x] Lát cắt dispatch: quyền manager branch nguồn hoặc global, `approved`
    sang `in_transit`, consume hold và movement giảm nguồn trong cùng transaction.
    Retry/concurrent không trừ kho lặp; item sau lỗi rollback debit trước.
  - [x] Lát cắt reject/cancel trước dispatch: quyền global mới được từ chối,
    manager branch nguồn hoặc global được hủy; `pending`/`approved` đóng phiếu,
    giải phóng hold T29 và ghi history cùng transaction. Không đổi physical
    stock; phiếu `in_transit` không đi qua đường hủy/từ chối này.
  - [x] Lát cắt receipt không chênh lệch: destination branch/global có quyền
    mới chốt; caller khai báo đủ từng item, primitive T29 ghi movement tăng đích
    cùng trạng thái `completed` và history trong transaction. Sai tổng hoặc
    mất/hỏng fail-closed; item sau lỗi rollback toàn bộ credit trước.
    Review hồi quy: sau `RECEIPT_RECORDED`, đường complete đủ hàng phải từ chối
    trước mọi write, không được ghi đè mất/hỏng để né duyệt hai người. Đã thêm
    guard dưới row lock và unit RED→GREEN; ca MySQL tương ứng đã đạt.
  - [x] Lát cắt ghi nhận chênh lệch: destination branch/global khai báo đủ
    số lượng từng item kèm lý do bắt buộc; lưu `RECEIPT_RECORDED` với actor,
    giữ `in_transit` và không cộng tồn đích. Chỉ ghi một lần dưới row lock.
  - [x] Lát cắt duyệt chênh lệch: chỉ global `transfer.manage.branch` và actor
    khác người ghi nhận được duyệt, note bắt buộc. Trong cùng transaction, lưu
    `DISCREPANCY_APPROVED`, tăng tồn đích đúng phần sellable qua primitive T29,
    chuyển `completed` và ghi history; hàng nhận bằng 0 không tạo movement 0.
    Concurrent approve chỉ một lần thành công; lỗi credit rollback toàn bộ bước
    duyệt nhưng vẫn giữ bản ghi chênh lệch để xử lý tiếp.
  - [x] Query list/detail: lọc source/destination branch ngay trong SQL trước
    khi phân trang theo grant `transfer.read.branch` DB-derived; global grant
    xem tất cả. Trả BIGINT ID dạng string, nested item/variant/product/size,
    lịch sử actor và thời gian. Detail ngoài scope ẩn như not found. Unit và
    MySQL `_test` đã đạt.
  - [x] Route/DTO V2 độc lập giữ `/transfer-receipts*`, envelope `EM/EC/DT`,
    phân trang list và action approve/reject/cancel. Bổ sung `dispatch`,
    `record-discrepancy`, `approve-discrepancy`; `complete` bắt buộc body đủ
    item/quantity, không suy đoán từ endpoint legacy không body. Zod strict,
    BIGINT string và audit HTTP; fake-service HTTP test đạt. Chưa mount runtime.
  - [x] Chạy lại HTTP/MySQL integration và full regression trước khi đóng T31.
    Docker Desktop/MySQL `_test` đã chạy lại được: 31/31 test tập trung đạt;
    toàn bộ API suite 472 pass, 6 skip. Typecheck/build và fake-service HTTP
    test đã đạt ở checkpoint code trước đó. Runtime legacy chưa mount V2.
- [x] T32 — Voucher claim/release service V2.
  - [x] Tính discount VND bằng BigInt, round đến đồng, cap theo subtotal/max;
    không dùng JS Number cho DECIMAL. Checkout T33 sẽ phân bổ theo từng dòng.
  - [x] Claim trong outer transaction: khóa order → voucher → redemption, kiểm tra
    hiệu lực, channel/branch, min subtotal, customer identity, discount snapshot
    và quota reserved + redeemed. Selected branch rỗng fail-closed; retry cùng
    order không tạo redemption thứ hai. MySQL current read ngăn snapshot cũ
    cho phép hai checkout giữ suất cuối.
  - [x] Redeem khi order confirmed; release khi hủy trước bàn giao, idempotent
    dưới cùng thứ tự lock. Released row được giữ để audit, không hoàn quota sau
    bán/return. Unit 4/4 và MySQL integration 12/12 đạt; API typecheck/build,
    full suite 488 pass, 6 skip. Chưa mount runtime; T33 nối các primitive này
    vào checkout/cancel/confirm transaction chủ quản.
- [ ] T33 — Order checkout/read/status + transactional outbox V2; nối inventory reservation/consume T29 atomically.
  - [x] Lát cắt đọc order: customer chỉ xem order của chính mình; nhân viên
    chỉ xem branch được grant; global internal grant mới xem tất cả. Filter
    SQL trước pagination/detail, BIGINT ID và DECIMAL string, order item snapshot.
    Unit 3/3, MySQL `_test` 1/1; API typecheck/build và full suite 491 pass,
    6 skip. Đã có HTTP read adapter V2 riêng cho `/order/read`,
    `/order/read/:userId`, `/order/branch/:branchId`, `/order/:orderId`:
    DTO BIGINT/pagination,
    envelope legacy, scope DB-derived, MySQL HTTP test và full suite 527 pass,
    6 skip. Chưa mount runtime; payment/shipment display cần T34/T35 và
    Web contract mapping thuộc T39/T40. Adapter read lấy thêm product ID và
    ảnh từ `order_items` snapshot, không phụ thuộc catalog hiện tại. Detail
    không lộ đơn ngoài scope (404) và dùng cùng DB-derived access context.
  - [x] Lát cắt tính tiền checkout: phân bổ voucher theo tỷ trọng dòng hàng
    bằng BigInt/largest remainder, tie-break theo thứ tự dòng chuẩn hóa;
    giá catalog DECIMAL được làm tròn đến đồng trước khi chụp unit price;
    discount đầu vào phải nguyên VND, không vượt DECIMAL(19,4). Unit 7/7.
    API typecheck/build và full suite MySQL `_test` 499 pass, 6 skip.
    Chưa tạo order/hold và chưa mount runtime.
  - [ ] Checkout idempotent, giá/discount snapshot, phân bổ discount từng item;
    claim voucher T32 + reserve inventory T29 trong một outer transaction.
    Policy đã chốt: online pending hold 15 phút; POS giữ đến cuối giao dịch.
    Lát cắt online store pickup nội bộ đã tạo order/item/history snapshot,
    claim voucher, reserve từng item và ghi `commerce.order.created` vào V2
    transactional outbox trong cùng transaction. Checkout key và voucher code
    được canonicalize theo collation MySQL; retry cùng intent replay, payload
    khác bị từ chối. Unit 3/3 và MySQL `_test` 4/4 kiểm tra rollback voucher/
    tồn kho cùng tranh đơn vị cuối. Checkout cũng trừ đúng số lượng đã mua
    khỏi cart (nếu có) trong cùng transaction; dòng khác, lượng vừa thêm và
    retry không bị xóa nhầm. MySQL `_test` kiểm tra partial/full consume,
    rollback và checkout cạnh tranh với cart add. Full suite 523 pass, 6 skip;
    cùng-key checkout cạnh tranh cũng chỉ tạo một order/hold/outbox và trừ cart
    một lần (MySQL test chạy lặp 5 lần). Full suite 528 pass, 6 skip;
    chưa mount HTTP; delivery/POS còn lại. MySQL test tái hiện deadlock do
    cart remove khóa item trước cart khi checkout đang giữ cart; đã đổi remove
    thành transaction khóa cart trước rồi xóa item, focused test 5/5 và full
    API suite 530 pass, 6 skip; typecheck/build đạt. Ca MySQL nhiều món xác
    minh rollback hold/order khi món sau hết hàng (10/10 focused tests);
    full API suite sau lát T34 đạt 533 pass, 6 skip.
    HTTP factory V2 riêng hiện giữ `POST /order/create`: V2 JWT/DB-derived customer context,
    DTO strict chỉ nhận checkout key/branch/contact snapshot/voucher/variant/quantity; mọi
    `price`, total, payment hay customer ID từ browser bị reject trước use-case. Nó trả envelope
    cũ `EM/EC/DT.orderId`, audit không log body/PII/payment và được compose trong `order-v2.ts`
    riêng, tuyệt đối chưa mount legacy. Mock HTTP 3/3 và request HTTP qua MySQL transaction thật
    đạt; delivery checkout vẫn chưa mở.
    POS cash carry-out nội bộ đã có transaction riêng: chỉ employee active ở đúng
    branch có `order.manage.branch` (hoặc global hợp lệ), không nhận price/amount
    từ browser, dùng payment method server-side `CASH` và thu đủ tổng snapshot.
    Nó ghi `pending → confirmed → completed/fulfilled`, reserve→confirm→consume
    stock cùng payment/history/outbox trong một commit nên không để pending hold
    POS sau giao dịch. Khách vãng lai giữ `customer_id = NULL`; tổng 0 không tạo
    payment vì schema cấm amount 0. Retry cùng intent replay, key/payload khác
    conflict; stock failure, cạnh tranh cùng key và employee bị deactivate đều
    được MySQL `_test` kiểm tra (unit 2/2, MySQL 4/4). QR/split tender, phần cứng
    POS chưa được mở. HTTP factory V2 riêng đã giữ `POST /order/in-store`, auth
    DB-derived, DTO strict chỉ có checkout key/branch/variant/quantity và audit
    không log body/payment; `price`, `totalPrice`, method/status payment hay field
    lạ bị reject trước use-case. Nó đã được compose trong `order-v2.ts` riêng,
    tuyệt đối chưa mount runtime legacy. Mock HTTP 3/3 và request HTTP qua MySQL
    transaction thật đạt. QR/split tender và phần cứng POS vẫn chưa có.
  - [ ] Confirm/cancel/fulfill: trạng thái và history, redeem/release voucher,
    confirm/release/consume inventory hold và movement trong cùng transaction.
    Lát confirm online pickup nội bộ đã yêu cầu completed payments đủ total
    hoặc đơn 0 đồng, từ chối refund chưa đóng, rồi đổi status, redeem voucher,
    confirm toàn bộ hold, ghi history/outbox atomically. Test MySQL kiểm tra
    chưa thu tiền, hold hết hạn rollback và retry không ghi lặp. Unit 2/2,
    MySQL checkout/confirm 4/4, API typecheck/build và full suite 508 pass,
    6 skip. Lát hủy nội bộ chỉ xử lý pickup pending chưa thu tiền và mọi
    payment attempt đã failed/cancelled: nhả voucher/hold, ghi history/outbox
    cùng transaction; processing/completed bị chặn. Unit 2/2, MySQL 2/2,
    API typecheck/build và full suite 512 pass, 6 skip. Replay chỉ cho
    store_pickup; CUSTOMER branch grant không thể vượt quyền nội bộ.
    MySQL kiểm tra thêm manual cancellation sau khi expiry worker đã chuyển
    hold sang `expired`: voucher release, order cancelled, stock và movement
    không bị cộng/trừ lần hai. Full suite 529 pass, 6 skip, typecheck/build đạt.
    HTTP lifecycle V2 có `POST /order/:orderId/confirm` và `/cancel` riêng,
    auth branch/global DB-derived, confirm body rỗng strict và cancel chỉ nhận
    reason 1–500 ký tự; browser không gửi status để nhảy state. Envelope legacy,
    audit không ghi reason/body, map 403/400/409/503; mock 3/3 và MySQL transaction
    thật kiểm tra confirm paid pickup/cancel unpaid pickup đạt. Validator BIGINT
    V2 được harden `regex → pipe → BigInt` trên các DTO đang dùng để ID text luôn
    trả 400, không ném 500. Chưa mount runtime legacy; handover vẫn chờ policy
    xác thực người nhận.
    Online hold hết hạn sau 15 phút đã được expiry worker chuyển sang `expired`;
    đây chỉ là nhả hàng, không tự động hủy order. Chính sách auto-cancel order,
    COD/delivery, cancel sau thu tiền và handover còn chờ các lát T33/T34/T35.
  - [x] Publisher V2 opt-in: MySQL `FOR UPDATE SKIP LOCKED` claim và lease
    fenced bằng attempts; allowlist `catalog.product.*` + ba event order,
    không nuốt job media cleanup. RabbitMQ confirm + mandatory-return + timeout;
    sai JSON shape được quarantine, failure retry sau lease 60 giây, tối đa
    20 attempts. Unit fake broker và MySQL `_test` kiểm tra ACK/NACK,
    unroutable, claim cạnh tranh, stale worker, pre-commit visibility.
    API typecheck/build và full suite MySQL `_test` 522 pass, 6 skip.
    Worker legacy không đổi; chưa kiểm thử giao RabbitMQ thật hoặc bật worker
    V2 mặc định trước cutover.
  - [ ] HTTP compatibility (mount/cutover), checkout delivery, POS QR-split tender, handover, MySQL concurrency/
    error-path và full regression trước khi đóng T33.
- [ ] T34 — Payment method/payment/webhook V2. Theo điều chỉnh thứ tự được
  người dùng duyệt ngày 2026-09-25, làm foundation payment trước khi đóng T33;
  không tự mở refund policy chưa chốt hoặc mount runtime legacy.
  - [x] Lát đọc `GET /payment-methods` V2: active-only, BIGINT ID string,
    envelope legacy và auth DB-derived; HTTP + MySQL `_test` kiểm tra inactive
    method bị ẩn, không token/account bị khóa trả 401. Focused 2/2,
    typecheck/build và full API suite 533 pass, 6 skip. Chưa mount runtime.
  - [ ] Tạo payment attempt/VNPay request an toàn với amount từ order và
    merchant reference ổn định; xử lý callback đã xác minh, idempotent và
    không đảo completed về failed. Integration/concurrency trên MySQL `_test`.
    Primitive reserve attempt VNPay nội bộ đã có: order/method/payment locks,
    DECIMAL BigInt, request key ổn định, owner từ V2 context, active hold
    còn hạn và method active cho attempt mới. Retry cùng key được replay cả
    khi method đã tắt; không tạo thêm attempt khi số tiền còn lại đã được
    giữ/thu. MySQL test 6/6 gồm cạnh tranh khi tắt method (RED→GREEN).
  - [x] Gateway/request primitive VNPay không gọi mạng: URL nhận amount và
    `created_at` đã persist của payment attempt, đổi tiền nguyên VND sang
    `vnp_Amount` x100 bằng BigInt; `vnp_TxnRef = V2<paymentId>` ngắn, chỉ
    chữ-số và ổn định qua retry. HMAC-SHA512 canonical-sort, timezone GMT+7,
    expiry 15 phút, IP/locale/bank code và callback signature/amount/reference
    đều fail-closed. Unit 5/5, MySQL attempt 6/6, API typecheck/build và full
    API suite 547 pass, 6 skip đạt.
  - [x] Callback persistence VNPay: application service luôn gọi gateway verify
    trước repository. Repository khóa `order → payment`, đối chiếu provider,
    `V2<paymentId>`, currency VND và amount DB; success/failure và
    `payment_events` được ghi cùng transaction. Event key replay idempotent,
    provider transaction không được đổi/trùng payment khác, completed không
    thể bị hạ bởi callback trễ. Unit 2/2 và MySQL 10/10 gồm concurrent duplicate
    callback đạt; typecheck/build và full API suite 553 pass, 6 skip đạt.
  - [x] HTTP factory VNPay V2 (chưa mount runtime): `POST /create-payment-url`
    yêu cầu V2 auth, DTO strict và chỉ lấy IP từ server; browser return chỉ xác
    minh/chuyển trạng thái trình bày, không ghi database; IPN `GET /vnpay/ipn`
    là đường duy nhất gọi callback persistence và phản hồi `RspCode` theo
    protocol VNPay. Focused HTTP 5/5, API typecheck/build và full suite 558
    pass, 6 skip đạt. Reconciliation, cấu hình IPN SSL khi cutover và runtime
    mount vẫn là việc còn lại của T34.
- [ ] T35 — Shipment compatibility và return/refund persistence boundary; nối return restock T29 với kiểm tra eligibility/authorization.
  Làm foundation shipment cần cho T33 trước, giữ những policy return/refund còn
  mở ở trạng thái fail-closed; quay lại T33 khi dependency đã có test MySQL.
  - [x] Shipment read model trên order V2: batch query theo trang, BIGINT/DECIMAL
    string và shipment `null` cho pickup/POS. Chỉ serialize provider/status/tracking,
    COD và timestamp; không lộ provider request key, provider order ID, recipient
    snapshot hoặc carrier fee. Scope tiếp tục lấy từ order/access context V2.
    MySQL delivery fixture và HTTP contract test đạt; API typecheck/build và full
    suite 542 pass, 6 skip. Chưa tạo shipment checkout, carrier booking/callback/
    state transition hoặc mount runtime.
  - [x] Primitive tạo shipment delivery `pending`: lock order, chỉ nhận delivery
    order `pending/unfulfilled`, snapshot recipient/location/COD từ trusted
    orchestration, COD nguyên VND không vượt total. Idempotency theo provider
    request key replay đúng payload và chặn key/payload khác; repository nhận
    outer transaction để checkout rollback nguyên tử. MySQL 3/3 kiểm tra create/
    replay, pickup/conflict và rollback; API typecheck/build và full suite 542
    pass, 6 skip. Chưa được checkout gọi hoặc mount HTTP.
- [ ] T36 — Conversation/message state và Socket contract V2.
  - [x] T36.1 — Nền conversation customer V2: authenticated customer chỉ mở/đọc
    conversation active của chính mình. Transaction khóa customer để bảo đảm tối
    đa một conversation chưa đóng; khởi tạo `open/bot` chỉ là persistence baseline,
    tuyệt đối không gọi AI hay tạo `assistant_runs`. Unit + MySQL `_test`; chưa
    mount runtime legacy. Unit 3/3 và MySQL 2/2 kiểm tra 5 open đồng thời chỉ
    tạo một conversation + một `created` event, không tạo AI run; account inactive
    fail-closed. API typecheck/build đạt.
  - [x] T36.2 — Common message/history use case V2: ownership customer, khóa
    conversation, `seq` tăng đơn điệu, `dedup_key` + SHA-256 request hash,
    pagination cursor bounded. Retry cùng payload replay; cùng key khác payload
    conflict; persist trước mọi publish. Unit 4/4 và MySQL 2/2: 8 writer
    đồng thời có seq 1..8, retry 5 request cùng key chỉ ghi một row, key đổi
    payload conflict, history `beforeSeq` chronological/bounded và customer B
    không thấy/gửi được hội thoại A. Chưa gọi Socket/AI hay publish outbox.
  - [x] T36.3 — HTTP factory V2 riêng: DTO Zod strict, V2 JWT/access context,
    envelope legacy và audit không body/PII. Factory chỉ dùng test/composition V2,
    không import hoặc mount vào runtime legacy trước cutover. Giữ `POST /conversation/create`,
    `POST /message/send/:conversationId`, `GET /message/get/:conversationId`; mock HTTP
    4/4 và request qua router với transaction MySQL thật đạt. `senderType`, actor,
    role hay field lạ bị Zod strict chặn trước use case; search import xác nhận legacy
    `routes/api.ts`/Socket không mount factory.
  - [ ] T36.4 — Socket bridge và staff handoff sau khi writer/scope/policy đủ:
    mỗi command re-authorize, không lấy room membership làm quyền, persist trước
    emit. Không sửa legacy socket như một hotfix; assistant worker thuộc T37.
    - [x] T36.4a — Customer request-human control primitive: chỉ customer active
      sở hữu conversation mới được chuyển `open/bot|paused` thành
      `waiting_staff/paused` và clear assignee. Command key + SHA-256 request hash
      chống replay sai payload; `expectedVersion` được kiểm tra dưới lock để chỉ một
      command mới thắng. Event lưu trạng thái/assignee/branch nguồn trước release.
      Unit 3/3 và MySQL `_test` 4/4 kiểm tra replay, payload conflict, race version,
      ownership và audit paused-assignee. Không có staff claim/routing, notification,
      Socket, AI run hay runtime mount. API typecheck/build và full suite V2 đạt
      599 pass, 6 skip (2 infrastructure test skip theo cấu hình) tại checkpoint này.
    - [ ] T36.4b — Staff claim/assign/routing và Socket chỉ triển khai sau khi
      permission matrix granular cùng central/branch scope được chốt. Không được
      dùng `SUPER_ADMIN` hoặc membership room legacy thay cho permission/resource
      authorization DB-derived.
- [ ] T37 — Notification/behavior/chat proxy identity V2.
  - [x] T37.1 — Notification own-read primitive: account active chỉ đọc/count/mark-read
    notification có `recipient_account_id` của chính account từ V2 context. Pagination
    cursor `createdAt` + BIGINT id bounded; response allowlist và không expose raw
    notification `data`. Không tạo/dispatch notification, không Socket/email/push,
    không behavior/chat proxy hay runtime mount ở lát này. Có 3 unit tests và 2 MySQL
    `_test` integration tests cho input cursor bounded, ownership A/B, read idempotent,
    inactive account fail-closed và không return JSON `data`.
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
