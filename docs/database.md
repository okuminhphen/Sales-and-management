# Cơ sở dữ liệu HappyShop

Ngày cập nhật: 2026-09-28.

## Trạng thái hiện tại

Database V2 revision 4 là schema và persistence runtime duy nhất. Baseline gồm đúng **49 bảng
nghiệp vụ**, **104 khóa ngoại** và một bảng metadata `database_v2_migrations` do runner quản
lý. Sáu migration V2 được kiểm tra checksum; chạy lại phải báo zero pending. Chuỗi 50 migration
và 32 model legacy đã bị xóa khỏi source runtime sau cutover.

Tên database development mặc định là `sale_and_managements_db`. Integration test chỉ được
phép dùng database có hậu tố `_test`, mặc định `sale_and_managements_db_test`; target guard
từ chối chạy test destructive vào database chính.

Source of truth:

- [DBML revision 4](database-v2/target-schema.dbml)
- [Schema manifest](database-v2/schema-manifest.json)
- [Migration manifest](database-v2/migration-manifest.json)
- [Hướng dẫn Database V2](database-v2/README.md)
- [ADR cutover](database-v2/adr/0002-database-v2-fresh-cutover.md)

## Quy ước dữ liệu

- InnoDB, `utf8mb4`, timestamp UTC và tên bảng/cột `snake_case`.
- Primary/foreign key dùng `BIGINT`; HTTP không ép ID lớn thành JavaScript `number`.
- Tiền dùng `DECIMAL(19,4)` và serialize chính xác, không dùng `FLOAT`.
- Foreign key, unique key, check constraint và index được đặt tại database cho invariant quan trọng.
- Inventory movement, payment attempt và outbox là audit/idempotency record; không xóa tùy tiện.
- MySQL là nguồn dữ liệu chuẩn. Qdrant là read-model có thể rebuild, Redis là dữ liệu tạm thời.
- Không dùng `sequelize.sync({ alter: true })`; mọi thay đổi schema phải qua migration versioned.

## Lệnh development

```powershell
$env:V2_MIGRATIONS_ENABLED='true'
$env:V2_MIGRATIONS_TARGET_DATABASE='sale_and_managements_db'
npm run db:migrate:status --workspace @sales/api
npm run db:migrate --workspace @sales/api
npm run db:seed --workspace @sales/api
```

Target phải khớp chính xác `MYSQL_DATABASE`; cờ enable/target là xác nhận rõ ràng cho release
job, không nên bật thường trực trong API runtime. Runner đọc `.env`, kiểm tra manifest/checksum
và chỉ áp migration còn thiếu. Seed là idempotent.
API startup không chạy migration; nó dùng runtime gate để từ chối khởi động nếu schema không
đúng revision đã build.

Cutover/reset local chỉ dành cho database development mới và có target guard riêng:

```powershell
npm run db:v2:cutover:local --workspace @sales/api
```

Không chạy lệnh cutover lên staging/production hoặc database có dữ liệu cần giữ. Xóa Docker
volume sẽ xóa toàn bộ dữ liệu MySQL local; lần `infra:up` sau tạo volume/database rỗng và vẫn
phải chạy migrate + seed.

## Integration test

Các test MySQL V2 là opt-in và bắt buộc target `_test`:

```powershell
$env:RUN_DATABASE_V2_TESTS='true'
$env:V2_MIGRATIONS_ENABLED='true'
$env:V2_MIGRATIONS_TARGET_DATABASE='sale_and_managements_db_test'
npm run test --workspace @sales/api
```

Không tái sử dụng database development cho integration test. Database `_test` dùng cùng MySQL
container và chỉ tốn dung lượng theo schema/dữ liệu test; nó tồn tại trong named volume cho tới
khi bị drop hoặc volume bị xóa.

## Quy trình thay đổi schema

1. Sửa DBML và schema manifest; chạy `npm run db:v2:validate` và `npm run test:db:v2`.
2. Thêm migration V2 forward-only và cập nhật migration manifest/checksum.
3. Viết test đỏ cho constraint/repository/use case, rồi triển khai đến khi xanh.
4. Rehearsal trên `_test`; xác nhận table/FK/checksum/zero-pending và seed idempotent.
5. Review compatibility API/Web/AI, backup và rollback plan trước release.
6. Production chạy migration bằng job one-off trước khi deploy app phụ thuộc schema mới.

## Production

Fresh local cutover không chứng minh migration dữ liệu production. Trước release phải:

- chạy [`sql/inspect_database.sql`](sql/inspect_database.sql) trên bản sao môi trường thật;
- backup và kiểm thử restore;
- rehearsal forward migration với kích thước dữ liệu tương đương;
- đối soát row count, tiền, inventory ledger, order/payment và orphan rows;
- ghi owner phê duyệt, maintenance/compatibility window và rollback runbook.

Không tự động down-migration dữ liệu production. Khi cần thay đổi breaking schema, dùng
expand/migrate/contract qua nhiều release.
