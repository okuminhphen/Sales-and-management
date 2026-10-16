# HappyShop — Hệ thống bán hàng và quản lý kho

HappyShop là monorepo gồm website React, API Express/Socket.IO và dịch vụ AI FastAPI.
Các ứng dụng dùng chung một repository để quản lý contract và quy trình phát hành, nhưng
được build, scale và deploy độc lập.

## Thành phần hệ thống

| Thành phần | Công nghệ | Trách nhiệm |
| --- | --- | --- |
| `apps/web` | React 19, Vite, Redux Toolkit, TypeScript | Storefront và trang quản trị |
| `apps/api` | Express, Sequelize, Socket.IO, TypeScript | REST API, xác thực, nghiệp vụ, realtime |
| `apps/ai-service` | FastAPI, SQLAlchemy async, scikit-learn, Gemini | Chat và gợi ý sản phẩm |
| `infra` | MySQL 8.4, Redis 7.4, Qdrant, RabbitMQ, Docker Compose | Hạ tầng local/staging |

## Kiến trúc

```text
Trình duyệt
  └─ Web React/Nginx
      ├─ REST + Socket.IO ──> API Express ──> MySQL
      │                              └──────> Redis
      └─ /api proxy ─────────> API ─────────> AI FastAPI ──> MySQL/Gemini
```

Backend được tổ chức theo capability và dependency direction. Ví dụ commerce tự sở hữu
application use case, HTTP DTO/controller/route và persistence adapter:

```text
apps/api/src/modules/commerce/
  application/
  interfaces/http/
  persistence/
```

Các provider bên ngoài nằm trong `infrastructure`; middleware, security, config và
database là các boundary dùng chung. FastAPI dùng ports-and-adapters để application
không phụ thuộc trực tiếp vào MySQL hoặc Gemini.

Xem chi tiết tại [Kiến trúc](docs/architecture.md), [Database](docs/database.md) và
[Triển khai](docs/deployment.md).

## Yêu cầu môi trường

- Node.js 22 trở lên và npm
- Python 3.12 trở lên
- Docker Desktop/Engine có Docker Compose
- Git

## Chạy local

```powershell
Copy-Item .env.example .env
npm ci
npm run infra:up

cd apps/ai-service
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
cd ../..
```

Khởi tạo Database V2 local sau khi hạ tầng đã sẵn sàng. Runner kiểm tra manifest/checksum,
chỉ áp migration còn thiếu và seed có thể chạy lại an toàn. API không tự migrate khi startup;
nó fail-closed nếu schema không đúng revision đã build. Production vẫn cần backup, audit dữ
liệu và migration job được review theo [Database](docs/database.md).

```powershell
$env:V2_MIGRATIONS_ENABLED='true'
$env:V2_MIGRATIONS_TARGET_DATABASE='sale_and_managements_db'
npm run db:migrate --workspace @sales/api
npm run db:migrate:status --workspace @sales/api
npm run db:seed --workspace @sales/api
```

Chạy từng ứng dụng ở ba terminal:

Trước khi chạy API/AI trực tiếp trên máy, dùng `npm run db:check` để kiểm tra
MySQL theo `.env`. `MYSQL_PORT` phải là cổng Docker publish ra host; cấu hình local
hiện dùng `4306`. Các service trong Docker network vẫn dùng `mysql:3306`.
Launcher cũng kiểm tra kết nối này trước khi mở ứng dụng.

```powershell
npm run dev:web
npm run dev:api
cd apps/ai-service; .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Trên Windows có thể double-click `start-local.cmd` ở root để launcher tự kiểm tra môi
trường, gọi `infra:up` rồi chạy Web/API/AI, outbox và inventory expiry trong năm process
nền. Log riêng của từng service nằm tại `.local-runtime/<Service>.stdout.log` và
`.stderr.log`. Launcher kiểm tra HTTP của ba app và startup marker của hai worker;
hai worker do launcher quản lý dùng `LOG_LEVEL=info` để marker luôn quan sát được.
Dùng `stop-local.cmd` để dừng đúng các process do launcher tạo, có guard PID/start-time;
Docker và dữ liệu trong named volume vẫn được giữ.
Khi muốn dừng cả MySQL, Redis, Qdrant và RabbitMQ, chạy `stop-infrastructure.cmd`;
script này cũng không xóa volume. Launcher không tự migrate, reset, seed database hoặc
cài dependency. Đây chỉ là tiện ích local, không thay đổi topology deploy độc lập.

- Web: `http://localhost:3000`
- API health: `http://localhost:8080/health/live`
- FastAPI/OpenAPI: `http://localhost:8000/docs`

Frontend đọc cấu hình build-time từ file `.env` ở root monorepo. Google OAuth hiện được
đóng fail-closed kể cả khi máy còn `VITE_GOOGLE_CLIENT_ID`: Database V2 chưa có provider
subject bất biến để liên kết account an toàn. Đăng nhập email/mật khẩu và đăng ký OTP vẫn
hoạt động. Chỉ bật lại Google sau một schema revision + account-linking spec riêng.

`venv` chỉ cần tạo và cài package lần đầu (hoặc sau khi đổi dependency). Khi chạy lại,
gọi trực tiếp Python trong `.venv` như lệnh trên; không bắt buộc activate môi trường.

Có thể rehearsal toàn bộ container bằng `npm run rehearsal:up` sau khi network hạ tầng
được tạo bởi `npm run infra:up`. Một lệnh Compose chỉ là tiện ích local, không có nghĩa
ba ứng dụng bị gộp thành một tiến trình khi deploy.

Khi đã đặt `GEMINI_API_KEY`, chạy một lần để index catalog hiện hữu và bật worker đồng bộ:

```powershell
cd apps/ai-service
.venv\Scripts\sales-ai-sync-catalog.exe
cd ../..
npm run rehearsal:up -- --profile ai-indexing
```

Worker API `outbox:publish:v2` phát event MySQL đã commit sang RabbitMQ; `ai-catalog-indexer`
nhận event và upsert/delete vector Qdrant. Hai worker là process deploy độc lập, không chạy
trong request HTTP. Qdrant chỉ là read-model: MySQL vẫn là nguồn dữ liệu chuẩn.

Khi không dùng launcher/Compose, chạy thêm hai terminal worker dưới đây. Cần cả outbox
publisher và expiry worker để event được phát và reservation chưa thanh toán quá hạn
được nhả an toàn. Không chạy thêm host worker khi Compose đã quản lý cùng worker.

```powershell
# Terminal outbox
$env:V2_OUTBOX_PUBLISHER_ENABLED='true'
npm run outbox:publish:v2 --workspace @sales/api

# Terminal expiry riêng
$env:V2_INVENTORY_RESERVATION_EXPIRY_ENABLED='true'
npm run inventory-reservation:expire --workspace @sales/api
```

Local/production Compose đều chạy hai worker bằng compiled JS của image API, với flag
enable tường minh. Production worker chỉ cần cấu hình MySQL, `NODE_ENV`/`LOG_LEVEL` và
RabbitMQ đối với outbox; không cần JWT, email, reCAPTCHA hay VNPay secrets. API HTTP vẫn
giữ các guard production riêng. `outbox.v2.broker_ready` và
`inventory_reservation.expiry_worker_started` cho biết startup; theo dõi thêm
`outbox.v2.event_published`, `inventory_reservation.hold_expired` và log retry/error
để biết tiến độ. Broker readiness không tự chứng minh mọi event đã có consumer binding.

### Luồng RAG catalog

Mỗi sản phẩm ngắn được index thành một vector với `name + category + description`; không
chunk máy móc theo từng đoạn. Khi chat, AI kết hợp thứ hạng semantic Qdrant và lexical
TF-IDF (fallback khi Qdrant/embedding lỗi), đọc lại product từ MySQL, rồi chỉ đưa tối đa
`RAG_PRODUCT_LIMIT` product và `RAG_DESCRIPTION_CHAR_LIMIT` ký tự mô tả/product vào Gemini.
Client có thể gửi tối đa 6 lượt lịch sử `{ role: "user" | "assistant", content }`; API
validate trước khi chuyển tiếp. `app/application/chunking.py` chỉ dành cho FAQ, policy hoặc
tài liệu dài khi được bổ sung sau này.

## Database

Database V2 revision 4 là runtime duy nhất: 49 bảng nghiệp vụ, 104 khóa ngoại và một bảng
metadata migration. API tạo một typed V2 persistence, mount composition V2 và có startup gate
kiểm tra đúng sáu migration/checksum/table allowlist. Migration, model registry, router và
worker legacy đã bị xóa; không còn dual-write hoặc schema compatibility chạy song song.
Integration test dùng database riêng có hậu tố `_test`. Xem
[Database V2](docs/database-v2/README.md), [quy ước database](docs/database.md) và
[checklist](tasks/todo.md).

Tính năng POS đã được gỡ khỏi API và client Web; `POST /api/v1/order/in-store` trả
404. Không có command tạo đơn tại quầy thay thế. Các enum/constraint và read contract
của đơn lịch sử vẫn giữ nguyên trong revision 4 để bảo toàn migration/checksum và dữ liệu.
Kết quả sửa năm lỗi backend và giới hạn nghiệp vụ còn lại được ghi tại
[backend readiness validation](docs/database-v2/backend-readiness-validation.md).

Tên database mặc định cho môi trường mới là `sale_and_managements_db` (cấu hình qua
`MYSQL_DATABASE`). MySQL chỉ khởi tạo database này tự động khi data volume được tạo lần đầu;
đổi giá trị biến môi trường không đổi tên database bên trong volume đã khởi tạo.

```powershell
$env:V2_MIGRATIONS_ENABLED='true'
$env:V2_MIGRATIONS_TARGET_DATABASE='sale_and_managements_db'
npm run db:migrate:status --workspace @sales/api
npm run db:migrate --workspace @sales/api
npm run db:seed --workspace @sales/api
```

> Fresh local cutover không đồng nghĩa production-ready. Database có dữ liệu thật phải được
> backup, inspection, rehearsal forward migration và đối soát trước release; không dùng lệnh
> reset/cutover local cho staging hoặc production.

## Kiểm tra chất lượng

```powershell
npm run typecheck
npm test
npm run build

cd apps/ai-service
ruff check .
mypy app
pytest
```

CI chạy Node typecheck/test/build, Python Ruff/Mypy/Pytest và integration test với MySQL,
Redis bằng container tạm. Hai integration test infrastructure tự bỏ qua ở local nếu chưa
bật `RUN_INFRASTRUCTURE_TESTS=true`.

## Observability và chatbot

- Browser chỉ gọi `POST /api/v1/bot/chat`; không gọi trực tiếp FastAPI hoặc Gemini.
- API chuyển tiếp request tới `AI_SERVICE_URL/chat` với timeout `AI_SERVICE_TIMEOUT_MS` và
  header `X-Request-ID`; FastAPI giữ nguyên ID đó trong response/log để trace một lượt chat.
- API và AI ghi log JSON (không log body request); các key nhạy cảm như token, password và
  API key được che ở lớp logger.
- Chat public được rate limit bằng Redis qua `CHAT_RATE_LIMIT_MAX` và
  `CHAT_RATE_LIMIT_WINDOW_SECONDS`. Redis phải sẵn sàng trong production để giới hạn có hiệu
  lực giữa nhiều API replica.

## Hạ tầng local

`npm run infra:up` khởi động bốn hạ tầng độc lập. Hiện API/AI đã dùng MySQL và Redis;
Qdrant và RabbitMQ được dùng bởi luồng index catalog bất đồng bộ. API ghi transactional
outbox trong cùng transaction với cập nhật catalog; publisher phát `catalog.product.*`, còn
worker AI index vào Qdrant. Khi không cấu hình Gemini, AI vẫn chạy với TF-IDF fallback và
profile `ai-indexing` không cần bật.

| Service | Cổng localhost | Vai trò |
| --- | --- | --- |
| MySQL | `3306` | Nguồn dữ liệu nghiệp vụ chuẩn |
| Redis | `6379` | Cache, rate limit, Socket.IO adapter |
| Qdrant | `6333` HTTP/dashboard, `6334` gRPC | Vector search cho embedding sản phẩm |
| RabbitMQ | `5672` AMQP, `15672` management UI | Queue cho đồng bộ embedding/retry tác vụ nền |

Qdrant và RabbitMQ chỉ bind vào `127.0.0.1`, yêu cầu credential từ `.env`, có named volume
để giữ dữ liệu local. Qdrant có endpoint liveness `http://localhost:6333/healthz` và dashboard
`http://localhost:6333/dashboard`; RabbitMQ management UI ở `http://localhost:15672`.

## Dịch vụ email (Resend) và xác minh OTP

- **Hạ tầng email**: Sử dụng official SDK của **Resend** theo kiến trúc Ports-and-Adapters (`EmailSender` port và `ResendEmailAdapter`).
- **Biến môi trường**:
  - `EMAIL_PROVIDER`: `resend` (mặc định) hoặc `test` (dùng trong kiểm thử không gửi mail thật).
  - `RESEND_API_KEY`: API key từ Resend dashboard (bắt buộc trong production).
  - `EMAIL_FROM`: Địa chỉ người gửi (mặc định `HappyShop <onboarding@resend.dev>`).
  - `OTP_HMAC_SECRET`: Khóa bí mật dùng để tạo HMAC-SHA256 digest của mã OTP (tối thiểu 16 ký tự; bắt buộc thiết lập chuỗi mạnh trong production).
  - `EMAIL_TIMEOUT_MS`: Thời gian chờ tối đa khi gửi email (mặc định `5000ms`).
  - `EMAIL_VERIFICATION_ENABLED`: Bật bắt buộc OTP email ở API; mặc định `true` và không thể tắt trong production.
  - `VITE_EMAIL_VERIFICATION_ENABLED`: Điều khiển bước OTP trên web; phải đồng bộ với API.
  - `RECAPTCHA_ENABLED`: Bật kiểm tra reCAPTCHA tại API; local mặc định `false`, production bắt buộc là `true`.
  - `RECAPTCHA_SECRET_KEY`: Secret key chỉ đặt ở API; không đưa vào frontend hoặc Git.
  - `RECAPTCHA_MIN_SCORE`: Ngưỡng điểm v3 tối thiểu, mặc định `0.5`.
  - `RECAPTCHA_ALLOWED_HOSTNAMES`: Danh sách hostname được phép, phân tách bằng dấu phẩy; production nên cấu hình hostname thật.
  - `RECAPTCHA_TIMEOUT_MS`: Timeout gọi Google siteverify, mặc định `5000ms`.
  - `VITE_RECAPTCHA_SITE_KEY`: Site key public được đóng vào frontend tại build-time. Để trống đồng nghĩa frontend không mount provider.
- **Quy trình xác minh OTP đăng ký**:
  1. Người dùng nhập thông tin đăng ký tại trang web.
  2. Nếu reCAPTCHA bật, frontend lấy token v3 action `register` mới và gửi cùng email tới `POST /api/v1/auth/email-verification/challenges`.
  3. API tự xác minh token với Google (action, score, hostname); chỉ khi hợp lệ mới tạo challenge và gửi mã OTP 6 số. Gửi lại OTP cũng bắt buộc token mới.
  4. Mã OTP được lưu dưới dạng HMAC digest trong Redis (TTL 300 giây / 5 phút, cooldown gửi lại 60 giây, tối đa 5 lần thử sai).
  5. Người dùng nhập OTP; frontend gọi `POST /api/v1/auth/email-verification/challenges/:challengeId/verify` để nhận `verificationToken` dùng 1 lần (TTL 600 giây).
  6. Frontend gọi `POST /api/v1/register` kèm `emailVerificationToken`. Backend claim token, tạo tài khoản và role trong transaction, sau commit mới finalize token.
  7. Email chào mừng được gửi mà không kèm mật khẩu thô của người dùng.

Để tập trung phát triển local mà không gọi dịch vụ ngoài, đặt `EMAIL_PROVIDER=test`,
`EMAIL_VERIFICATION_ENABLED=false`, `VITE_EMAIL_VERIFICATION_ENABLED=false`,
`RECAPTCHA_ENABLED=false` và `VITE_RECAPTCHA_SITE_KEY=`. Khi đó đăng ký tạo tài khoản trực tiếp,
không gửi email và không tạo OTP. Chế độ này chỉ hợp lệ ngoài production; production buộc bật lại
xác minh email và reCAPTCHA ở API, đồng thời cấu hình các biến frontend tương ứng.

## Docker và triển khai

- `infra/compose.infrastructure.yml`: MySQL, Redis, Qdrant và RabbitMQ cho local/staging.
- `compose.yml`: build ba ứng dụng để rehearsal.
- `compose.production.yml`: chạy ba image immutable; không đóng gói MySQL/Redis.
- `.github/workflows/release-images.yml`: publish image API, web và AI lên GHCR.

Production nên public web/reverse proxy, chỉ expose API qua proxy và giữ AI/MySQL/Redis
trong private network. Xem [hướng dẫn triển khai](docs/deployment.md).

## Trạng thái kỹ thuật

- Source ứng dụng đã chuyển sang TypeScript/TSX hoặc Python; không còn source JS.
- API đã cutover hoàn toàn sang Database V2 typed; HTTP boundary dùng Zod DTO strict.
- FastAPI strict với Mypy và có test bằng dependency injection.
- Frontend còn 31 file `@ts-nocheck` và một số component quá lớn; đây là technical debt
  đã được tách khỏi Database V2 cutover, không nên tăng thêm ở feature mới.
- Các UI chưa có policy V2 an toàn (quản trị account/customer, staff chat, xóa branch) đã
  được ẩn; không còn trình bày nút gọi endpoint 404. Voucher admin hiện là read-only.
- Widget chatbot đã là TSX typed, có trạng thái loading/error và giữ kết quả sản phẩm theo
  từng lượt trả lời; phần màn hình lớn còn lại cần tách dần theo feature.
- Database V2 đã chuẩn hóa BIGINT/DECIMAL/FK/index; migration dữ liệu production vẫn cần
  initiative, backup và rehearsal riêng.

## Quy trình Git đề xuất

- `main`: phiên bản ổn định/production.
- `develop`: nhánh tích hợp.
- Feature branch tạo từ `develop`, mở pull request và chỉ merge khi CI xanh.
- Release dùng tag `v*`; image phải pin bằng tag hoặc Git SHA, không dùng `latest`.

## Bảo mật

Không commit `.env`, token, mật khẩu hoặc key provider. Production phải dùng secret manager,
HTTPS, JWT secret mạnh, webhook signature, backup database và giới hạn truy cập Redis/MySQL.

## Giấy phép

Repository hiện chưa khai báo giấy phép mã nguồn mở. Hãy bổ sung `LICENSE` trước khi cho
phép bên thứ ba sử dụng hoặc phân phối mã nguồn.
