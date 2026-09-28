# Kiến trúc hệ thống

Ngày cập nhật: 2026-09-28.

## Tổng quan

HappyShop là modular monorepo nhưng có ba deployable độc lập: Web React, API
Express/Socket.IO và AI FastAPI. MySQL là source of truth nghiệp vụ; Redis phục vụ rate
limit/cache/realtime; RabbitMQ vận chuyển sự kiện catalog đã commit; Qdrant là read-model
vector có thể dựng lại từ MySQL.

```text
Browser/CDN
  └─ Web React
      ├─ REST + Socket.IO ──> API Express ──> Database V2/MySQL
      │                              ├──────> Redis
      │                              └──────> RabbitMQ ──> AI index worker ──> Qdrant
      └─ chat/recommendation ─> API BFF ───> AI FastAPI ──> Gemini/Qdrant/MySQL
```

Browser không gọi FastAPI, Gemini, MySQL hoặc Qdrant trực tiếp. API là trust boundary:
validate DTO, xác thực/ủy quyền bằng trạng thái đọc lại từ Database V2, rate limit, gắn
`X-Request-ID`, áp timeout và chuẩn hóa lỗi upstream.

## Database V2 là runtime duy nhất

Runtime đã cutover sang Database V2 revision 4: 49 bảng nghiệp vụ, 104 khóa ngoại và bảng
metadata `database_v2_migrations`. `main.ts` tạo đúng một `V2Persistence`; startup gate
fail-closed nếu checksum migration, danh sách bảng hoặc metadata không khớp. Không còn
legacy migration, model registry, dual-write, compatibility view hoặc `sync({ alter: true })`.

- ID database dùng `BIGINT` và serialize qua HTTP dưới dạng chuỗi khi có thể vượt giới hạn
  an toàn của JavaScript.
- Tiền dùng `DECIMAL(19,4)`; không tính tiền bằng floating point.
- Order, payment và inventory mutation dùng transaction, row lock, idempotency/outbox phù hợp.
- Migration là release job riêng; API startup chỉ kiểm tra, không tự thay schema.

Chi tiết schema và lệnh vận hành: [Database V2](database-v2/README.md). Lý do cutover:
[ADR-0002](database-v2/adr/0002-database-v2-fresh-cutover.md).

## Phân bổ mã nguồn

```text
apps/
  api/src/
    modules/<capability>/
      application/       use case, port và transaction orchestration
      domain/             rule/value object không phụ thuộc transport
      interfaces/http/    route, DTO, controller/handler
      persistence/        Sequelize repository cho V2
    database/v2/          registry typed, migration, seed, runtime gate
    routes/               composition root V2 theo capability
    workers/              process nền độc lập
    config/               parse/validate cấu hình runtime
    middlewares/          HTTP cross-cutting concerns
    infrastructure/       adapter provider bên ngoài
  web/src/                React UI, service, state và contract parser
  ai-service/app/
    api/                  FastAPI transport
    application/          use case và ports
    domain/               domain model
    infrastructure/       MySQL, Qdrant, RabbitMQ, Gemini adapters
infra/                    MySQL, Redis, Qdrant, RabbitMQ cho local/staging
```

Không ép mọi module phải có đủ folder rỗng. Capability phức tạp dùng các layer trên; module
provider nhỏ có thể phẳng, miễn dependency vẫn hướng vào domain/application. Route chỉ ghép
middleware/validation/handler; DTO Zod `.strict()` chặn field ngoài; luật nghiệp vụ không đặt
trong route.

## Pattern và nguyên tắc

- **SRP:** bootstrap, transport, use case, persistence và worker có vòng đời riêng.
- **DIP/Ports and Adapters:** application phụ thuộc port; provider/ORM là adapter thay thế được.
- **Composition root:** `routes/api-v2.ts` và `main.ts` là nơi wiring dependency, không service locator.
- **Factory/DI:** app/router/use case nhận dependency để unit/integration test không cần listen port.
- **Transactional outbox:** sự kiện chỉ được publish sau khi mutation MySQL commit.
- **Fail closed:** schema sai, access context không hợp lệ hoặc dependency bắt buộc thiếu thì từ chối chạy/thao tác.
- **Observability:** log JSON + request ID; không log body, token, OTP, mật khẩu hoặc API key.

## Ranh giới deploy và scale

Web, API, AI HTTP, outbox publisher, inventory-expiry worker và AI catalog indexer là các
process độc lập. Có thể chạy chung bằng Compose để rehearsal, nhưng production scale/release
từng process. Staff realtime handoff chỉ được bật khi policy/authorization tương ứng hoàn tất;
không nới quyền bằng room membership hoặc payload do client tự khai.

## Technical debt còn lại

1. Frontend còn 31 file `@ts-nocheck` và component/page lớn; nên chuyển dần sang
   `features/<feature>/{api,components,hooks,schema,types}`.
2. Cần bổ sung tracing, metrics, dashboard/SLO và alert ngoài structured log hiện có.
3. Google OAuth V2 và staff Socket handoff còn là capability follow-up; không được giả lập bằng
   đường legacy đã xóa.
4. Trước production với dữ liệu thật phải có backup, rehearsal migration, capacity test và
   runbook rollback; kết quả fresh local không thay thế các bước này.
