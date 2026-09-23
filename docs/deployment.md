# Hướng dẫn triển khai

## Monorepo không đồng nghĩa monolith

Một repository và một lệnh local không biến hệ thống thành một ứng dụng duy nhất. Release
gồm ba image độc lập:

| Image | Runtime | Phạm vi truy cập |
| --- | --- | --- |
| `sales-web` | React static assets qua Nginx/CDN | public |
| `sales-api` | Node.js REST + Socket.IO | qua reverse proxy |
| `sales-ai` | FastAPI chat/recommendation | private, chỉ API gọi |

MySQL, Redis, Qdrant và RabbitMQ là hạ tầng riêng. `compose.yml` chỉ giúp rehearsal nhiều
container.

## Topology khuyến nghị

- Web là immutable static assets sau CDN/Nginx.
- API là stateless container; file upload phải lưu Cloudinary/object storage.
- AI deploy độc lập để scale CPU/RAM và release không ảnh hưởng API.
- Production dùng managed MySQL/Redis có backup, replication, TLS và monitoring. Khi bật
  semantic search hoặc worker, dùng Qdrant/RabbitMQ managed hoặc cluster riêng; không public
  các cổng này ra Internet.
- Reverse proxy `/api`, `/uploads`, `/socket.io` về API để giữ same-origin.

## Rehearsal local

```powershell
Copy-Item .env.example .env
npm run infra:up
npm run rehearsal:up
```

`infra/compose.infrastructure.yml` tạo network `sales-infrastructure`; `compose.yml` cho ba
app tham gia network này. Web chạy cổng 3000, API 8080, AI chỉ expose nội bộ.

## Production trên một VPS

CI publish ba image lên GHCR với Git SHA/tag immutable. Copy file env mẫu và lưu giá trị
thật bằng secret store của server:

```powershell
Copy-Item .env.production.example .env.production
docker compose --env-file .env.production -f compose.production.yml config
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up -d
```

Đặt Caddy/Nginx/Traefik trước `${WEB_BIND_ADDRESS}:${WEB_PORT}` để cấp TLS. Deploy riêng
một thành phần:

```powershell
docker compose --env-file .env.production -f compose.production.yml pull api
docker compose --env-file .env.production -f compose.production.yml up -d --no-deps api
```

Thay `api` bằng `web` hoặc `ai-service`. Database migration là release job one-off, không
chạy tự động khi API startup.

## Managed platform

- Publish `apps/web/dist` lên CDN/static hosting hoặc chạy web image.
- Chạy API và AI thành hai service; chỉ public API, AI ở private network.
- Dùng managed MySQL/Redis và edge routing cho `/api`, `/socket.io`.
- Pipeline nên trigger theo path để thay đổi web không redeploy AI.

## Thứ tự release

1. Backup MySQL; rehearsal forward/rollback migration trên bản sao production. Manifest
   legacy đã chạy được ở local nhưng chưa thay thế baseline V2 hoặc audit dữ liệu thật.
2. Chạy typecheck, unit/integration test và build trong CI.
3. Chạy backward-compatible migration bằng job riêng sau khi có baseline v2.
4. Deploy AI, API, rồi web; kiểm tra `/health/live` sau từng bước.
5. Smoke test login, catalog, cart, checkout, điều chuyển kho, chat, reconnect WebSocket và payment callback.
6. Theo dõi error rate, latency, DB pool, Redis memory, socket connections và provider failures.

Zero-downtime schema dùng expand/migrate/contract: thêm field tương thích, deploy code,
backfill, rồi xóa field cũ trong release sau.

## Checklist bảo mật và scale

- HTTPS; cookie `Secure`, `HttpOnly`, `SameSite`; xoay vòng JWT secret mạnh.
- Secret nằm trong secret manager, không nằm trong image hoặc Git.
- Cấu hình `PAYMENT_WEBHOOK_SECRET`; webhook không chữ ký phải bị từ chối.
- CORS theo allowlist; xác thực Socket.IO handshake và room membership.
- Redis adapter cho nhiều API replica; sticky session nếu còn long-polling.
- Redis phải khả dụng cho rate limit chat hiện tại; đặt `CHAT_RATE_LIMIT_MAX` và
  `CHAT_RATE_LIMIT_WINDOW_SECONDS` theo lưu lượng thực tế. Thêm rate limit riêng cho auth,
  payment và idempotency key cho order/payment callback.
- Chuyển tiếp `X-Request-ID` từ reverse proxy. Thu thập JSON log của `sales-api` và
  `sales-ai-service`; không index request body, token hoặc API key.
- CPU/RAM limits, autoscaling, distributed trace, metrics và alert.
- Thay Multer Cloudinary adapter legacy bằng adapter tương thích Multer 2 trước production.

## Rollback

- Image luôn pin SHA/tag để quay về bản trước.
- Rollback app trước nếu migration còn backward-compatible.
- Không tự động down-migration dữ liệu production; khôi phục backup chỉ theo runbook đã rehearsal.
- Sau rollback phải chạy smoke test và ghi incident timeline.
