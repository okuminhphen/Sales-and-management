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
| API | Full MySQL/Redis V2 suite 156 file; 607 pass, 0 skip |
| API compile | strict typecheck và production build đạt; runtime gate database chính đạt |
| Web | 16 file/67 test, typecheck và production build đạt ở closure 2026-09-28 |
| AI | Ruff sạch, Mypy strict sạch, Pytest 14 pass gồm AI–MySQL integration; 0 skip |
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

## Closure bổ sung ngày 2026-09-28

- Login reCAPTCHA được xác minh trong chính command `/login`, không còn endpoint captcha giả.
- Product admin ghi metadata JSON, variant và media qua contract V2; order admin chỉ dùng
  transition confirm/cancel, không hard-delete hoặc gửi status tùy ý.
- Public voucher directory chỉ trả mã online đang hiệu lực; checkout vẫn kiểm tra scope/quota
  dưới lock. Voucher admin là read-only cho đến khi có promotion lifecycle spec.
- Own-account password change đã có DTO strict, kiểm tra current password và compare-and-swap.
- Writer behavior view/like lấy customer từ V2 access context, ghi event + projection atomically;
  AI personalization tiếp tục đọc projection đã chuẩn hóa.
- Google OAuth, account/customer admin, branch delete và staff chat được ẩn/fail-closed thay vì
  gọi route không tồn tại. Các capability này cần schema/policy riêng, không phải lỗi cutover.
- Regression cuối với hạ tầng thật: API 607/607; Web 67/67; AI 14/14;
  schema validator 7/7; strict typecheck/build và smoke Web/API/AI đều đạt.

## Rủi ro không chặn và follow-up

- Web còn component lớn, 31 file `@ts-nocheck` và cảnh báo chunk hơn 500 kB; cần initiative frontend riêng.
- Google OAuth V2 và staff realtime handoff còn fail-closed/chưa hoàn tất theo policy đã ghi.
- Pytest cảnh báo dependency TestClient cũ; nên theo dõi FastAPI/Starlette/httpx2 trong đợt nâng dependency.
- Qdrant local dùng HTTP với API key nên có cảnh báo insecure; production phải dùng TLS/private network.
- Production audit còn 4 moderate: React Router cần migration major v7; Sequelize kéo `uuid` cũ nhưng
  gợi ý tự động lại downgrade Sequelize về v3. Không dùng `npm audit fix --force`; hai nâng cấp này
  cần compatibility initiative và regression riêng. Full audit có thêm chuỗi Vitest moderate chỉ ở dev.
- Không gửi email Resend thật, gọi Gemini thật hoặc payment/provider thật trong validation tự động.
- Production data migration, load/capacity test, metrics/tracing và disaster recovery rehearsal còn riêng.
