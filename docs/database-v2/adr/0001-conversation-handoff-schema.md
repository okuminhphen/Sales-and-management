# ADR-0001 — Hội thoại chung và tiếp quản chatbot

## Trạng thái

Accepted for schema design — 2026-09-22.

## Bối cảnh

HappyShop cần bot và nhân viên thay phiên trả lời trong cùng một lịch sử hội thoại. Mô hình đơn
giản chỉ có `bot_enabled` hoặc `messages.read_at` không biểu diễn được đầy đủ trạng thái chờ,
tiếp quản, audit, nhiều người đọc và cơ chế chống worker AI trả lời sau khi nhân viên tiếp quản.

## Quyết định

Mở rộng `conversations` và `messages`; bổ sung `conversation_events`,
`conversation_read_states` và `assistant_runs` trong
[`target-schema.dbml`](../target-schema.dbml). MySQL vẫn là nguồn dữ liệu chính. Vòng đời hội
thoại, quyền trả lời, audit nội bộ và lượt chạy AI là các trách nhiệm tách biệt.

## Hệ quả

Foreign key và check constraint chỉ bảo vệ cấu trúc. Authorization, quan hệ cùng hội thoại,
active uniqueness, read bounds và concurrent worker fencing còn cần được thực thi ở application
service/transaction và integration test. Production cần một kế hoạch migration/backfill/retention
riêng.
