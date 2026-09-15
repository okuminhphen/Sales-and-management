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

Chạy từng ứng dụng ở ba terminal:

```powershell
npm run dev:web
npm run dev:api
cd apps/ai-service; .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

- Web: `http://localhost:3000`
- API health: `http://localhost:8080/health/live`
- FastAPI/OpenAPI: `http://localhost:8000/docs`

`venv` chỉ cần tạo và cài package lần đầu (hoặc sau khi đổi dependency). Khi chạy lại,
gọi trực tiếp Python trong `.venv` như lệnh trên; không bắt buộc activate môi trường.

Có thể rehearsal toàn bộ container bằng `npm run rehearsal:up` sau khi network hạ tầng
được tạo bởi `npm run infra:up`. Một lệnh Compose chỉ là tiện ích local, không có nghĩa
ba ứng dụng bị gộp thành một tiến trình khi deploy.

## Database

```powershell
npm run db:migrate:status --workspace @sales/api
npm run db:migrate --workspace @sales/api
npm run db:seed --workspace @sales/api
```

> Cảnh báo: chuỗi migration legacy chưa replay an toàn trên database rỗng. Không chạy
> migration production trước khi tạo baseline v2 từ schema thật và hoàn thành checklist
> trong [docs/database.md](docs/database.md).

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
Qdrant và RabbitMQ được đưa vào sẵn cho semantic search và tác vụ nền trong các phase tiếp
theo, nhưng chưa có application consumer/producer nên không tạo workload khi bật.

| Service | Cổng localhost | Vai trò |
| --- | --- | --- |
| MySQL | `3306` | Nguồn dữ liệu nghiệp vụ chuẩn |
| Redis | `6379` | Cache, rate limit, Socket.IO adapter |
| Qdrant | `6333` HTTP/dashboard, `6334` gRPC | Vector search cho embedding sản phẩm |
| RabbitMQ | `5672` AMQP, `15672` management UI | Queue cho đồng bộ embedding/retry tác vụ nền |

Qdrant và RabbitMQ chỉ bind vào `127.0.0.1`, yêu cầu credential từ `.env`, có named volume
để giữ dữ liệu local. Qdrant có endpoint liveness `http://localhost:6333/healthz` và dashboard
`http://localhost:6333/dashboard`; RabbitMQ management UI ở `http://localhost:15672`.

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
