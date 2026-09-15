# Audit cơ sở dữ liệu

Ngày audit: 2026-09-15. Đây là audit tĩnh từ Sequelize models và migrations. Chưa thể dump
schema thật vì Docker Desktop/MySQL không chạy trên máy local. Trước mọi migration production,
phải chạy [`sql/inspect_database.sql`](sql/inspect_database.sql) trên database thật.

## Cấu trúc logic hiện tại

API nạp 32 Sequelize models và có 50 migrations (gồm `OutboxEvent` và
`InventoryMovement` add-only).

| Nhóm | Bảng/model chính | Quan hệ chính |
| --- | --- | --- |
| Danh tính | `User`, `Role`, `UserRole`, `Admins`, `Employee`, `Branch` | user–role; admin–role; user/admin/employee–branch |
| Catalog | `Category`, `Product`, `Size`, `ProductSize`, `Review`, `Banner`, `Vouchers` | category–product; product–size; user/product–review |
| Bán hàng | `Cart`, `CartProductSize`, `Orders`, `OrdersDetails`, `Payment`, `PaymentMethods` | user–cart/order; cart–product size; order–detail/payment |
| Kho | `Inventory`, `StockRequests`, `StockRequestItems`, `StockHistories` | branch/product size–inventory; request–item/history |
| Điều chuyển | `TransferReceipt`, `TransferReceiptItem`, `TransferHistory` | receipt–branch/item/approval/history |
| Tin nhắn | `conversations`, `messages`, `notifications` | conversation–user/admin/message; notification–admin |
| Cá nhân hóa | `UserBehavior` | tín hiệu view/like theo user và product |

Migration còn tạo `Vehicle`, `Driver`, `Shipment`, `ShipmentItem`, `ShipmentTracking` nhưng
không có Sequelize model hoặc module ứng dụng tương ứng.

## Rủi ro mức cao

1. Chuỗi migration hiện tại không replay được an toàn trên database rỗng. Các file nền
   `migrate-*.ts` xếp sau migration có timestamp, khiến một số `addColumn` chạy trước
   `createTable`. Không dùng chuỗi này để bootstrap production mới.
2. Tên bảng không nhất quán giữa số ít/số nhiều, PascalCase/lowercase và tên suy luận/tường
   minh. Windows và Linux MySQL có thể xử lý khác nhau. Compose local đang tạm dùng
   `lower_case_table_names=1` để tương thích dữ liệu legacy.
3. Model `Cart` từng lệch migration: migration lưu `userId`, model cũ khai báo `name` và
   `description`. Model đã sửa nhưng vẫn phải kiểm tra/chuyển kiểu cột trên DB thật.
4. Các cột tiền `Product.price`, `Orders.totalPrice`, `Orders.shippingFee`,
   `OrdersDetails.priceAtOrder`, `OrdersDetails.totalPrice` và `Payment.amount` đang dùng
   `FLOAT`. Phải đổi thành `DECIMAL(19,4)` hoặc integer minor units; `FLOAT` gây sai số tiền.
5. Nhiều cột quan hệ thiếu foreign key, composite unique key và index ở database level.
   `ProductSize`, `Inventory`, `CartProductSize`, `UserBehavior` và `OrdersDetails` là các
   điểm cần ưu tiên kiểm tra trên schema thật.
6. Mã branch/employee sinh theo “đọc dòng cuối + 1”, có race condition khi ghi đồng thời.
7. Model/migration drift: một số field chỉ có trong migration; một số bảng logistics không
   còn ứng dụng sử dụng. Cần xác lập một source of truth.
8. Runtime `sequelize.sync({ alter: true })` đã được bỏ vì có thể tự đổi schema production.
   Mọi thay đổi schema phải đi qua migration versioned.
9. Cart/order đã được gia cố ownership và transaction, nhưng vẫn cần integration test với
   schema production-size trước release.
10. `InventoryMovement` hiện ghi immutable ledger cho luồng tạo order và duyệt điều chuyển;
    cần chuyển các điểm nhập/xuất/điều chỉnh kho còn lại sang cùng helper trước khi bật audit
    tồn kho như nguồn đối soát chính.

Registry đã khai báo tường minh model name và sửa lỗi `db.Notifications` thành
`db.Notification`. Order code dùng database ID sau insert, loại bỏ race “last order + 1”.
Race tương tự của branch/employee vẫn còn.

## Đánh giá thiết kế và chuẩn v2 đề xuất

Phân vùng domain hiện tại hợp lý cho hệ thống bán hàng: catalog, order/payment, warehouse,
transfer và identity đã tách entity riêng. Tuy nhiên **schema hiện tại chưa đạt mức best
practice production** vì các integrity rule chủ yếu nằm ở code/association, không được bảo
đảm bảo đầy đủ ở database. Không được áp dụng các constraint dưới đây trực tiếp vào database
đang có trước khi kiểm tra dữ liệu orphan/trùng lặp.

| Entity | Ràng buộc/index nên có ở baseline v2 | Lý do |
| --- | --- | --- |
| `Product` | `price >= 0`; index `categoryId`; giá `DECIMAL` | Giá chính xác, lọc catalog nhanh |
| `ProductSize` | `NOT NULL productId,sizeId`; `UNIQUE(productId,sizeId)`; FK tới `Product`,`Size`; `stock >= 0` nếu còn giữ stock tổng | Không sinh biến thể trùng hoặc mồ côi |
| `Inventory` | `NOT NULL branchId,productSizeId`; `UNIQUE(branchId,productSizeId)`; FK; `stock >= 0` | Một tồn kho cho mỗi chi nhánh/biến thể |
| `InventoryMovement` | append-only; `UNIQUE(idempotencyKey)`; index `(branchId, productSizeId, occurredAt)` | Sổ cái tồn kho, có thể đối soát balance và retry an toàn |
| `OutboxEvent` | `eventId` unique; index event chưa publish | Phát RabbitMQ sau commit MySQL, tránh mất sự kiện |
| `CartProductSize` | `NOT NULL`; `UNIQUE(cartId,productSizeId)`; FK; `quantity > 0` | Không có dòng cart trùng hoặc số lượng âm |
| `Orders` | FK `userId`,`branchId`; index `(userId, createdAt)`, `(status, createdAt)`; `code` unique/not null sau backfill | Truy vấn lịch sử và vận hành đơn hàng |
| `OrdersDetails` | FK `orderId`,`productId`; `quantity > 0`; giá snapshot `DECIMAL`; index `orderId` | Bảo toàn dòng đơn hàng và truy vấn chi tiết |
| `Payment` | FK `orderId`,`paymentMethodId`; unique theo provider transaction ID; index trạng thái/thời gian | Idempotency callback và đối soát |
| `UserBehavior` | `UNIQUE(userId,productId)`; FK; index `(userId,updatedAt)` | Một aggregate behavior cho một user/sản phẩm |
| `Review` | FK `userId`,`productId`; `CHECK rating BETWEEN 1 AND 5`; policy `UNIQUE(userId,productId)` nếu chỉ một review | Chất lượng dữ liệu review |

Các cột audit `createdAt`, `updatedAt`, timezone UTC, charset `utf8mb4` và InnoDB nên được
chuẩn hóa trong baseline. `deletedAt` chỉ dùng soft delete cho entity thật sự cần khôi phục;
order/payment/stock history cần immutable audit trail, không nên xóa mềm tùy tiện.

## Việc bắt buộc trước production

1. Backup và chạy inspection SQL trên staging/production.
2. Tạo baseline v2 versioned từ schema thật, chỉ chứa cấu trúc và không chứa data/secrets.
3. Đối chiếu từng model với baseline; archive chuỗi migration không replay được nhưng giữ
   lịch sử để audit.
4. Viết forward migration chuẩn hóa tên bảng, `Cart.userId`, kiểu tiền, FK, index và unique
   constraints; xử lý orphan rows trước khi thêm constraint.
5. Rehearsal restore + migration trên bản sao staging có kích thước tương đương production.
6. Ghi lại thời gian, kế hoạch rollback và người chịu trách nhiệm phê duyệt.

Cho tới khi hoàn thành, container ứng dụng vẫn build/test được nhưng không nên khởi tạo
database production mới bằng migration legacy.

CI dùng MySQL 8.4 và Redis 7.4 tạm để test adapter/infrastructure. Test này không chạy toàn
bộ chuỗi migration legacy và không được phép trỏ tới staging/production.
