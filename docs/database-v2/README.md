# Database V2

Thư mục này là **nguồn sự thật được Git quản lý** cho hợp đồng schema Database V2 của
HappyShop. Artifact hiện tại là revision 4, gồm đúng **49 bảng nghiệp vụ** và **104 quan hệ**.
Bảng metadata do migration runner tạo ra không thuộc 49 bảng nghiệp vụ này.

## Phạm vi và trạng thái

- [`target-schema.dbml`](./target-schema.dbml) mô tả schema đích đã được duyệt.
- [`migration-manifest.json`](./migration-manifest.json) khóa SHA-256 của từng migration V2
  theo nội dung nguồn TypeScript đã chuẩn hóa xuống dòng LF.
- DBML là hợp đồng thiết kế, **không phải SQL để chạy trực tiếp**.
- Baseline migration thực thi và kiểm chứng MySQL 8.4 được triển khai từng phần ở các task T04–T11.
- Cutover chỉ áp dụng cho database local mới, có guard rõ ràng; production/staging và backfill
  dữ liệu nằm ngoài initiative này.
- Trạng thái cuối chỉ có một schema và một write path; không duy trì dual-write hoặc view tương
  thích lâu dài.

Các file trong `.phunglm` lưu spec, review và lịch sử lập kế hoạch cho agent. Runtime, migration
và CI không được phụ thuộc vào `.phunglm`; mọi validation tự động phải đọc artifact trong thư mục
này.

## Quyết định kiến trúc

- [`ADR-0001`](./adr/0001-conversation-handoff-schema.md): hội thoại chung và cơ chế nhân viên
  tiếp quản chatbot.
- [`ADR-0002`](./adr/0002-database-v2-fresh-cutover.md): chiến lược fresh-database,
  compatibility-first cutover.

Kế hoạch triển khai chi tiết được theo dõi tại [`tasks/plan.md`](../../tasks/plan.md) và
[`tasks/todo.md`](../../tasks/todo.md). Tài liệu database tổng quan nằm tại
[`docs/database.md`](../database.md).

## Quy ước cốt lõi

- MySQL 8.4, InnoDB, `utf8mb4`, thời gian lưu theo UTC.
- Tên bảng/cột dùng `snake_case`.
- ID entity dùng `BIGINT`; role/permission ID dùng `INTEGER`.
- Tiền dùng `DECIMAL(19,4)` và không đi qua JavaScript `Number`.
- API serialize `BIGINT` thành string; contract public hiện tại được giữ tương thích khi có thể.
- Public input vẫn cấm ID dạng `Number`. Adapter MySQL chỉ được phép đổi `Number` auto-increment
  sang string khi nó là safe integer; ID không an toàn phải fail-closed để không mất precision.

Không chỉnh trực tiếp schema đích mà không cập nhật revision, checksum/manifest, ADR liên quan và
các test bảo vệ schema.

## Chạy baseline V2 an toàn ở local

V2 runner hoàn toàn tách khỏi migration legacy. Nó chỉ có `status` và `up`; không có lệnh
`down`, reset hoặc drop. Runner luôn yêu cầu đủ hai biến dưới đây và từ chối mọi database không
kết thúc bằng `_test`:

Hiện runner dành cho checkout local của repository: cần có cả nguồn migration TypeScript và
hai manifest trong `docs/database-v2`. Runtime image trong `apps/api/Dockerfile` chưa đóng gói
các artifact này; chưa dùng image đó để chạy V2 migration. Deployment/cutover sẽ được xử lý ở
checkpoint sau, không ngầm coi local rehearsal là production-ready.

```powershell
$env:V2_MIGRATIONS_ENABLED = "true"
$env:V2_MIGRATIONS_TARGET_DATABASE = "sale_and_managements_db_test"
npm run db:v2:up --workspace @sales/api
npm run db:v2:status --workspace @sales/api
```

Tạo database `_test` riêng và cấp quyền cho user API trước lần chạy đầu. Không đặt hai biến trên
vào cấu hình production và không thay `MYSQL_DATABASE=sale_and_managements_db` bằng database V2
trước checkpoint cutover. Checksum DBML và từng file migration được kiểm tra trước khi kết nối
MySQL; checksum migration đã thực thi còn được đối chiếu với cột `checksum` trong
`database_v2_migrations`. Schema/migration chưa được review, hash lệch, thiếu target hoặc
target không phải `_test` đều bị chặn. Metadata cũ không có cột checksum sẽ bị từ chối;
runner không tự điền hash cho migration cũ vì không thể tự chứng minh nội dung đã từng chạy.
Chỉ nâng cấp metadata của DB `_test` cũ sau khi đã đối chiếu tên migration và hash nguồn,
hoặc tạo DB `_test` mới; không reset DB ứng dụng chính để xử lý trường hợp này.

## Seed dữ liệu nền V2

Sau baseline, seed V2 chỉ chạy trên cùng target `_test` và cũng kích hoạt guard của migration.
Nó không có reset/drop, chạy trong một transaction, và có thể chạy lại an toàn:

```powershell
$env:V2_MIGRATIONS_ENABLED = "true"
$env:V2_MIGRATIONS_TARGET_DATABASE = "sale_and_managements_db_test"
npm run db:v2:seed --workspace @sales/api
```

Runner yêu cầu `SUPER_ADMIN_EMAIL` hợp lệ và `SUPER_ADMIN_PASSWORD` dài tối thiểu 12 ký tự.
Giá trị thật chỉ đặt trong `.env`/secret store, không commit. Nếu email đã tồn tại, seed không
đổi mật khẩu, trạng thái hay dữ liệu tài khoản hiện có; nó chỉ bảo đảm role `SUPER_ADMIN` global
của email cấu hình. Seed tạo/cập nhật 6 role chuẩn, permission catalog, hai payment method
`COD` và `VNPAY`; toàn bộ permission nền chỉ được gán cho `SUPER_ADMIN`. Các role nghiệp vụ
không được cấp quyền ngầm, vì mapping least-privilege và scope branch sẽ được áp dụng cùng
authorization V2 ở T23.

## Convention persistence V2

- Model V2 thuộc module domain; registry chỉ đăng ký model trước rồi mới compose association,
  không chứa query hay business rule.
- Mỗi model khai báo `v2ModelOptions("table_name")`: tên bảng lowercase `snake_case`,
  `freezeTableName=true`, `timestamps=false`. Field audit phải map tường minh tới
  `created_at`/`updated_at`; không dùng tên Sequelize mặc định.
- Mọi command ghi nhiều aggregate dùng `inTransaction`; service domain quyết định lock order,
  isolation và invariant, không dồn logic này vào controller hoặc registry.
- Write path có thể dùng `retryV2Transaction` cho lỗi cạnh tranh nhất thời của MySQL
  (`ER_LOCK_DEADLOCK`, `ER_LOCK_WAIT_TIMEOUT`) với backoff hữu hạn. Không retry validation,
  unique/integrity error hoặc lỗi hạ tầng khác; các lỗi đó phải trả về kết quả nghiệp vụ hoặc lỗi
  rõ ràng ở use-case sở hữu chúng.
- Không import registry V2 vào runtime legacy trong Phase 2. Registry chỉ được nối vào app sau
  khi module compatibility tương ứng đã có integration test trên V2.

## Authentication V2 đang triển khai

Customer và backoffice password flow được tách thành application service, persistence adapter
và access-context reader. Password được so sánh qua một `PasswordHasher` port; cả credential
không tồn tại, inactive hoặc passwordless đều thực hiện bcrypt work tương đương để không tạo
timing oracle. Backoffice chỉ nhận context có role nội bộ từ database; `CUSTOMER` không thể dùng
role global để vào backoffice, và role nội bộ theo chi nhánh phải có employee profile active.

Kết quả đăng nhập hiện chỉ là core đã có unit test và MySQL `_test` integration test. HTTP route,
JWT middleware và frontend vẫn giữ compatibility legacy cho đến khi slice tương ứng hoàn chỉnh;
không bật riêng registry V2 trong runtime legacy.

Middleware V2 chỉ nhận `Authorization: Bearer <V2 JWT>`, verify issuer/audience và dùng
`account_id` đã ký để load lại `V2AccessContext` active từ database. `roleGrants`, `customerId`
và `employeeId` trong JWT không được dùng để cấp quyền; chúng chỉ là snapshot cho client. Token
thiếu/sai hoặc account inactive trả `401` chung, lỗi đọc context trả `503` chung và không có
token, claim hay database detail trong response/log.

Own-profile V2 dùng aggregate `Account` + `Customer` trong cùng transaction. Khách chỉ sửa được
`username`, `full_name`, `phone` từ DB-derived customer context; email không có trong patch vì
mọi thay đổi email phải mở challenge OTP mới. Xung đột username được trả bằng kết quả nghiệp vụ,
không lộ lỗi SQL; uniqueness phone chưa được thêm vì DBML revision 4 không khai báo ràng buộc đó.

Composition `routes/identity-v2.ts` hiện nối HTTP V2 riêng cho OTP, register, customer login,
backoffice login, logout và hồ sơ khách. OTP dùng Redis token gateway và email sender hiện có;
integration test dùng MemoryOtpStorage + fake sender, không gửi email thật. Đăng nhập cần Redis
để áp dụng rate limit, Redis lỗi trả 503 cho auth. JWT sống 15 phút, middleware đọc lại context
active từ MySQL ở mỗi request. Seed SUPER_ADMIN có email nhưng username null nên backoffice login
nhận email ở trường `username`. Cặp `accountId`/`customerId` trong response là chuỗi BIGINT;
Web cần đổi kiểu ở T38 trước khi mount runtime chính. Test HTTP với MySQL `_test` ở
`tests/integration/identityV2Http.test.ts`; endpoint V2 chưa mount trong app legacy.

Role/permission V2 có application service và MySQL repository riêng. Đọc danh mục cần
`role.read.global`; tạo/sửa/xóa role cần `role.manage.global` trên **grant global** — grant cấp
branch không bao giờ có thể quản trị RBAC toàn hệ thống. Role nền do seed (`CUSTOMER`, các role
nhân viên, `BRANCH_MANAGER`, `SUPER_ADMIN`) là bất biến qua API; thay đổi baseline phải đi qua
revision seed/migration được review. Role custom luôn tạo với permission không trùng lặp và mapping
được thay thế trong một transaction; role đã có `account_roles` không được xóa. HTTP V2 riêng đã
có `/role/read`, `/role/permissions`, `/role/create`, `/role/update/:roleId`,
`/role/delete/:roleId`. Role `CUSTOMER` không thể mang quyền quản trị toàn hệ thống kể cả khi
mapping permission bị cấu hình sai. Route chưa mount runtime legacy.

Employee V2 dùng `BIGINT` string và tiền `DECIMAL(19,4)` string xuyên suốt service. Nhân viên
được tạo/đọc/cập nhật/deactivate theo branch scope (`employee.*.branch`) hoặc global manager;
không có hard-delete. Mọi update/deactivate khóa row và đối chiếu lại branch đã được authorize
trong transaction để không bị TOCTOU khi sau này có employee transfer. `status`, account-linking
và chuyển branch không nhận từ patch thường vì chúng ảnh hưởng authorization/audit; các thao tác
đó có endpoint riêng. Directory theo branch phân trang stable bằng `code` (mặc định 20, tối đa
100) để không trả PII không giới hạn. HTTP V2 riêng có `/employee/read/:branchId`,
`/employee/create`, `/employee/update/:employeeId`, `/employee/delete/:employeeId` (deactivate),
`/employee/:employeeId/account` và `/employee/:employeeId/transfer`. Liên kết account chỉ cho
global HR manager, từ chối account đã có role nội bộ cần xét lại; thao tác không tự cấp role.
Chuyển branch thu hồi grant gắn với branch nguồn trong cùng transaction, không tự cấp grant mới.
Deactivation và transfer xóa manager pointer cũ nếu employee đang làm manager. Test MySQL có cả
trường hợp account trùng, manager sai branch và quyền cũ sau transfer; route chưa mount runtime.

Branch V2 hiện có core tạo/đọc/cập nhật với `BIGINT` string, mã branch bất biến và quyền ghi
chỉ từ grant global `branch.manage.global`; grant theo branch không thể tự tạo hay thay cấu hình
toàn hệ thống. Đọc directory loại trừ role `CUSTOMER` dù có mapping permission sai và luôn phân
trang deterministic theo `code` (mặc định 20, tối đa 100). Generic patch không nhận `code` hoặc
`manager_employee_id`; không có hard-delete và không tự tạo inventory cũ. Endpoint
`PUT /branch/:branchId/manager` chỉ nhận employee active thuộc chính branch đó hoặc `null` để bỏ
gán; manager pointer phục vụ nghiệp vụ/hiển thị, không tự cấp quyền. Core/HTTP có unit và
integration test MySQL `_test`; route chưa mount runtime legacy.

Catalog category V2 hiện có directory chỉ-đọc public, phân trang deterministic theo `code`
(mặc định 20, tối đa 100) và serialize `id`/`parent_id` BIGINT thành string. Đây tương thích với
catalog category legacy vốn public. Tạo, sửa, xoá hoặc đổi `parent_id` chưa được chuyển: schema
không có trạng thái visibility cho category và policy chống vòng trong cây category chưa được
duyệt.

Size directory V2 cũng chỉ-đọc public, phân trang deterministic theo `name`, rồi `id` (mặc định
20, tối đa 100) và serialize BIGINT thành string. Size là dữ liệu tham chiếu catalog, không phải
tồn kho: API này không suy diễn khả dụng của product variant hay số lượng theo chi nhánh. Tạo/sửa
size và product/variant vẫn chờ DTO, write-policy và contract tồn kho V2 được duyệt.

Product directory/detail V2 chỉ đọc các product `active`, phân trang deterministic theo
`created_at DESC`, rồi `id DESC` (mặc định 20, tối đa 100). `base_price` DECIMAL được trả dưới
dạng chuỗi canonical, không qua JavaScript `number`; ID cũng luôn là string. Image JSON cũ được
lọc thành mảng `{ url }` chỉ chấp nhận URL `http/https`, không trả `publicId` hay JSON lỗi. Product
read không join `inventories`: khả dụng/tồn kho là dữ liệu theo `(branch, product_variant)` và sẽ
thuộc contract inventory riêng. Product write, variant, DTO/route compatibility vẫn chưa chuyển.

Variant directory theo product cũng chỉ public read: chỉ parent product và variant `active`, trả
`variant id`, `size id`, `size name`, theo thứ tự `size.name`, rồi `variant.id`. Không trả SKU,
stock hay availability; product không tồn tại/draft/inactive đều cho cùng kết quả không tìm thấy.
Đây là lựa chọn variant để cart V2 tham chiếu đúng aggregate, không phải phép xác nhận giữ hàng.

Banner directory V2 chỉ public các banner `active`, phân trang deterministic theo `created_at DESC`,
rồi `id DESC` (20/100). JSON media được dùng chung helper với product: chỉ trả `{ url }` hợp lệ
`http/https`; URL đích chỉ giữ lại đường dẫn nội bộ bắt đầu bằng `/` hoặc `http/https`, không nhận
`//` hay protocol lạ. Core banner write hiện có metadata CRUD và vòng đời ảnh. Ảnh JPEG/PNG/WebP
được kiểm tra MIME, chữ ký file và giới hạn 5 MiB ở application service. Adapter Cloudinary thực
được nối qua composition V2; test dùng fake, **chưa kiểm chứng upload/delete thật**. Trước khi gọi
Cloudinary, service ghi một bản ghi giữ chỗ vào `outbox_events`; cập nhật ảnh, hoàn tất giữ chỗ và
ghi yêu cầu dọn ảnh cũ cùng transaction. Xóa banner cũng ghi yêu cầu dọn ảnh trong transaction.
Request multipart tạo/sửa banner lưu metadata và ảnh trong cùng transaction. Nếu DB trả lỗi
nhưng chưa rõ commit đã thành công hay chưa, service không xóa ngay ảnh mới; worker kiểm tra
tham chiếu DB trước khi dọn để tránh xóa ảnh đã commit thành công.
Worker độc lập xử lý ảnh mồ côi sau 5 phút, retry job lỗi tối đa 20 lần, chỉ xóa `publicId` thuộc
namespace `banners/` và kiểm tra ảnh còn được DB tham chiếu hay không. Bản ghi đã hết retry cần
được operator kiểm tra và xử lý thủ công; không tự xóa hay bỏ qua. Logger cleanup chỉ mang tính
chẩn đoán, không thay bản ghi durable trong DB.

```sql
SELECT id, event_type, aggregate_id, attempts, last_error, created_at
FROM outbox_events
WHERE published_at IS NULL
  AND event_type IN ('catalog.banner.media_cleanup_requested',
                     'catalog.banner.media_upload_reserved')
  AND attempts >= 20
ORDER BY created_at;
```

Worker **chưa tự chạy** vì V2 HTTP/auth chưa cutover. Sau khi xác nhận `MYSQL_DATABASE` thực sự là
schema V2 và cấu hình Cloudinary, bật `BANNER_MEDIA_CLEANUP_ENABLED=true`, rồi chạy riêng
`npm run banner-media:cleanup --workspace @sales/api` (local) hoặc
`npm run banner-media:cleanup:prod --workspace @sales/api` sau khi build. Không bật worker này trên
database legacy hoặc `_test` có dữ liệu không kiểm soát. Khi triển khai production, chạy worker
thành process/container riêng và chỉ một outbox consumer xử lý các event
`catalog.banner.media_*`; publisher nghiệp vụ khác không được nhận nhầm chúng. HTTP route V2 đã có
giới hạn 5 MiB ngay tại upload middleware, kiểm tra quyền trước khi đọc file và HTTP contract test;
chưa mount vào runtime legacy. Worker cần giám sát backlog/hết retry trước khi deploy production.

Cart read core V2 chỉ lấy customer từ access context đã kiểm tra với DB, query `carts`/`cart_items`
theo ownership, phân trang theo `cart_items.id` (20/100) và trả `base_price` hiện tại dưới dạng
DECIMAL string. Product/variant inactive vẫn xuất hiện trong giỏ với `catalogActive=false` để khách
nhìn thấy và xử lý. Đọc giỏ không tạo row mới, không xác nhận stock hoặc giữ hàng; checkout phải
kiểm tra lại giá và inventory trong transaction riêng.

Cart add core V2 nhận `productVariantId` BIGINT string và `quantity` nguyên dương từ request,
nhưng customer ID chỉ lấy từ access context DB-derived. Chỉ variant/product đang `active` mới
được thêm; một cart tái sử dụng cho mỗi customer và một dòng cho mỗi variant. Adapter ghi trong
transaction, dùng unique key của cart cùng `FOR UPDATE` trên cart để tuần tự hóa các lệnh thêm
đồng thời; tổng quantity không vượt giới hạn `INT` của schema. Thêm giỏ không đọc inventory,
không giữ hàng và không chốt giá. Cart remove core xóa bằng một câu lệnh SQL có điều kiện
`customer_id` và `cart_item.id`, nên ID của người khác hoặc ID không tồn tại cùng trả một kết quả
`item_not_found`; không tạo cart mới. Cart update core thay quantity nguyên dương trong
transaction sau khi khóa cart/item của customer. Update cùng quantity vẫn thành công; item
không thuộc khách trả `item_not_found`, còn product/variant ngừng bán trả
`variant_unavailable` (người dùng vẫn có thể remove item đó). DTO/route compatibility và audit HTTP
đã có trong composition V2 riêng; chưa mount vào runtime legacy.

Review create core V2 nhận product ID dạng BIGINT string, rating nguyên từ 1 đến 5 và comment
đã trim dài 1–2000 ký tự; customer ID chỉ lấy từ access context DB-derived, không nhận từ body.
Repository dùng `uq_reviews_customer_product` để chặn trùng cả khi hai request gửi đồng thời;
duplicate được map thành `already_reviewed`, product không tồn tại thành `product_not_found`,
các lỗi hạ tầng trả kết quả chung không lộ SQL. Review không tự gắn `order_item_id` hoặc suy
diễn “đã mua” vì spec V2 chưa có policy verified-purchase. Review listing core V2 phân trang
(20 mặc định, tối đa 100), sắp theo `created_at DESC, id DESC`, trả rating/comment/createdAt
và username nếu account liên kết còn có username; không trả customer/account ID, email hoặc
full name. Product chưa có review trả trang rỗng. HTTP DTO/route compatibility đã có và được kiểm
chứng qua JWT ký thật + MySQL `_test`; chưa mount vào legacy app.

## HTTP catalog public V2 — T27 (chưa cutover)

`apps/api/src/routes/catalog-v2.ts` là composition độc lập trên Database V2, chưa mount vào
`routes/api.ts`. Nó cung cấp `GET /category/read`, `GET /size/read`, `GET /product/read`,
`GET /product/:productId` và `GET /product/:productId/variants` dưới `/api/v1` khi được mount.
Directory dùng `page`/`limit` (mặc định 1/20, tối đa 100), trả `pagination` riêng; ID luôn
là string và `basePrice` là DECIMAL string. Product/variant public chỉ hiện trạng thái `active`,
không lộ SKU hay số lượng tồn. Dữ liệu ảnh product được lọc URL an toàn. T39 phải cập nhật Web
đọc contract mới trước khi router này thay thế legacy. Mutation category/size/product/variant,
chống vòng lặp category, media product và availability theo branch vẫn là việc T27/T29 tiếp theo.

Test MySQL thật chỉ dùng database `_test`:

```powershell
$env:RUN_DATABASE_V2_TESTS = "true"
$env:V2_MIGRATIONS_ENABLED = "true"
$env:V2_MIGRATIONS_TARGET_DATABASE = "sale_and_managements_db_test"
npm test --workspace @sales/api -- tests/integration/catalogV2Http.test.ts
```

## HTTP cart/review/banner V2 — T28

`apps/api/src/routes/catalog-commerce-v2.ts` là composition cho ba capability này: middleware
verify JWT V2, load quyền/ownership từ MySQL, rồi nối DTO/controller/service/repository. Mặc định
dùng adapter Cloudinary thật; test inject fake provider để không gửi file ra dịch vụ ngoài.
Router được mount trong test tại `/api/v1`. `routes/api.ts` hiện vẫn là legacy; chỉ nối router V2
khi auth/consumer và rehearsal/cutover đạt checkpoint, không mount cả hai write path cùng lúc.

| Route (sau `/api/v1`) | Quyền và contract |
| --- | --- |
| `GET /banner/read/active` | Public, chỉ `active`; `page`/`limit` 20 mặc định, tối đa 100 |
| `GET /banner/read` | Global `catalog.manage.global` từ role nội bộ, thấy đủ trạng thái |
| `POST /banner/create` | Global manager; `name`, `url`, `status`; file tùy chọn field `banner` |
| `PUT /banner/update/:bannerId` | Global manager; metadata, ảnh hoặc cả hai; không nhận patch rỗng |
| `DELETE /banner/delete/:bannerId` | Global manager; yêu cầu dọn ảnh cùng transaction xóa banner |
| `GET /cart/read/:userId` | JWT V2; chỉ giỏ của customer từ DB, ID trong URL không quyết định ownership |
| `POST /cart/add` | `id` product + `sizeId` legacy được resolve sang active variant; quantity nguyên dương |
| `PUT /cart/update`, `DELETE /cart/delete/:cartProductSizeId` | Chỉ customer sở hữu cart item |
| `POST /review/add` | Customer từ DB; unique customer/product, duplicate trả 409 |
| `GET /review/product/:productId` | Public; tên hiển thị/rating/comment, không trả account/customer ID |

Envelope `EM/EC/DT` và field `url`, `image.url`, `reviewText` được giữ. Entity ID trả string;
tiền trong cart là DECIMAL string. Banner create trả `DT.id`; update/delete trả `DT=null`.
Danh sách có `pagination`; Web phải đọc hết trang ở T39. `/banner/read` trước đây public nay được
bảo vệ: storefront phải dùng `/banner/read/active`. Branch manager chỉ có grant theo branch không
được sửa banner toàn hệ thống. `url` dài tối đa 1000 ký tự theo schema; JSON `image`, actor/role
và các field không thuộc DTO banner bị từ chối. HTTP 400 cho đầu vào sai, 401/403 cho auth/quyền,
404 cho không tồn tại, 413 cho file quá 5 MiB, 503 cho hạ tầng lỗi; không trả raw provider/SQL error.

Audit vận hành `v2_http.mutation_audit` dùng structured logger cho mutation cart/review/banner,
ghi action, account ID từ context đã verify, resource ID khi xác định được, request ID, status
và outcome. Không ghi body, token, comment, filename hoặc nội dung file. Đây là log best-effort
theo request, **không phải ledger audit giao dịch bền vững**; log failure không đảo kết quả DB.
Để production cần thu thập/retention log tập trung và xử lý dependency security debt đã ghi tại
`tasks/followups.md`. Bản ghi cleanup trong `outbox_events` là trạng thái retry bền vững riêng.

Chạy kiểm thử xuyên suốt T28 (không chạm DB chính, không gọi Cloudinary thật):

```powershell
$env:RUN_DATABASE_V2_TESTS = "true"
$env:V2_MIGRATIONS_ENABLED = "true"
$env:V2_MIGRATIONS_TARGET_DATABASE = "sale_and_managements_db_test"
npm test --workspace @sales/api -- tests/integration/databaseV2T28Http.test.ts
```

Suite kiểm tra create/replace/delete ảnh, transaction rollback, mất commit acknowledgement,
quyền DB thắng JWT hints, cart ownership, review uniqueness, tài khoản khóa và audit không chứa
request data nhạy cảm. Test này không thay thế smoke Web/AI/runtime chính tại T42–T44.

Google OAuth V2 **chưa được chuyển**. `accounts` hiện thiếu provider subject bất biến (Google
`sub`) và issuer/provider constraint. Không được ghép account chỉ theo email, vì email là claim
có thể thay đổi và sẽ tạo rủi ro account takeover. Cần revision DBML/migration được phê duyệt
trước, vẫn giữ giới hạn 49 bảng bằng cách bổ sung field/unique constraint trực tiếp vào
`accounts`.

Để chạy focused integration test MySQL hiện có:

```powershell
$env:RUN_DATABASE_V2_TESTS = "true"
$env:V2_MIGRATIONS_ENABLED = "true"
$env:V2_MIGRATIONS_TARGET_DATABASE = "sale_and_managements_db_test"
npm run test --workspace @sales/api -- tests/integration/databaseV2IdentityAccess.test.ts
```

Khi `RUN_DATABASE_V2_TESTS=true`, Vitest tự chạy tuần tự các file trong API suite. Lý do là các
test V2 dùng chung một database `_test` đã được guard và test seed cố ý thay đổi audit timestamp
để chứng minh idempotency. Unit/API suite không bật V2 vẫn chạy song song như bình thường.

Migration catalog tạo `reviews.order_item_id` và index của nó ở T07. Foreign key
`fk_reviews_order_item` được tạo ở T08, sau khi `order_items` tồn tại; đây là dependency có chủ
đích, không phải bỏ sót constraint.
