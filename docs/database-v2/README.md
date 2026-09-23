# Database V2

Thư mục này là **nguồn sự thật được Git quản lý** cho hợp đồng schema Database V2 của
HappyShop. Artifact hiện tại là revision 4, gồm đúng **49 bảng nghiệp vụ** và **104 quan hệ**.
Bảng metadata do migration runner tạo ra không thuộc 49 bảng nghiệp vụ này.

## Phạm vi và trạng thái

- [`target-schema.dbml`](./target-schema.dbml) mô tả schema đích đã được duyệt.
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

Không chỉnh trực tiếp schema đích mà không cập nhật revision, checksum/manifest, ADR liên quan và
các test bảo vệ schema.

## Chạy baseline V2 an toàn ở local

V2 runner hoàn toàn tách khỏi migration legacy. Nó chỉ có `status` và `up`; không có lệnh
`down`, reset hoặc drop. Runner luôn yêu cầu đủ hai biến dưới đây và từ chối mọi database không
kết thúc bằng `_test`:

```powershell
$env:V2_MIGRATIONS_ENABLED = "true"
$env:V2_MIGRATIONS_TARGET_DATABASE = "sale_and_managements_db_test"
npm run db:v2:up --workspace @sales/api
npm run db:v2:status --workspace @sales/api
```

Tạo database `_test` riêng và cấp quyền cho user API trước lần chạy đầu. Không đặt hai biến trên
vào cấu hình production và không thay `MYSQL_DATABASE=sale_and_managements_db` bằng database V2
trước checkpoint cutover. Manifest checksum được kiểm tra trước khi kết nối MySQL; schema chưa
được review, checksum lệch, thiếu target hoặc target không phải `_test` đều bị chặn.

Để chạy focused integration test MySQL hiện có:

```powershell
$env:RUN_DATABASE_V2_TESTS = "true"
$env:V2_MIGRATIONS_ENABLED = "true"
$env:V2_MIGRATIONS_TARGET_DATABASE = "sale_and_managements_db_test"
npm run test --workspace @sales/api -- tests/integration/databaseV2IdentityAccess.test.ts
```

Migration catalog tạo `reviews.order_item_id` và index của nó ở T07. Foreign key
`fk_reviews_order_item` được tạo ở T08, sau khi `order_items` tồn tại; đây là dependency có chủ
đích, không phải bỏ sót constraint.
