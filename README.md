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

Backend được tổ chức theo feature module. Mỗi nghiệp vụ tự sở hữu route, DTO,
controller và service:

```text
apps/api/src/modules/order/
  order.routes.ts
  order.dto.ts
  order.controller.ts
  order.service.ts
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

Khởi tạo schema local **chỉ khi bạn đang tạo database mới**. Migration runner có manifest
đưa các migration tạo bảng legacy lên trước migration timestamp, và đã được rehearsal từ
database MySQL rỗng. Không dùng kết quả này để tự động bootstrap production; production vẫn
cần backup, audit dữ liệu và review theo [Database](docs/database.md).

```powershell
npm run db:migrate --workspace @sales/api
npm run db:migrate:status --workspace @sales/api
npm run db:seed --workspace @sales/api
```

Chạy từng ứng dụng ở ba terminal:

```powershell
npm run dev:web
npm run dev:api
cd apps/ai-service; .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

- Web: `http://localhost:3000`
- API health: `http://localhost:8080/health/live`
- FastAPI/OpenAPI: `http://localhost:8000/docs`

Frontend đọc cấu hình build-time từ file `.env` ở root monorepo. Google OAuth là tùy
chọn ở local: nếu `VITE_GOOGLE_CLIENT_ID` để trống, ứng dụng không khởi tạo Google
Identity Services và ẩn nút Google; đăng nhập/đăng ký thường vẫn được hiển thị. Muốn bật
Google OAuth, đặt OAuth Web Client ID vào biến này rồi khởi động lại `npm run dev:web`.

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

Worker API `outbox-publisher` phát event MySQL đã commit sang RabbitMQ; `ai-catalog-indexer`
nhận event và upsert/delete vector Qdrant. Hai worker là process deploy độc lập, không chạy
trong request HTTP. Qdrant chỉ là read-model: MySQL vẫn là nguồn dữ liệu chuẩn.

### Luồng RAG catalog

Mỗi sản phẩm ngắn được index thành một vector với `name + category + description`; không
chunk máy móc theo từng đoạn. Khi chat, AI kết hợp thứ hạng semantic Qdrant và lexical
TF-IDF (fallback khi Qdrant/embedding lỗi), đọc lại product từ MySQL, rồi chỉ đưa tối đa
`RAG_PRODUCT_LIMIT` product và `RAG_DESCRIPTION_CHAR_LIMIT` ký tự mô tả/product vào Gemini.
Client có thể gửi tối đa 6 lượt lịch sử `{ role: "user" | "assistant", content }`; API
validate trước khi chuyển tiếp. `app/application/chunking.py` chỉ dành cho FAQ, policy hoặc
tài liệu dài khi được bổ sung sau này.

## Database

Tên database mặc định cho môi trường mới là `sale_and_managements_db` (cấu hình qua
`MYSQL_DATABASE`). MySQL chỉ khởi tạo database này tự động khi data volume được tạo lần đầu;
đổi giá trị biến môi trường không đổi tên database bên trong volume đã khởi tạo.

```powershell
npm run db:migrate:status --workspace @sales/api
npm run db:migrate --workspace @sales/api
npm run db:seed --workspace @sales/api
```

> Migration legacy đã replay thành công trên MySQL local chạy với
> `lower_case_table_names=1`. Đây là lớp tương thích cho ứng dụng hiện tại, chưa phải schema
> V2 chuẩn hóa và chưa được phê duyệt để bootstrap production. Hoàn thành checklist trong
> [docs/database.md](docs/database.md) trước mọi thay đổi production.

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

Local có thể để cả `RECAPTCHA_ENABLED=false` và `VITE_RECAPTCHA_SITE_KEY=`. Production phải cấu hình đồng thời site key lúc build web và secret key/hostname ở runtime API; không bật một phía riêng lẻ.

## Docker và triển khai

- `infra/compose.infrastructure.yml`: MySQL, Redis, Qdrant và RabbitMQ cho local/staging.
- `compose.yml`: build ba ứng dụng để rehearsal.
- `compose.production.yml`: chạy ba image immutable; không đóng gói MySQL/Redis.
- `.github/workflows/release-images.yml`: publish image API, web và AI lên GHCR.

Production nên public web/reverse proxy, chỉ expose API qua proxy và giữ AI/MySQL/Redis
trong private network. Xem [hướng dẫn triển khai](docs/deployment.md).

## Trạng thái kỹ thuật

- Source ứng dụng đã chuyển sang TypeScript/TSX hoặc Python; không còn source JS.
- API đã chia theo feature module và có Zod DTO tại HTTP boundary.
- FastAPI strict với Mypy và có test bằng dependency injection.
- Frontend còn 33 file `@ts-nocheck` và một số component quá lớn; đây là technical debt.
- Widget chatbot đã là TSX typed, có trạng thái loading/error và giữ kết quả sản phẩm theo
  từng lượt trả lời; phần màn hình lớn còn lại cần tách dần theo feature.
- Database legacy cần baseline và chuẩn hóa khóa ngoại, index, kiểu tiền trước production.

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
