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
4. **T36.4 — Socket bridge và staff handoff**: thực hiện sau khi common writer,
   role scope và handoff policy đủ test. Socket phải re-authorize mỗi command,
   persist trước emit, không tin room membership. Không sửa Socket legacy trong
   lát nền này; AI worker/assistant run thuộc T37.

Mỗi lát theo RED → GREEN → refactor, có unit và MySQL `_test` thật. Nếu một policy
vận hành (handoff, retention, AI availability) chưa được phê duyệt, V2 giữ factory
unmounted/fail-closed thay vì tự suy đoán hành vi runtime.

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
