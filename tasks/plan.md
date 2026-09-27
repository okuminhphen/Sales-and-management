# Implementation Plan: Database V2 compatibility-first cutover

## Tổng quan

Thay schema legacy bằng Database V2 gồm 49 bảng và refactor backend theo module để mọi persistence
contract khớp V2. Xây/test V2 trên database `_test` trước, sau đó reset database local mới và xóa
toàn bộ migration/model legacy. Giữ tối đa REST/Socket contract hiện hữu; Web và AI chỉ đổi phần
bắt buộc để tiếp tục chạy.

## Quyết định kiến trúc

- Một schema/write path cuối cùng; không dual-write sau cutover.
- Baseline versioned + checksum/drift guard; future changes dùng forward migration mới.
- Model thuộc feature module; composition root chỉ đăng ký model/association.
- BIGINT ID qua API là string; DECIMAL không tính bằng JS Number.
- Integration/concurrency dùng MySQL `_test` thật; skipped không tính là đạt checkpoint.
- Reset chỉ áp dụng database local chính xác `sale_and_managements_db` sau full rehearsal.

## Dependency graph

```text
schema -> typed persistence -> identity/catalog -> inventory -> commerce/payment
       -> communication/personalization -> web/AI consumers -> cutover/cleanup
```

## T36 — lát cắt triển khai hội thoại/message V2

T36 giữ hoàn toàn độc lập với REST và Socket legacy cho đến T40 cutover. Mục tiêu
là tạo một write-path V2 duy nhất; Socket chỉ là adapter gọi cùng use case, không
được tự ghi `messages` hoặc dùng membership của Socket room làm quyền truy cập.

1. **T36.1 — nền conversation customer**: repository/application V2 cho customer
   đã xác thực mở hoặc đọc conversation đang hoạt động của chính mình. Khóa theo
   customer trong transaction để chỉ có một active conversation; trạng thái khởi
   tạo `open/bot` chỉ là persistence baseline, không gọi AI hoặc tạo assistant run.
2. **T36.2 — message/history chung**: customer ownership, transaction khóa
   conversation, sequence tăng đơn điệu, `dedup_key` + SHA-256 request hash,
   cursor phân trang có giới hạn. Một payload đổi nội dung nhưng dùng lại key phải
   fail-closed. Ghi message xong mới trả event nội bộ; chưa publish Socket/AI.
3. **T36.3 — HTTP V2 không mount**: DTO Zod strict, V2 JWT + DB access context,
   legacy envelope tương thích và audit không chứa body/PII. Factory V2 giữ ba
   path compatibility `POST /conversation/create`, `POST /message/send/:conversationId`
   và `GET /message/get/:conversationId`; không dùng `GET` để tạo state, không
   nhận userId/sender/role từ browser. Chỉ compose router riêng cho test; runtime
   legacy chưa import/mount nó.
4. **T36.4a — customer yêu cầu nhân viên (persistence control)**: customer đã
   được xác thực chỉ chuyển conversation của chính mình từ `open/bot|paused`
   sang `waiting_staff/paused`; command key + request hash và `expectedVersion`
   được kiểm tra dưới row lock. Cùng command/payload replay; command đổi payload
   conflict; command stale conflict. Event phải giữ đủ assignee/branch nguồn trước
   khi release. Lát này không chọn staff, không notify, không tạo AI run và không
   emit Socket; factory runtime tiếp tục unmounted.
5. **T36.4b — staff handoff và Socket bridge**: chỉ thực hiện khi permission
   matrix `read/reply/claim/assign/change_mode/close`, scope central/branch và
   routing được duyệt/test. Socket phải re-authorize mỗi command, persist trước
   emit, không tin room membership. Không sửa Socket legacy như hotfix; AI
   worker/assistant run thuộc T37.

Mỗi lát theo RED → GREEN → refactor, có unit và MySQL `_test` thật. Nếu một policy
vận hành (handoff, retention, AI availability) chưa được phê duyệt, V2 giữ factory
unmounted/fail-closed thay vì tự suy đoán hành vi runtime.

## T37.1 — notification recipient primitives V2

Lát đầu T37 chỉ thay ranh giới dữ liệu cho notification sẵn có: account active đọc
phân trang notification mà `recipient_account_id` đúng account đó, đếm unread và
đánh dấu đã đọc idempotent. `userId`/role/recipient từ client không được nhận hoặc
tin cậy; cả query lẫn mutation đều recheck account active trong MySQL. Cursor dùng
`createdAt` + BIGINT `id` để thứ tự newest-first ổn định và response chỉ trả
allowlist display (`id`, type, title, content, readAt, createdAt), không trả raw
`data` JSON khi schema payload chưa được định nghĩa.

Lát này không tạo notification, không phát Socket/email/push, không sửa behavior,
không thay route legacy và không mount runtime. Trigger từ handoff/order/inventory,
retention, payload typed, dispatch/outbox và realtime thuộc lát riêng sau khi policy
được chốt. Kiểm thử cần gồm ownership A/B, cursor bounded, unread/read idempotency
và account bị inactive fail-closed.

## T37.2 — notification HTTP factory V2 không mount

Nối riêng ba compatibility path đã tồn tại (`GET /notifications/my`, `GET
/notifications/count`, `PATCH /notifications/:notificationId/read`) vào T37.1 mà
không import vào `routes/api.ts`. Mỗi request lấy account active từ V2 JWT/context;
không nhận `userId`, recipient, role hay payload notification từ browser. DTO Zod
strict kiểm tra cursor keyset, limit, BIGINT path ID và body rỗng; response giữ envelope
`EM/EC/DT` nhưng chỉ serialize allowlist notification. Chỉ mutation audit action, không
log content/body/PII. Test HTTP phải chạy với persistence MySQL `_test`, chứng minh
route chưa mount legacy, strict input, allowlist và ownership/read-state thật.

## T38.1 — web identity contract boundary

Lát đầu T38 chỉ bổ sung type và parser thuần cho response identity V2 ở Web. Mọi BIGINT
`accountId`/`customerId`/`employeeId`/`branchId` phải là decimal string hợp lệ trong
signed MySQL `BIGINT`; không nhận JavaScript `number` để tránh mất chính xác. Parser kiểm tra alias
compatibility (`userId = customerId`, `adminId = accountId`), nullable profile link và role grant
scope; customer chỉ nhận role `CUSTOMER`, backoffice reject role đó. Đây là boundary cho dữ liệu API không tin cậy, không
phải type-cast trực tiếp từ Axios.

Lát này không thay `EntityId` legacy, không ghi session, không đổi Redux/UI, không gọi hoặc mount
router V2. Việc nối login/profile sau cutover chỉ được làm khi response service, session storage và
route V2 có contract integration tương ứng; do đó runtime hiện tại không thay đổi.

## T38.2 — web own-customer profile response boundary

Route compatibility V2 `GET /user/:id`/`PUT /user/update/:userId` trả `userId` (customer ID)
và field transport `fullname`. Web map response này thành aggregate `V2CustomerProfile` dùng
`customerId` và `fullName`, chỉ sau khi kiểm tra account/customer ID string, email và từng field
nullable (`username`, `fullname`, `phone`). Đây chỉ là response mapper; ownership vẫn do access
context MySQL ở API thực thi. Không nhận patch từ UI, không nối Axios/Redux và không mount runtime.

## T38.3 — thống nhất signed BIGINT ở identity-access HTTP boundary

DDL baseline V2 khai báo tất cả entity ID là MySQL `BIGINT` có dấu, do đó giá trị public hợp lệ là
`1..9223372036854775807`, không phải range `UNSIGNED`. DTO identity, branch và employee dùng chung
`v2EntityId` để không còn copy regex/range khác nhau; Web parser dùng cùng policy. Regression test
kiểm tra cả cực đại hợp lệ và giá trị overflow. Không thay migration/schema hay API path, chỉ chặn
input vốn không thể lưu trong cột thật.

## T39.1 — web scalar và public catalog response boundary

Web có scalar V2 dùng chung cho signed BIGINT ID và canonical `DECIMAL(19,4)` money, tách khỏi
identity để catalog/cart/order/admin không phụ thuộc chéo module. Public product parser allowlist
đúng output catalog V2: `id`, `categoryId`, `name`, `slug`, `description`, `basePrice` và image
HTTP(S). Nó fail-closed với JSON number, money không canonical, ID ngoài range và media unsafe.
Lát này chưa đổi `ProductDto` legacy, Axios service hoặc UI; catalog V2 cũng chưa mount runtime.

## T39.2 — web own-cart read response boundary

Web bổ sung contract thuần cho toàn bộ response thành công `GET /cart/read/:userId` V2. Contract
allowlist từng item (`id`, `productId`, `productVariantId`, `name`, `price`, `images`, `size`,
`quantity`, `catalogActive`) và metadata phân trang. ID phải là signed BIGINT string, `price` là
`DECIMAL(19,4)` canonical, ảnh chỉ HTTP(S), quantity là integer dương trong giới hạn MySQL và
`totalPages` phải nhất quán với `totalItems`/`limit`. Payload sai trả `null` trước khi có thể vào
state/render.

T39.2 chỉ tái sử dụng validator ảnh public của catalog và thêm type/parser/test Web; không thay
`CartItem`/localStorage legacy, không gửi request bằng Axios, không ghi Redux và không mount router
V2. Các route V2 hiện có URL compatibility trùng legacy, nên wiring runtime chỉ được làm ở lát
cutover có integration contract rõ ràng.

## T39.3 — web order read response boundary

Web bổ sung model/parser thuần cho cả list và detail order V2. Contract allowlist order, immutable
item snapshot và shipment tracking; ID dùng signed BIGINT string, mọi amount dùng `DECIMAL(19,4)`
canonical, enum channel/fulfillment/status bị giới hạn đúng schema và timestamp phải là ISO-UTC
canonical. Snapshot ảnh chỉ nhận HTTP(S) hoặc path nội bộ tuyệt đối an toàn và chuẩn hóa về `{ url }`;
raw JSON/PII không được đi qua type kết quả.

Parser xác minh item có `orderId` đúng aggregate, công thức từng line và tổng order, COD không vượt
total, ràng buộc channel/fulfillment/shipping/shipment theo schema và pagination chung bounded.
Payload sai fail-closed. T39.3 chưa thay `OrderDto`/Axios/Redux/UI legacy, không tạo checkout/payment
request và không mount router order V2; chỉ nối runtime sau cutover integration contract.

## T39.4 — web branch directory response boundary

Web bổ sung type/parser read-only cho Branch V2 list/detail, tách `BranchDto` legacy. Contract giữ
ID signed BIGINT string, code branch, contact nullable, type `central|branch`, manager nullable và
pagination bounded; email/field length/code đều được kiểm tra trước state/render. Lát này chưa gửi
mutation branch, gọi Axios/Redux/UI hay mount V2 router. Employee write/link/transfer là boundary
nhạy cảm tách riêng sau directory branch.

## T39.5 — web employee directory response boundary

Web bổ sung type/parser read-only cho Employee V2 directory theo branch. Contract allowlist employee
profile, giữ account/employee/branch ID signed BIGINT và salary `DECIMAL(19,4)` canonical, kiểm tra
code, contact nullable, active/inactive, timestamp UTC và pagination. Đây chỉ là dữ liệu response;
không suy diễn quyền từ employee record. Create/update/deactivate, link account và transfer có audit/
authorization riêng nên không được gọi hay wire UI trong lát này.

## Hoàn tất T39 — Web V2 consumer contracts

T39.1–T39.5 đã phủ các response read-only đã được duyệt: public catalog, own-cart, order,
branch directory và employee directory. Mỗi boundary allowlist dữ liệu, giữ signed BIGINT và
`DECIMAL(19,4)` dưới dạng string, đồng thời fail-closed trước envelope hoặc payload không hợp lệ.
Chúng là parser/type thuần, không có Axios, Redux, localStorage, UI hay runtime router dependency.

T39 không phải cutover. Mutation, payment/checkout, branch/employee administration và mọi runtime
wiring tiếp tục thuộc lát có authorization/integration contract tương ứng. Việc mount hoặc thay thế
legacy chỉ được xét trong rehearsal/cutover T42–T44 sau khi API, Web và AI cùng xác minh trên DB V2.

## T40.1 — AI catalog repository V2

Adapter MySQL của AI đọc `products`, `categories` và `product_variants` V2 thay vì bảng PascalCase
legacy. Một product chỉ đi vào RAG/Qdrant khi product `active` và tồn tại ít nhất một variant `active`;
truy vấn dùng `EXISTS` để không nhân bản product theo variant và giữ thứ tự ID xác định. JSON images
được allowlist thành URL HTTP(S), bỏ `publicId`, URL nội bộ hoặc dữ liệu không đúng shape trước khi vào
prompt/API response.

Thêm `find_product_by_id` vào catalog port để catalog-event consumer rehydrate đúng một aggregate thay
vì tải toàn bộ catalog rồi lọc trong bộ nhớ. T40 chưa chuyển `get_user_signals`: `UserBehavior`, cart
và order legacy thuộc T41 personalization; không thay RAG, embeddings, TF-IDF hay model trong lát này.
Unit test kiểm tra query/mapping và integration test opt-in chỉ ghi vào database `_test`, rồi cleanup
toàn bộ fixture theo token.

## T41.1 — AI personalization query V2

Personalization giữ input account ID hiện có, nhưng query V2 map `accounts.id` sang customer `active`
qua `customers.account_id`. Tín hiệu đọc từ `customer_product_stats` (view + like), cart hiện tại
(`carts`/`cart_items`/`product_variants`) và order `confirmed|completed` (`orders`/`order_items`).
Tất cả query parameterized; account/customer inactive không lộ tín hiệu và dẫn tới fallback catalog
generic vốn có của ranker.

`behavior_events` là immutable event log, còn `customer_product_stats` là projection read model; không
cộng cả hai trong một query vì sẽ double-count cùng hành vi. Lát này chỉ thay read adapter, không tạo
writer/mount HTTP behavior V2, không đổi trọng số, RAG, embeddings, TF-IDF hoặc model. Integration test
chỉ dùng `_test` và cleanup account/customer/catalog/stat fixture theo token.

## T42 — Full rehearsal trên database V2 test

Rehearsal trước cutover chỉ dùng `sale_and_managements_db_test`. Schema revision 4 đã parse/export
PASS (49 bảng, 104 quan hệ); runner V2 xác nhận sáu migration đã thực thi và không còn pending. API
strict typecheck/build, Web typecheck/build và 16 file/63 Web contract tests đều PASS. API full suite
chạy tuần tự với database test thật và tự teardown, tránh ghi chồng fixture. AI chạy 12 test, bao gồm
integration MySQL V2 opt-in, rồi cleanup fixture; `ruff` và `mypy --strict` PASS. Compose infrastructure
config và `git diff --check` đều PASS.

Trên Windows/Node cục bộ này, entry `tsx` cho V2 migration runner gặp lỗi môi trường `os.userInfo()`
`ENOMEM`; status rehearsal dùng artifact đã build `node dist/database/v2/migrate.js status`. Đây không
phải lỗi schema và không được dùng để nới target guard. Qdrant local dùng API key trên HTTP loopback
có warning từ client; production bắt buộc endpoint `https://` theo `.env.production.example`.

## T43 — Guarded local cutover

Cutover local đã dùng entrypoint tách biệt `db:v2:cutover:local`, không hạ guard của runner thường.
Nó yêu cầu đồng thời development, `MYSQL_DATABASE` và V2 target đúng literal
`sale_and_managements_db`, V2 enabled, schema manifest/checksum hợp lệ và xác nhận one-shot
`RESET sale_and_managements_db`; credential super-admin được validate trước thao tác drop. Database
local đã được reset, tạo lại, chạy sáu migration và seed. Xác minh chỉ-đọc cho thấy 50 bảng vật lý
(49 nghiệp vụ cộng metadata), 104 FK, zero pending; seed gồm 6 role, 37 permission, 3 payment method
và một SUPER_ADMIN grant. Seed lần hai không thay đổi các count.

## Task list

Task chi tiết và trạng thái nằm trong `tasks/todo.md`. Thứ tự task là dependency order; mỗi task
có acceptance/verify và không được bắt đầu khi checkpoint trước chưa đạt.

Điều chỉnh được duyệt ngày 2026-09-25: T33 được tạm mở sau khi kiểm chứng các
error path độc lập. Làm payment foundation T34 và shipment foundation T35 trước
những phần T33 cần chúng (delivery/POS, handover, HTTP write), sau đó quay lại
hoàn tất T33. Không đổi phạm vi cutover hay bật runtime V2 sớm.

## Rủi ro và biện pháp

| Rủi ro | Mức | Biện pháp |
| --- | --- | --- |
| Schema lớn tạo dở | Cao | Rehearsal DB riêng, checksum, fail closed, không auto reset |
| Identity cutover sai quyền | Cao | Ownership/scoped-role integration tests |
| Sai tiền hoặc âm tồn kho | Cao | DECIMAL helper, locks, idempotency, concurrency tests |
| Web/AI vỡ contract | Cao | Contract-first types và consumer tests trước cutover |
| Xóa legacy quá sớm | Cao | Chỉ xóa sau smoke gate trên V2 |

## Ngoài phạm vi

- Backfill hoặc reset production/staging.
- Endpoint/UI mới cho return/refund/chat operations chưa có spec riêng.
- Redesign UI hoặc thay thuật toán RAG/model AI.
- MongoDB, split order/shipment, voucher stacking, VAT/e-invoice.

## Open questions không chặn compatibility-first

Retention chat/behavior/PII, thời hạn return/refund và hold/no-show cần spec riêng trước khi mở
feature mới. Baseline giữ cấu trúc V2 đã duyệt nhưng existing API không tự bật nghiệp vụ chưa có.
