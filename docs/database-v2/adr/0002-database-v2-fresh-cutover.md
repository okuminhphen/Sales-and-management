# ADR-0002 — Database V2 fresh-database compatibility-first cutover

## Trạng thái

Accepted — 2026-09-23.

## Bối cảnh

Schema legacy có thể replay nhưng identity bị chia tách, naming không nhất quán, tiền dùng
`FLOAT` và database constraint chưa đầy đủ. Database V2 revision 4 định nghĩa 49 bảng nghiệp vụ,
104 quan hệ. Database local hiện tại được xác nhận là database mới, không có dữ liệu người dùng
cần bảo toàn.

## Quyết định

- Xây dựng và kiểm chứng V2 trước trên MySQL database `_test` tách biệt.
- Refactor backend sang persistence V2 có type, ưu tiên giữ public API contract hiện tại.
- Chỉ cập nhật Web/AI contract thực sự cần thiết.
- Tại checkpoint cuối có guard, reset đúng database local development đã chỉ định, chạy V2
  baseline và seed, rồi loại migration/model legacy khỏi runtime source.
- Trạng thái cuối có một physical schema và một write path; không duy trì dual-write hay
  compatibility view.
- Migration/backfill production hoặc staging là initiative riêng, bắt buộc có backup,
  reconciliation và rollback.

## Hệ quả

Cutover chỉ diễn ra sau khi các capability checkpoint đạt yêu cầu. `BIGINT` và `DECIMAL` cần
contract serialize rõ ràng xuyên API/Web. Thành công trên local không đồng nghĩa production-ready;
Git history lưu implementation legacy thay vì giữ bản sao legacy trong runtime source.
