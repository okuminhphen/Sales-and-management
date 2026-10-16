# Backend readiness — kiểm chứng 2026-10-16

Phạm vi đã duyệt: gỡ POS và sửa năm finding trong
[audit 2026-10-15](backend-audit-2026-10-15.md). BR00–BR07 đã triển khai và kiểm chứng.
Schema revision 4, migration/checksum và dữ liệu nghiệp vụ chính được bảo toàn.
Các capability chưa triển khai được ghi cuối báo cáo.

## Kết quả

| Mục | Hành vi sau sửa | Bằng chứng |
| --- | --- | --- |
| Bỏ POS | Gỡ service/repository/DTO/controller/router, Web service/thunk/input/receipt types; POST /api/v1/order/in-store trả 404 | Composition regression, API/Web suites, typecheck/build |
| F1 — ảnh checkout | Ghi JSON text scalar, hỗ trợ NULL, mảng rỗng, URL array và media asset array; catalog đổi không đổi snapshot | 4 regression ảnh mới trên MySQL |
| F2 — paid hold | Đủ tiền verified, không còn pending/processing và active hold đúng nguồn thì confirm được sau deadline; không hồi sinh hold đã finalized | 11 regression full/partial/unpaid/unresolved, replay, late callback và race |
| F3 — outbox | Config worker tách HTTP, command compiled và flag rõ ràng trong hai Compose | Config/wiring tests và compiled worker → RabbitMQ → published_at thật |
| F4 — expiry | Service mặc định trong hai Compose, process riêng do host launcher quản lý | Integration, compiled worker smoke và launcher tests |
| F5 — parser | Malformed JSON → 400/INVALID_JSON, quá 1 MiB → 413/PAYLOAD_TOO_LARGE, internal error vẫn 500 | App regression và HTTP probes, response an toàn có request ID |

Đã xóa 5 file implementation POS và 3 file test riêng của feature đã bỏ; source
có thể khôi phục từ Git history. Không xóa order/payment lịch sử hay payment method
CASH. Enum/read contracts `in_store`/`carry_out` và constraint cũ giữ nguyên để bảo
toàn migration/checksum và dữ liệu lịch sử; không có đường tạo giao dịch POS mới.
Seed không còn mô tả máy POS.

Payment/inventory tiếp tục dùng transaction và row locks. Confirmation kiểm tra
lại payment/hold dưới lock; expiry/cancellation vẫn chặn payment chưa rõ kết quả
hoặc đã thu tiền. Không sửa `expires_at` bằng SQL để test qua, không tự đánh failed
cho pending payment theo đồng hồ.

Worker chỉ đọc runtime/DB config, không kéo HTTP parser qua logger/connection.
API vẫn giữ JWT/email/reCAPTCHA/payment production guards. Compiled worker smoke
cố ý cấp HTTP settings không hợp lệ và hai worker vẫn thực hiện công việc.

Review bổ sung đã bắt và sửa hai lỗi vận hành: thiếu tên service AI indexer trong
production Compose, và readiness marker bị `LOG_LEVEL=warn/error` che mất. Cả hai
có kiểm tra thất bại trước sửa. Host launcher đặt `LOG_LEVEL=info` cho hai worker
nó quản lý, giữ mức log API/Web/AI và redirect log riêng.

## Kiểm chứng

Full suites hoàn tất 2026-10-15; tiếp tục kiểm chứng worker/HTTP/DB/launcher vào
2026-10-16 sau usage limit. JSON reports local được ignore tại `.local-runtime/`.

- API: **158 file, 645/645 test đạt, 0 fail, 0 skip**, `success: true` trong
  `backend-readiness-api-tests.json`; bật MySQL V2 và infrastructure tests,
  target `sale_and_managements_db_test`, host port 4306.
- Web: **67 file, 175/175 đạt, 0 fail, 0 skip**, `success: true` trong
  `backend-readiness-web-tests.json`; một fork worker để tránh lỗi đồng bộ
  Vitest/Tooltip đã gặp trên host khi dùng nhiều worker.
- `npm run typecheck`: API, strict API và Web đạt, exit 0.
- `npm run build`: API/Web đạt, exit 0; Vite còn warning React chunk 524.77 kB.
- `npm run test:local:launcher`: **16/16 đạt**, exit 0; parse PowerShell,
  PID/start-time ownership, worker wiring và chạy service host với npm giả lập
  từ mức log warn/error.
- `start-local.ps1 -CheckOnly`: preflight Docker, dependency, port và MySQL
  localhost:4306 đạt, exit 0; không khởi động app/worker hay migrate/seed.
- `npm run db:v2:validate`: revision 4, 49 bảng/104 refs, checksum đúng, exit 0.
- `npm run test:db:v2`: **7/7 đạt**, exit 0.
- `docker compose --env-file .env.production.example -f compose.production.yml config --quiet`
  và `docker compose -f compose.yml config --quiet`: đạt, exit 0; không deploy.
- Compiled production outbox: queue nhận đúng event ID/payload, `published_at`
  được ghi, attempts = 1. Compiled expiry: unpaid hold quá hạn → expired, có
  released_at, stock vẫn 2, order pending. Hai process đã dừng; DB mới
  `sales_worker_782d8340ba703d3c_test` và vhost `codex-worker-782d8340ba703d3c`
  do run tạo đã xóa, cleanup PASS, exit 0. Không publish outbox chính.
- Main HTTP composition: **13 GET/auth/validation + 2 parser checks đạt**,
  exit 0; startup gate đạt, session +00:00, SQL clock drift 0 giây. Không gọi
  mutation handler hay provider thật.
- Main DB read-only audit: 49 bảng nghiệp vụ, 487 cột, 104 FK, 65 CHECK enforced,
  49 model, 6 migration; không drift bảng/cột/default/index/FK/checksum/model,
  không orphan hoặc mismatch trong các invariant scan đã ghi ở audit.
  Vẫn 2 account, 1 customer, 1 branch, 6 product, 24 variant/inventory/movement,
  6 outbox; order/payment/reservation/return/refund vẫn rỗng.

## File và vận hành

Source chính: các config load-env/runtime-env/database-env/worker-env, DB connection
và runtime, logger, app error boundary, order checkout/confirmation và inventory
reservation repositories, hai worker entrypoint, hai Compose manifests,
scripts/local-dev, order service/slice/types Web và regression suites tương ứng.
Không thêm dependency, thay schema, gọi provider hay commit/push; giữ các thay đổi
UI/auth có sẵn trong working tree.

Launcher chạy nền năm process, log tại `.local-runtime/<Service>.stdout.log` và
`.stderr.log`; stop-local dừng đúng process tree theo PID/start-time. Chạy thủ công
phải bật flag ở terminal worker riêng, theo README. Không chạy trùng host/Compose.
Startup marker chỉ cho biết startup; theo dõi publish/expiry progress, retry/error
và outbox backlog, khai báo consumer binding cho event cần dùng. Outbox dùng
at-least-once; consumer phải idempotent.

## Giới hạn và bước tiếp theo

Chưa smoke toàn bộ launcher với DB chính vì worker có thể publish outbox chính;
đã kiểm chứng compiled workers bằng DB/broker cách ly và service host bằng
subprocess giả lập. Chưa build/up Docker application images hoặc deploy production;
Compose parsing và compiled entrypoint được kiểm tra riêng. Chưa chạy provider
sandbox VNPay/GHN/email/Cloudinary/Gemini, browser UI hoặc dependency-advisory audit.
DB chính ít dữ liệu; zero mismatch không thay thế success/race tests cách ly.

**BR08 còn cần đặc tả riêng:** online pickup chưa có HTTP handover/completion để
consume hold, ghi stock movement và hoàn tất order trong một transaction; chưa có
reconciliation cho payment pending/unknown lâu dài. Delivery/COD, returns/refunds
và customer-address CRUD chưa có full HTTP workflow. Không coi toàn bộ vòng đời
bán hàng end-to-end đã hoàn thiện chỉ từ 645 test hoặc schema khớp. Có thể đối chiếu
frontend với contract hiện có; cần chốt pickup completion và reconciliation trước
khi tuyên bố vận hành bán hàng đầy đủ.
