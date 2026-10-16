# Backend ↔ Database audit — 2026-10-15

> Đây là ảnh chụp audit trước khi sửa. Người dùng đã duyệt gỡ POS và sửa F1–F5;
> kết quả triển khai/kiểm chứng mới nhất nằm tại
> [backend readiness validation](backend-readiness-validation.md).

## Kết luận

**Schema/model khớp thiết kế, nhưng backend chưa kín luồng nghiệp vụ.** Không cần
refactor DB thêm để xử lý các lỗi đã xác nhận dưới đây. Chưa nên coi backend sẵn
sàng bán hàng online chỉ vì API khởi động được và test hiện có đều xanh.

Lượt này chỉ audit, chạy test/probe và lập plan; không sửa source ứng dụng,
deployment config, schema hay dữ liệu chính. Các thay đổi UI/auth có sẵn trong
working tree được giữ nguyên. Plan mới **chờ người dùng duyệt**.

## Bằng chứng kiểm tra

- Docker MySQL 8.4.11 và Redis healthy; kết nối host `localhost:4306` thành công.
- Audit chỉ đọc DB chính trước/sau test: 49 bảng nghiệp vụ, 487 cột, 104 FK,
  65 CHECK enforced, 49 model, 6 migration. Không thấy drift về bảng/cột,
  nullability/default/index/FK target/action/model mapping/checksum; không có orphan.
- API runtime dùng session `+00:00`, SQL clock drift 0 giây; startup gate đạt.
- Full API suite với cả MySQL và Redis bật: **159 file, 625/625 test đạt,
  0 fail, 0 skip, exit 0**, 150.51 giây. Báo cáo máy đọc được nằm trong artifact
  local được ignore: `.local-runtime/backend-audit-api-tests.json`.
- Các GET qua `createApp` + router composition + auth thật + DB chính:
  health/catalog/pickup directory/voucher trả 200; protected branch/order/payment
  methods trả 401 nếu thiếu token, 200 với SUPER_ADMIN context lấy từ DB;
  `product/read?page=0` trả 400. Tổng 13 kiểm tra read/auth/validation đạt.
- Hai request POST chỉ thử parser trên route không tồn tại; không có mutation
  handler nào được gọi. Chúng tái hiện lỗi F5.
- Probe gọi repository thực với MySQL `_test`: 10 trường hợp ảnh và 1 luồng
  payment/hold. Dùng transaction ngoài rollback-only và savepoint cho từng
  repository transaction; mọi fixture/write của probe đã rollback.
- Không gọi VNPay, Cloudinary, email, GHN hoặc Gemini. Callback trong probe bắt
  đầu từ dữ kiện `verified` giả lập tại persistence boundary; không chứng nhận
  hành vi/provider sandbox ngoài hệ thống.
- DB chính sau test vẫn có 2 account, 1 customer, 1 branch, 6 product,
  24 variant/inventory/movement, 6 outbox event; transactional tables vẫn rỗng.

## Lỗi đã xác nhận — theo ưu tiên

### F1 — P1: Checkout sai cách ghi JSON snapshot của ảnh

Vị trí: `order-checkout-v2.repository.ts:35,150` và
`pos-cash-checkout-v2.repository.ts:49,187`.

Hai repository đọc `CAST(p.images AS CHAR)`, parse JSON rồi đưa object/array
trực tiếp vào positional SQL replacement cho `order_items.image_snapshot`.
Sequelize không serialize replacement này thành một JSON document: array được
escape như danh sách SQL; object không phải scalar replacement hợp lệ.

| Giá trị products.images hợp lệ | Online checkout | POS checkout |
|---|---|---|
| SQL NULL | created | created |
| `[]` | ER_PARSE_ERROR | ER_PARSE_ERROR |
| Một URL trong array | ER_INVALID_JSON_TEXT | ER_INVALID_JSON_TEXT |
| `{url, publicId}` trong array — format media upload đang dùng | Invalid replacement | Invalid replacement |
| Hai URL trong array | ER_WRONG_VALUE_COUNT_ON_ROW | ER_WRONG_VALUE_COUNT_ON_ROW |

Đây là **mismatch ở writer backend với cột JSON**, không phải lỗi schema.
Ảnh từ media upload và `clearImages()` sinh ra chính những dạng dữ liệu gây lỗi.
Service hiện che exception thành `checkout_unavailable`, nên UI chỉ thấy lỗi
dịch vụ. Test checkout hiện chủ yếu tạo product với images NULL nên bỏ sót.

Đề xuất: truyền một JSON string hợp lệ (hoặc dùng cơ chế bind JSON rõ ràng),
giữ snapshot không đổi sau khi product được sửa; thêm regression ở cả hai kênh.

### F2 — P1: Đơn đã thanh toán bị kẹt sau deadline giữ hàng

Vị trí: `vnpay-payment-callback-v2.repository.ts:84`,
`inventory-reservation-v2.repository.ts:109`,
`inventory-reservation-expiry-v2.repository.ts:62`,
`order-cancellation-v2.repository.ts:70`.

Reproduction: tạo pickup checkout → reserve payment attempt → áp dụng callback
verified completed → cho deadline giữ hàng trôi qua → nhân viên xác nhận.

Quan sát thực:

```text
callback       = processed / completed
confirmation   = reservation_expired
cancellation   = payment_unresolved
expiry worker  = skipped
DB state       = order pending / payment completed / hold active, expired deadline
```

Callback hiện chỉ ghi payment/event, không chốt vòng đời giữ hàng. Confirmation
primitive vẫn từ chối deadline đã qua, dù order đã đủ tiền và active hold vẫn
được tính vào tồn giữ chỗ. Cancel/expiry từ chối để tránh nhả hàng khi đã thu tiền
— hai guard này đúng về an toàn, nhưng thiếu đường đi tiếp nên đơn bị kẹt.

Test hiện có tái hiện `reservation_expired`, sau đó **sửa expires_at bằng SQL** để
tiếp tục confirm; đây không phải khả năng recovery của ứng dụng.

Đề xuất: phân biệt deadline thanh toán với thời gian nhân viên xử lý. Chỉ cho
luồng đã xác minh đủ tiền tiếp tục với active hold bảo vệ đúng branch/variant/
quantity; giữ guard cho chưa trả/partial/unknown và trường hợp hold thật sự đã
expired/released. Không đổi mọi timeout thành thành công, không nhả pending
payment theo đồng hồ, không gia hạn hàng loạt bằng SQL.

### F3 — P1: Outbox worker không chạy với cấu hình deployment hiện tại

- `compose.yml:56` gọi `npm run outbox:publish`, nhưng package API chỉ có
  `outbox:publish:v2` và `outbox:publish:v2:prod`. Chạy command đã khai báo trả
  `Missing script: outbox:publish` trước bất kỳ DB write nào.
- Runtime image cài production dependencies, nên command cần dùng compiled JS,
  không đổi sang script dev dựa vào `tsx`.
- `compose.production.yml:111` có worker và đúng compiled command, nhưng env
  khai báo cho worker thiếu `V2_OUTBOX_PUBLISHER_ENABLED=true`.
- Worker import connection/logger qua global API env parser. Parse riêng bộ env
  worker production đã khai báo bằng giá trị giả bị từ chối do thiếu các cấu hình
  chỉ dành cho HTTP/API: JWT, reCAPTCHA, email/OTP, VNPay/webhook.
  Image không copy root `.env`, nên `.env` trên host không tự cứu cấu hình này.

Hậu quả: outbox có thể không được publish sang RabbitMQ; chỉ mở Docker hạ tầng
không đồng nghĩa catalog event/indexing đã chạy. Chưa build/up application images
trong lượt audit này; kết luận dựa trên command thực và env parser thực.

Đề xuất: config worker tối thiểu và fail-closed theo đúng runtime, không hạ guard
production của HTTP API, không cấp thêm hàng loạt secret không cần thiết cho worker;
khớp command compiled + enable flag + topology local/production và thêm test wiring.

### F4 — P1 operational: Chưa nối expiry worker vào startup mặc định

`run-inventory-reservation-expiry.ts` có implementation và guard enable, nhưng
không được gọi trong `main.ts`, launcher local, local Compose hoặc production
Compose. `.env.example` cũng chưa mô tả enable flag.

Reservation availability cố ý tính **tất cả active holds**, kể cả deadline đã
qua; chỉ worker được phép đổi status an toàn. Nếu không chạy worker riêng, đơn
bỏ dở không có payment tiếp tục giữ hàng. Đây không phải lỗi của FK hay CHECK.
Không loại trừ người vận hành đã tự chạy worker ở môi trường khác; repository
hiện chưa cung cấp đường khởi động mặc định tương ứng.

Đề xuất: bổ sung cách chạy worker local có quản lý start/stop và service production,
health/progress quan sát được, kiểm thử unpaid hold thực sự được nhả; payment
pending/processing/completed vẫn không được giải phóng tùy tiện.

### F5 — P2: Lỗi client parser bị chuyển thành HTTP 500

Vị trí: `apps/api/src/app.ts:27,54`.

- Body `{` với Content-Type JSON → 500, nên là 400.
- JSON body lớn hơn limit 1 MiB → 500, nên là 413.

Global error handler bỏ qua parser error type/status và chuyển mọi error thành
500. Làm sai error contract, gây retry/alert server-error không cần thiết.

Đề xuất: map allowlist parser errors thành 400/413 với envelope an toàn và request
ID; lỗi nội bộ thật vẫn 500. Không tin status tùy ý từ mọi exception, không trả raw
body hoặc stack cho client.

## Khả năng còn thiếu — không nhầm với schema sai

- **Pickup online chưa có đường HTTP hoàn tất/bàn giao.** Router lifecycle chỉ
  mount confirm/cancel. `consumeOrderReservation()` có primitive nhưng caller
  nghiệp vụ hiện chỉ là POS; chưa có pickup handover/completion command. Có thể
  confirm đơn online nhưng chưa hoàn tất bán hàng và ghi stock movement qua API.
- Delivery có model/repository primitive pending shipment, chưa có checkout và
  carrier lifecycle đầy đủ được mount vào HTTP composition.
- Returns/refunds có schema/model và primitive restock; chưa có full authorized
  eligibility/approve/receive/refund workflow. Không có căn cứ coi các tổng
  return/refund cross-row đã được enforce end-to-end chỉ từ FK/CHECK.
- Chưa có cơ chế reconciliation cho payment pending/unknown lâu dài. Không nên
  sửa bằng cách timeout rồi tự đánh failed: cần policy/provider facts rõ ràng.

Các capability trên là phạm vi sản phẩm cần xác nhận riêng, không tự triển khai
trong audit này. Ưu tiên hoàn tất pickup đang bán trước khi mở delivery/refund.

## Plan và giới hạn

Plan đề xuất nằm ở `tasks/plan.md`, phần **Backend DB readiness — 2026-10-15**;
checklist tương ứng trong `tasks/todo.md`. Chờ phê duyệt trước khi sửa.

Audit dùng skill review/debug/security/planning; checklist security phụ được
tham chiếu tại `.codex/references/security-checklist.md` không tồn tại trên host,
nên dùng hướng dẫn chính, hardening-patterns và repo security rules. Đây không
phải pentest, dependency-advisory audit hay chứng nhận an toàn production.

Không duyệt từng dòng toàn bộ monorepo. Phạm vi đọc sâu: composition, schema/model,
auth context/scoping, checkout/POS/payment callback/attempt, order lifecycle,
inventory reservation/expiry/transfer và các capability missing nói trên. Test
suite phủ thêm catalog, identity, chat, role, transfer và persistence. Main DB
ít dữ liệu nên các invariant scan bằng 0 không tự chứng minh success path.
