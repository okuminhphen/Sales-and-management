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
size và product/variant đã có HTTP V2 riêng (T27), nhưng chưa cutover vào app chính.

Product directory/detail V2 chỉ đọc các product `active`, phân trang deterministic theo
`created_at DESC`, rồi `id DESC` (mặc định 20, tối đa 100). `base_price` DECIMAL được trả dưới
dạng chuỗi canonical, không qua JavaScript `number`; ID cũng luôn là string. Image JSON cũ được
lọc thành mảng `{ url }` chỉ chấp nhận URL `http/https`, không trả `publicId` hay JSON lỗi. Product
read không join `inventories`: khả dụng/tồn kho là dữ liệu theo `(branch, product_variant)` và sẽ
thuộc contract inventory riêng. Product/variant write và DTO/route compatibility đã có trong
composition V2 độc lập ở T27; Web chưa chuyển sang contract ID/DECIMAL mới.

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
`GET /product-by-category/read?categoryId=...`, `GET /product/:productId` và
`GET /product/:productId/variants` dưới `/api/v1` khi được mount.
Directory dùng `page`/`limit` (mặc định 1/20, tối đa 100), trả `pagination` riêng; ID luôn
là string và `basePrice` là DECIMAL string. Product/variant public chỉ hiện trạng thái `active`,
không lộ SKU hay số lượng tồn. Dữ liệu ảnh product được lọc URL an toàn. Category mutation
`POST /category/create`, `PUT /category/update/:categoryId`, `DELETE /category/delete/:categoryId`
yêu cầu JWT V2 và grant nội bộ `catalog.manage.global` từ DB. `code`/`slug` tự tạo một lần, giữ
ổn định khi đổi tên. Việc đổi cha khóa hierarchy trong transaction và từ chối cycle (409); xóa
category có child/product cũng trả 409. T39 phải cập nhật Web đọc contract mới trước khi router
này thay thế legacy. Size mutation giữ legacy path `POST /size/create`, `PUT /size/update`,
`DELETE /size/delete/:id` nhưng ID là BIGINT string, trả 409 khi trùng tên hoặc còn variant
tham chiếu; không xóa cascade. Availability theo branch là việc T29. Hai route recommendation
legacy phụ thuộc AI service/MySQL cũ sẽ chuyển cùng AI consumer tại T40. `/category/check`
legacy là handler rỗng và Web không gọi; chưa có contract nghiệp vụ để chuyển thành API V2.

Product metadata V2 đã có `POST /product/create`, `PUT /product/update/:id` và
`DELETE /product/delete` (chuyển `inactive`, không hard-delete). Variant có
`POST /product/:productId/variants`, `PUT /product/:productId/variants/:variantId` và
`DELETE /product/:productId/variants/:variantId` (cũng chuyển `inactive`). SKU và cặp
product/size được bảo vệ bởi unique DB; `sizeId` không đổi sau khi tạo. Route variant không
nhận `stock`: tồn kho theo variant và branch thuộc T29. Giá đầu vào `price` bắt buộc
là decimal string, category ID là BIGINT string; create mặc định `draft`. Metadata route dùng
JSON. `PUT /product/:productId/images` nhận 1–5 ảnh multipart field `images`, mỗi ảnh tối đa
5 MiB, chỉ JPEG/PNG/WebP có chữ ký file hợp lệ; `DELETE /product/:productId/images` xóa bộ ảnh
khỏi product. JWT V2 và quyền global được kiểm tra **trước** khi buffer. Upload dùng public ID
server-generated dưới `products/`, ghi reservation bền vững trước khi gọi provider, rồi thay
JSON ảnh + hoàn tất reservation + tạo cleanup intent cho ảnh cũ trong một transaction.
Worker media V2 đối chiếu reference ở cả banner và product trước khi xóa; DB rollback hoặc
mất xác nhận commit không làm xóa ảnh còn được tham chiếu. Test chỉ dùng fake provider, chưa
gọi Cloudinary thật. Mỗi thay đổi product và outbox event catalog commit cùng transaction.
Event payload V2 giữ giá dưới dạng string và có `status`; mọi variant mutation cũng tạo product
upsert event cùng transaction để consumer có thể rehydrate product. T40 phải cập nhật AI consumer để bỏ qua
draft/inactive và query schema V2 trước khi mount router runtime. Chưa dùng số tồn từ product.

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

## Inventory V2 — T29 hoàn tất ở phạm vi primitives

`stock` trong `inventories` là số hàng vật lý bán được tại chi nhánh, **bao gồm** hàng đang giữ.
`reserved` là tổng reservation `active`, kể cả hold đã quá `expires_at` nhưng worker chưa chuyển
trạng thái. `available = stock - reserved`; read model chỉ để hiển thị. Checkout/điều chuyển phải
tính lại sau khi khóa inventory row. Test MySQL `_test` đã kiểm chứng công thức, idempotency và
hai request tranh đơn vị hàng cuối.

Core nội bộ hiện có: giữ hàng cho order item dựa trên branch/variant/quantity lấy từ DB, với
thứ tự khóa order → order item → inventory → reservation; manual stock adjustment kiểm tra grant
`inventory.manage.branch`, active holds, rồi ghi `inventory_movements` cùng transaction thay đổi
stock. Adjustment chỉ ghi `reference_type=manual_adjustment`; mutation từ order/transfer/return
phải có typed FK và flow riêng. Repository reservation có thể dùng transaction do checkout
truyền vào; MySQL test xác nhận rollback của outer transaction xóa hold. Đây chưa phải checkout
hoàn chỉnh: use-case tạo order + reservation T33 chưa được nối. Primitive `confirm` có thể
được gọi trong transaction đổi order sang `confirmed`: nó xóa expiry và giữ nguyên stock,
nhưng payment/COD policy phải được xác minh bởi use-case gọi nó. Primitive `release` chỉ nhả
hold khi order và fulfillment đều `cancelled` và mọi payment đã `failed`/`cancelled`; pending,
processing hoặc completed đều giữ hold để đối soát. Release không cộng stock vì chưa xuất kho.
Primitive `consume` yêu cầu fulfillment đã `shipping`/`fulfilled` và hold đã confirm; nó giảm
stock, chuyển hold `consumed` và ghi movement có FK `order_item_id` trong cùng transaction.
Caller T33/T35 vẫn phải kiểm tra payment/COD và đổi fulfillment trong transaction đó.
Expire worker V2 hiện chỉ xử lý hold order `active` đã hết hạn của đơn còn `pending` và
`unfulfilled`, khi mọi payment attempt (nếu có) đều `failed`/`cancelled`. `pending`,
`processing`, `completed`, đơn đã xác nhận hoặc hold đã confirm đều giữ nguyên để đối soát;
worker không đổi stock hay trạng thái order. Mỗi candidate được kiểm tra lại trong transaction
với thứ tự khóa order → payment → item → inventory → reservation; nhiều worker chạy cùng lúc
không được expire hai lần. Cursor trong bộ nhớ đi tiếp qua hold chưa an toàn, rồi quét lại sau
khi hết danh sách. Test MySQL `_test` đã xác minh các trạng thái payment và idempotency.
Worker chỉ chạy bằng process riêng `npm run inventory-reservation:expire --workspace @sales/api`
và yêu cầu đặt `V2_INVENTORY_RESERVATION_EXPIRY_ENABLED=true` rõ ràng **sau cutover**;
chưa được tự khởi động cùng API legacy. T34 phải kiểm tra hold dưới order lock trước khi tạo
hoặc xử lý payment muộn, không coi việc worker expire là bằng chứng thanh toán thất bại.

Primitive `reserveTransferItem` dành cho T31 giữ hàng tại branch cung cấp khi phiếu
điều chuyển đã được duyệt. Nó đối chiếu request (nếu có) và receipt theo chiều
requester/supplier, khóa request → receipt → item → inventory → reservation, tạo
hold confirmed không expiry và không giảm stock. Repository nhận transaction của
approval use-case; MySQL `_test` đã kiểm tra rollback, idempotency và cạnh tranh
đơn vị cuối. Dispatch mới là lúc giảm kho nguồn và ghi movement; nhận hàng đủ
điều kiện bán mới tăng kho đích. Việc nối state/HTTP thuộc T31.
Primitive dispatch nguồn đã có cho T31: sau khi use-case chủ quản chuyển
receipt sang `in_transit` trong cùng transaction, nó consume hold đã confirm,
giảm stock nguồn và ghi movement có FK `transfer_receipt_item_id`, actor và
idempotency key. Replay sau khi receipt hoàn tất không trừ kho lần hai; MySQL
`_test` đã kiểm tra rollback, key conflict và dispatch đồng thời. Chưa mount
route hoặc tự chuyển receipt.
Primitive nhận đủ hàng tốt tăng stock đích đúng `received_quantity` và ghi
movement typed cho transfer item; kiểm tra movement dispatch nguồn, chỉ nhận
receipt đã `completed`, replay/dedup và rollback cùng transaction. Trường hợp
`lost_quantity`/`non_sellable_quantity` vẫn fail-closed: T31 phải xác minh
người duyệt có `transfer.manage.branch`, khác người ghi nhận, lưu note/audit
rồi mới mở đường hoàn tất chênh lệch. Hủy/reject trước dispatch chỉ release
hold, không cộng kho. Return restock primitive chỉ cộng `restocked_quantity`
của item đã inspected/completed và có movement bàn giao gốc; hàng không bán
được không tự vào stock. T35 sở hữu eligibility/authorization và trạng thái
return trong cùng transaction. Các primitive này chưa mount runtime HTTP.

Trong các primitive giữ hàng, retry deadlock chỉ bao trùm transaction do repository
tự mở. Nếu checkout/approval cấp transaction, service trả lại lỗi deadlock/lock timeout
để use-case chủ quản rollback và retry **toàn bộ** giao dịch; không retry một thao tác
con trên transaction đã lỗi. Với cột MySQL `TIMESTAMP`, predicate hết hạn và thời điểm
ghi trong inventory slice dùng cùng múi giờ session (`CURRENT_TIMESTAMP`); đầu vào
expiry được lưu từ Unix epoch. Regression cho MySQL session `+07:00`/`-07:00`
đã đạt trên database `_test`.

`apps/api/src/routes/inventory-v2.ts` là router standalone cho `GET /inventory/:branchId` dưới
`/api/v1` khi mount. JWT V2 được kiểm tra, quyền hiện tại lấy từ MySQL: nhân viên chỉ xem branch
được cấp `inventory.read.branch`, global nội bộ có thể xem mọi branch, customer không được xem.
Response giữ `EM/EC/DT` và nhóm product/sizes cũ, nhưng entity ID và giá là string; mỗi size
có `stock`, `reserved`, `available`. Web hiện còn dùng `stock` như số lượng bán được nên T39 phải
chuyển sang `available`. Endpoint chưa phân trang để giữ contract cũ; cần đánh giá khi dữ liệu
chi nhánh lớn. Router chưa mount vào `routes/api.ts`, không thay thế runtime legacy trước cutover.

Kiểm chứng lát cắt T29 trên database test (không dùng database chính):

```powershell
$env:RUN_DATABASE_V2_TESTS = "true"
$env:V2_MIGRATIONS_ENABLED = "true"
$env:V2_MIGRATIONS_TARGET_DATABASE = "sale_and_managements_db_test"
npm test --workspace @sales/api -- tests/integration/databaseV2InventoryBalanceQuery.test.ts tests/integration/databaseV2InventoryReservation.test.ts tests/integration/databaseV2TransferReservation.test.ts tests/integration/databaseV2InventoryAdjustment.test.ts tests/integration/inventoryV2Http.test.ts
```

## Stock request V2 — T30 hoàn thành, chưa cutover

Primitive tạo yêu cầu đã dùng `stock_requests`, `stock_request_items` và
`stock_request_history` V2. Branch yêu cầu/nhận là `from_branch_id`, branch
cung cấp là `to_branch_id`; service lấy actor từ access context và kiểm tra
quyền theo branch yêu cầu. Một transaction tạo request, item và history; code
`RQ<ID>` sinh từ BIGINT ID đã insert, không dựa vào `COUNT(*)`. Tạo request
không giữ hay di chuyển kho và chưa mount vào runtime legacy. Query V2 phân
trang theo branch yêu cầu hoặc status `pending`, kiểm tra quyền DB-derived,
trả item/branch/history theo mapper tương thích Web cũ. Người tạo chỉ sửa/hủy
phiếu còn `pending` khi vẫn có quyền trên branch yêu cầu; hủy giữ lại row và
history `CANCELLED`, không hard-delete. Quyền global `stock_request.manage.branch`
duyệt/từ chối; duyệt tạo một `transfer_receipts` trạng thái `pending` liên
kết với phiếu, đảo chiều branch (nguồn là branch cung cấp), ghi cả hai history
trong một transaction. Hai lần duyệt đồng thời chỉ một lần thành công. T30
không giữ/xuất/nhận kho: transaction điều chuyển thuộc T31.

Router/DTO V2 giữ đường dẫn `/stock-requests*` và `/admin/stock-requests*`,
envelope `EM/EC/DT`, phân trang cho danh sách. HTTP từ chối ID dạng JS Number,
kiểm tra body strict và lấy actor từ V2 access context. Router còn **độc lập,
chưa mount**; T40 thực hiện cutover, T39 phải cập nhật Web để dùng BIGINT ID
dạng string và hiển thị trạng thái `cancelled` thay cho giả định hard-delete.
Test MySQL `_test` đã kiểm tra atomic create/update/approve/reject, rollback
khi variant sai, concurrent approve, auth scope và HTTP DTO.

## Transfer receipt V2 — T31 đang triển khai

Lát cắt duyệt transfer đã nối primitive reserve của T29 trong outer transaction:
quyền global `transfer.manage.branch`, đối chiếu phiếu yêu cầu/chiều branch và
tổng quantity theo variant, khóa `stock_request → transfer_receipt → item →
inventory → reservation`. State `approved`, active hold và history cùng commit;
thiếu hàng ở bất kỳ item nào rollback cả state lẫn mọi hold. Duyệt chưa làm
giảm kho nguồn hay tăng kho đích. Dispatch kế tiếp chuyển `approved` sang
`in_transit`, consume hold và ghi movement giảm kho nguồn trong cùng transaction;
kho đích vẫn không đổi. Nếu item sau không dispatch được, toàn bộ debit/movement
item trước rollback. Chưa mount runtime. Ghi nhận và duyệt chênh lệch, receipt,
hủy/từ chối, query và HTTP sẽ làm ở các lát cắt T31 tiếp theo; không coi T31
hoàn thành ở checkpoint này.

## Giới hạn và kiểm thử chung còn lại

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
