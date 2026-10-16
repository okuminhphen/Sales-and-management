# Frontend ↔ API audit — 2026-10-16

## Kết luận

**Frontend chưa sẵn sàng vận hành đầy đủ.** Các adapter đã khớp nhiều response V2,
nhưng customer auth, payment UX và một form nhân viên có lỗi thực tế. Một số API
backend đã có nhưng UI chưa gọi đủ vòng đời. Không thể kết luận mượt/đủ case chỉ
từ 175 unit/component tests xanh.

Backend checkpoint đã commit/push lên `origin/develop`:
`6645a1c541ea45a862435792628176aef74a75d7` — remove POS + runtime hardening.
Remote SHA đã kiểm tra. Chỉ stage phần xóa POS trong hai Web file; các refactor
contract/layout/UI có sẵn giữ nguyên ngoài commit để audit. Không sửa source ứng
dụng trong lượt audit này; helper/report phục vụ kiểm chứng.

## Môi trường và bằng chứng

- API compiled + router/service/repository V2 thật, Redis local, Web Vite thật.
  Target DB mới `frontend_audit_53dc4e41dd6ab44e_test`, 105 product/variant,
  stock, branch/central, SUPER_ADMIN, CUSTOMER, manager và inventory staff giả.
  Manager được gán permission branch tường minh trong fixture; seed chỉ cấp
  permission cho SUPER_ADMIN. Không suy ra manager production đã cấu hình sẵn.
- Media provider được inject chế độ không upload. VNPay, AI và GHN không gọi ra
  ngoài. Đây không phải provider sandbox hoặc test production deployment.
- Chạy trực tiếp các Web service tới HTTP API qua Axios thực, giữ nguyên request
  interceptor; runner chỉ chọn HTTP adapter Node để không lệ thuộc jsdom XHR.
  Diagnostic Bearer chỉ được thêm ở các case có ghi rõ để tách lỗi auth khỏi lỗi
  payload/response. Đây không phải đường hoạt động hiện tại của UI customer.
- Lượt cuối: **12/12 scenario kiểm chứng đạt, exit 0**, report local
  `.local-runtime/frontend-api-live-tests.json`. Các assertion cố ý xác nhận
  401/403, truncation và mất dữ liệu để chứng minh finding; không phải 12 business
  acceptance flow đều thành công. Một lượt targeted trước đó có 2 pass/10 skip.
- Browser thật: Home, login customer, product detail/add-cart, login admin,
  dashboard/transfer và payment-result URL giả. Login customer thành công nhưng
  chat auto-load và add-cart thất bại; browser log xác nhận 401.
- Home và payment-result được đo ở viewport yêu cầu 320/768/1024/1440px, không
  thấy body tràn ngang. Chưa phải toàn bộ route × viewport × trạng thái.
  Admin transfer desktop có hai h1; chưa có audit axe/screen reader đầy đủ.
- Gate đã chạy trước lượt audit: API 645/645, Web 175/175, typecheck/build đạt.
  Các test Web hiện mock nhiều service nên không bắt được interceptor/seed mismatch.

## Findings cần xử lý

### FUI01 — P1: customer không gửi Bearer; lẫn identity admin/customer

`apps/web/src/middlewares/axiosConfig.ts:11` chỉ lấy `adminToken`, trong khi login
customer lưu `token`. `withCredentials` không giải quyết được: middleware V2 chỉ
đọc Authorization Bearer, không lấy cookie. Có customer token hợp lệ trong
sessionStorage mà cart/profile/order-list/add-cart vẫn trả **401**. Browser login
thật tái hiện chat toast lỗi và không thêm giỏ được.

Khi cả hai session tồn tại, customer request bị gắn admin token: own profile trả
**403**, trong khi admin branch read vẫn 200. Cần client/session boundary tường
minh; không thêm cookie fallback hoặc lấy token bất kỳ để che lỗi.

### FUI02 — P1: sửa nhân viên xóa salary/hiredAt ngoài ý muốn

`apps/web/src/pages/BranchDetail/BranchDetail.tsx:39` luôn gửi `hiredAt: null`,
`salary: null`, nhưng form không có hai trường này và không giữ giá trị cũ.
Live create employee có salary `7500000.0000`, hiredAt `2020-01-01T00:00:00.000Z`,
sửa tên qua đúng mapper/service, đọc lại cả hai thành **null**. Đây là mất dữ liệu
thật, không phải hiển thị; chỉ xảy ra trên fixture cách ly trong audit.

### FUI03 — P1: trang thanh toán tin query string và báo thành công sai

`apps/web/src/components/PaymentStatusPage/PaymentStatus.tsx:42` coi
`responseCode=00` là thành công mà không hỏi server; `status=FAILED` cũng không
ngăn được. Browser mở `/payment-status?orderId=999999&status=FAILED&responseCode=00&amount=129000`
vẫn báo “Thanh toán thành công” dù không có order/payment tương ứng. Không thấy
đường này sửa payment DB hoặc bypass IPN; finding là UX xác nhận tài chính sai.
Ảnh local: `.local-runtime/frontend-payment-false-success.jpg`.

Browser return API hiện trả JSON xác minh/pending; không tự redirect về trang
React này. Cần chốt return/verified-payment-status flow, không nối bằng tham số
URL tùy ý hoặc coi browser return thay cho IPN.

### FUI04 — P1: quyền mặc định CUSTOMER và thao tác đơn hàng không khớp UI

`apps/api/src/database/v2/seed.ts:131` chỉ cấp role_permissions cho SUPER_ADMIN;
`OrderQueryV2Service` yêu cầu `order.read.own`. Đã **đăng ký customer mới qua Web
service thật**, login, gửi Bearer đúng: listOwn vẫn **403**. Detail fixture cũng
403. Đây là khoảng trống provisioning/policy backend phát hiện thêm, độc lập FUI01.

`OrderDetailsPage.tsx:172` hiện nút hủy mọi pending order, nhưng cancel backend
chỉ cho internal staff có `order.manage.*`; customer trực tiếp gọi trả **403**.
Không nới staff guard chung: hoặc ẩn nút chưa hỗ trợ, hoặc duyệt own-cancel policy
và triển khai command kiểm owner/payment/hold riêng.

### FUI05 — P1: checkout hứa thanh toán tại quầy nhưng chưa có nghiệp vụ tương ứng

`PaymentPage.tsx:38` mặc định `PAY_AT_PICKUP`; nhánh này chỉ tạo order rồi đi tới
list, không tạo collection. Live tạo pickup order được, staff confirm trả **409**
vì chưa đủ tiền — đúng guard backend. POS đã bỏ và không có API thu tiền tại quầy
thay thế. Online handover/completion cũng chưa mount. Không thể hoàn tất bán hàng
bằng lựa chọn mặc định hiện tại; không hồi sinh POS để giải quyết.

### FUI06 — P2: danh sách bị cắt, search/KPI sai và N+1 HTTP

`productService.ts:116` chỉ gọi page 1/limit 100, rồi gọi variants riêng cho từng
product. Live: **105 product → UI nhận 100, 101 HTTP request**; một lượt service
local khoảng 133–166 ms, không phải benchmark browser/mạng chậm. Một variant
request lỗi làm Promise.all reject cả list. Home/list/admin dashboard dùng dữ liệu
này; browser KPI hiển thị 100 dù DB có 105. Search/filter/pagination client không
thể tìm các bản ghi ngoài 100 đó.

Order, branch, employee clients cũng cố định trang đầu 100; stock/transfer/chat
chưa nối đầy đủ server pagination/history cursor. Cần giữ pagination metadata,
fetch trang theo UI và tránh tải variants cho mọi card khi không cần.

### FUI07 — P2: API chuyển kho có nhưng UI dừng ở approve

Live manager tạo request → admin approve request → đọc và approve transfer đều
200. Sau approve, browser chỉ có nút xem. Web service/slice chưa gọi dispatch,
complete hoặc xử lý discrepancy, trong khi backend đã có endpoints. Nav chỉ mở
transfer cho SUPER_ADMIN; branch receiving workflow chưa có UI. Không thể hoàn
tất xuất/nhận kho qua giao diện hiện tại.

### FUI08 — P2: checkout recovery và guest-cart continuity chưa kín

Checkout/payment request keys chỉ nằm trong useRef; reload/remount tạo key mới.
Order đã tạo nhưng mất response hoặc lỗi tạo payment URL không có resume/pay-again
ở order detail; cart cũng không được reconcile khi đặt xong. Rủi ro nhiều pending
order/hold khi khách thử lại qua refresh. Đây là phân tích control flow, chưa inject
mất mạng giữa transaction/response trong browser.

Guest cart có helper merge nhưng không có caller trong login; login chỉ fetch
server cart. Cần test guest-add → login → merge/retry và account switch/logout.
Chat clears input ngay khi socket.emit, chưa có acknowledgement/recovery rõ ràng;
chưa test reconnect/offline/late-response đầy đủ trong lượt này.

## Ma trận capability

| Nhóm | Hiện trạng |
| --- | --- |
| Public catalog, detail, pickup directory, banner read | API/adapter hoạt động; pagination/performance còn FUI06 |
| Register/login customer local | Hoạt động; protected requests bị FUI01, own order bị FUI04 |
| Cart/profile/like/customer chat | Payload/response chạy với diagnostic Bearer; UI customer hiện bị chặn auth |
| Order checkout/read/confirm/cancel | Tạo/read admin đạt; default unpaid confirm 409, customer read/cancel 403; thiếu handover |
| Admin auth, branch read/create/update, employee read, inventory | Live đạt; employee edit có FUI02; inventory UI chỉ hiện stock, bỏ reserved/available |
| Stock request/approval + transfer approve | Live đạt tới approve; thiếu dispatch/receive/discrepancy UI |
| Category/size/product metadata/media, banner mutations | Đã đọc call sites/contracts và test có sẵn; chưa click/test live toàn bộ CRUD/upload/provider |
| Role/permissions, manager assignment, employee account-link/transfer | Backend có API; UI chưa có đường sử dụng đầy đủ, RolePage không được mount vào nav hiện tại |
| Notifications | Backend có list/count/mark-read; Web service/component đã bỏ, chưa tích hợp UI thay thế |
| Google OAuth, staff-chat routing, voucher mutations | Đóng/ẩn hoặc read-only theo các checkpoint trước; không gọi là feature hoàn chỉnh |
| Delivery/COD, returns/refunds, address CRUD | Chưa có full workflow ở cả backend/UI; geographic provider lookup không phải address CRUD |
| Newsletter/contact | Nội dung/UX thông báo hoặc mailto; chưa có backend newsletter subscription |

## Giới hạn và đề xuất

Không xác nhận mọi case thực tế: chưa provider sandbox/payment thật, upload thật,
expiry trong browser, mobile device thật, mạng chậm/offline, cross-tab session,
toàn bộ keyboard/screen reader, concurrency UI hay production load. Các mutation
chỉ dùng dữ liệu giả trên DB cách ly; DB chính chỉ được audit đọc.

Cleanup cuối lượt: xác nhận không còn process audit/port 3000/8080 của run,
đã xóa đúng DB test nêu trên và đóng tab/session audit. DB chính kiểm tra lại:
49 bảng, 487 cột, 104 FK, 65 CHECK, 49 model, 6 migration, không drift/orphan;
số dòng vẫn 2 account, 1 customer, 1 branch, 6 product, 24 variant/inventory/
movement và 6 outbox; không có order/payment/reservation mới.

Ưu tiên sửa FUI01–FUI05 trước, sau đó server pagination/N+1, transfer lifecycle UI
và checkout/cart recovery. Handover/payment status/reconciliation, own-cancel và
role baseline cần chốt policy/API scope cụ thể; kế hoạch tại `tasks/plan.md`, mục
Frontend API readiness. Chưa có approval triển khai các feature mở rộng đó.
