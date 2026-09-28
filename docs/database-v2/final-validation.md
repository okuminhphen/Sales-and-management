# Báo cáo kiểm chứng cuối Database V2

Ngày: 2026-09-28. Nhánh: `develop`. Phạm vi: T45–T48 sau cutover fresh local.

## Kết luận

Database V2 revision 4 đã đạt acceptance cho môi trường local: runtime chỉ còn một schema,
một persistence registry và một write path. Không còn migration/model/router legacy được Git
theo dõi hoặc đóng gói trong `dist`. Không còn finding critical/high mở chặn local cutover hoặc
việc tiếp tục phát triển trên nhánh `develop`.

Kết quả này không tự động chứng nhận migration dữ liệu staging/production. Môi trường có dữ
liệu thật vẫn cần backup, inspection, rehearsal và rollback runbook riêng.

## Evidence

| Cổng kiểm chứng | Kết quả |
| --- | --- |
| Database chính | 50 bảng vật lý = 49 nghiệp vụ + metadata; 104 FK; 6 migration; zero pending |
| Seed nền | 6 role, 37 permission, 3 payment method; integration test idempotency/concurrency đạt |
| Schema artifact | Revision 4, checksum hợp lệ, 49 bảng/104 quan hệ; validator 7/7 đạt |
| API | Full MySQL V2 suite 152 file; 590 pass/4 skip có chủ đích; Redis OTP focused 8/8 đạt |
| API compile | strict typecheck và production build đạt; runtime gate database chính đạt |
| Web | 16 file/65 test, typecheck và production build đạt |
| AI | Ruff sạch, Mypy strict sạch, Pytest 12 pass/2 opt-in skip; AI–MySQL focused 2/2 đạt |
| Deployment | Compose production config hợp lệ; worker outbox trỏ artifact V2; API image build lại thành công và có DBML/manifest |
| Dependency production | `npm audit --omit=dev`: 0 critical/high; chuỗi `qs`/`body-parser` đã vá |
| Legacy scan | 0 tracked file trong `src/models` và `src/migrations`; `dist/models` không tồn tại |

## Finding đã sửa trong review

1. CLI migrate/seed mặc định từng dùng guard chỉ dành cho `_test`; nay deployment target phải
   khớp chính xác `MYSQL_DATABASE`, còn runner integration có entrypoint riêng và vẫn bắt buộc `_test`.
2. Alias `db:migrate:undo` gọi lệnh V2 không hỗ trợ đã bị xóa; migration production là forward-only.
3. Compose production từng gọi outbox worker legacy đã xóa và image thiếu schema manifest;
   command/image hiện dùng đủ artifact V2.
4. AI từng serialize `BIGINT` ID thành JSON number và `DECIMAL` thành float; public recommendation
   payload nay dùng chuỗi chính xác. Web không gửi `userId` cho personalized recommendation nữa;
   API lấy account từ access context đã xác thực.
5. Output từ LLM và AI service từng được tin trực tiếp. Application AI nay chỉ chấp nhận ID nằm
   trong tập RAG rồi hydrate lại tên/giá/ảnh từ domain catalog; Node API validate strict toàn bộ
   chat/recommendation response bằng Zod và fail-closed `502` nếu upstream sai contract.
6. Đã bỏ adapter Cloudinary không dùng, nâng Cloudinary/Multer/Express và áp dụng bản vá
   `body-parser`/`qs` không breaking. Image API được build lại sau thay đổi dependency.

## Rủi ro không chặn và follow-up

- Web còn component lớn, `@ts-nocheck` và cảnh báo chunk hơn 500 kB; cần initiative frontend riêng.
- Google OAuth V2 và staff realtime handoff còn fail-closed/chưa hoàn tất theo policy đã ghi.
- Pytest cảnh báo dependency TestClient cũ; nên theo dõi FastAPI/Starlette/httpx2 trong đợt nâng dependency.
- Qdrant local dùng HTTP với API key nên có cảnh báo insecure; production phải dùng TLS/private network.
- Production audit còn 4 moderate: React Router cần migration major v7; Sequelize kéo `uuid` cũ nhưng
  gợi ý tự động lại downgrade Sequelize về v3. Không dùng `npm audit fix --force`; hai nâng cấp này
  cần compatibility initiative và regression riêng. Full audit có thêm chuỗi Vitest moderate chỉ ở dev.
- Không gửi email Resend thật, gọi Gemini thật hoặc payment/provider thật trong validation tự động.
- Production data migration, load/capacity test, metrics/tracing và disaster recovery rehearsal còn riêng.
