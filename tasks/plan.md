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

## Task list

Task chi tiết và trạng thái nằm trong `tasks/todo.md`. Thứ tự task là dependency order; mỗi task
có acceptance/verify và không được bắt đầu khi checkpoint trước chưa đạt.

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
