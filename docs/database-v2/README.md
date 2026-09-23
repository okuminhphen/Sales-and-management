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

Role/permission V2 có application service và MySQL repository riêng. Đọc danh mục cần
`role.read.global`; tạo/sửa/xóa role cần `role.manage.global` trên **grant global** — grant cấp
branch không bao giờ có thể quản trị RBAC toàn hệ thống. Role nền do seed (`CUSTOMER`, các role
nhân viên, `BRANCH_MANAGER`, `SUPER_ADMIN`) là bất biến qua API; thay đổi baseline phải đi qua
revision seed/migration được review. Role custom luôn tạo với permission không trùng lặp và mapping
được thay thế trong một transaction; role đã có `account_roles` không được xóa. Đây mới là core
V2, chưa mount route vào runtime legacy để không trộn JWT/ID legacy với hợp đồng V2.

Employee V2 dùng `BIGINT` string và tiền `DECIMAL(19,4)` string xuyên suốt service. Nhân viên
được tạo/đọc/cập nhật/deactivate theo branch scope (`employee.*.branch`) hoặc global manager;
không có hard-delete. Mọi update/deactivate khóa row và đối chiếu lại branch đã được authorize
trong transaction để không bị TOCTOU khi sau này có employee transfer. `status`, account-linking
và chuyển branch không nhận từ patch thường vì chúng ảnh hưởng authorization/audit; các thao tác
đó sẽ là use-case riêng. Directory theo branch phân trang stable bằng `code` (mặc định 20, tối đa
100) để không trả PII không giới hạn. Core đã có MySQL
integration, còn HTTP route vẫn chờ V2 composition root thay vì gắn nhầm vào middleware legacy.

Branch V2 hiện có core tạo/đọc/cập nhật với `BIGINT` string, mã branch bất biến và quyền ghi
chỉ từ grant global `branch.manage.global`; grant theo branch không thể tự tạo hay thay cấu hình
toàn hệ thống. Đọc directory loại trừ role `CUSTOMER` dù có mapping permission sai và luôn phân
trang deterministic theo `code` (mặc định 20, tối đa 100). Generic patch không nhận `code` hoặc
`manager_employee_id`; không có hard-delete và không tự tạo inventory cũ. Gán manager, liên kết
account và điều chuyển nhân viên là use-case riêng vì chúng thay đổi phạm vi quyền hoặc quan hệ
audit. Core có unit test và integration test MySQL `_test`; HTTP route vẫn chờ composition root
V2 để không trộn contract định danh legacy.

Catalog category V2 hiện có directory chỉ-đọc public, phân trang deterministic theo `code`
(mặc định 20, tối đa 100) và serialize `id`/`parent_id` BIGINT thành string. Đây tương thích với
catalog category legacy vốn public. Tạo, sửa, xoá hoặc đổi `parent_id` chưa được chuyển: schema
không có trạng thái visibility cho category và policy chống vòng trong cây category chưa được
duyệt; product/variant vẫn là lát T27 tiếp theo.

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
