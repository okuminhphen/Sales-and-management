# Kiến trúc hệ thống

Ngày audit gần nhất: 2026-09-15.

## Quyết định kiến trúc

Hệ thống là modular monorepo gồm ba deployable độc lập: web, API và AI. MySQL/Redis là
hạ tầng riêng. Socket.IO là transport của API, không phải service nghiệp vụ độc lập.

```text
Web React
  ├─ HTTP/Socket.IO -> API Express -> feature services -> Sequelize -> MySQL
  │                               └-> Redis cache/adapter
  └─ POST /api/v1/bot/chat -> API -> FastAPI -> application use cases -> repository/chat ports
                                             ├-> MySQL adapter
                                             └-> Gemini adapter
```

FastAPI không public trực tiếp cho browser. API là BFF/gateway của chat: xác thực boundary
nếu cần, rate limit, timeout upstream và mapping lỗi. `X-Request-ID` được tạo ở API (hoặc
nhận từ reverse proxy), chuyển tới AI service và xuất hiện trong response/log của cả hai.

## Phân bổ thư mục

```text
apps/
  api/src/
    modules/          feature modules
    infrastructure/   SMTP, GHN và provider adapters
    database/         migration/seed runner
    models/           Sequelize model registry (legacy boundary)
    migrations/       lịch sử schema
    config/            cấu hình runtime
    middlewares/       HTTP cross-cutting concerns
    security/          token và security primitives
    routes/api.ts      composition root duy nhất
  web/src/
    components/        UI dùng lại
    pages/             màn hình theo route
    layouts/           bố cục
    services/          HTTP clients
    store/             Redux state
    types/             contract dùng chung
  ai-service/app/
    api/               FastAPI transport
    application/       use case và ports
    domain/            domain models
    infrastructure/    MySQL/Gemini adapters
infra/                 hạ tầng local/staging
docs/                  tài liệu vận hành và kiến trúc
```

## Quy tắc backend

Mỗi capability nằm tại `modules/<feature>` và thường có `<feature>.routes.ts`,
`<feature>.dto.ts`, `<feature>.controller.ts`, `<feature>.service.ts`. Chỉ thêm repository,
port hoặc use-case khi có nhu cầu thật; không tạo folder rỗng để “đủ pattern”.

- Route ghép middleware, authorization, validation và handler.
- DTO validate/coerce input bằng Zod trước controller.
- Controller chuyển HTTP request thành lời gọi service và định dạng response.
- Service chứa nghiệp vụ, transaction và phối hợp persistence/provider.
- Infrastructure chứa adapter nhà cung cấp, không chứa luật nghiệp vụ.
- Module không import controller/router của module khác và không tạo dependency cycle.

`routes/api.ts` chỉ đăng ký router. Request lỗi dùng envelope field-level thống nhất. Các
thao tác order/inventory/payment quan trọng dùng transaction và row lock; actor ID lấy từ
JWT thay vì tin dữ liệu từ browser.

## SOLID và pattern đang áp dụng

- SRP: tách bootstrap, app factory, WebSocket, Redis lifecycle và feature module.
- DIP/Ports and Adapters: AI application phụ thuộc protocol, không phụ thuộc Gemini/MySQL.
- Factory: Express/FastAPI có app factory để test không cần listen port.
- Adapter: Sequelize, Redis, SMTP, GHN, Cloudinary và Gemini nằm ở biên hệ thống.
- Dependency Injection: size module và AI tests dùng fake repository/model.
- Fail-fast configuration: cấu hình được parse và chặn JWT không an toàn ở production.
- Observability: API và AI ghi JSON log có timestamp, level, service, request ID, HTTP status
  và duration; logger che các field bí mật thông dụng. Request body không được log mặc định.

## Kết quả audit toàn project

### Đã đạt

- Monorepo và deploy boundary rõ ràng; không gộp ba runtime vào một process.
- API được phân theo 24 feature, không còn global `controllers`/`services` hay router gom domain.
- FastAPI có strict typing, ports/adapters và test.
- Docker local, production manifest và CI/release workflow đã tách trách nhiệm.
- Source app không còn `.js/.jsx/.cjs`; unit/integration test và build chạy được.

### Chưa đạt hoàn toàn

1. API toàn cục vẫn dùng `strict: false`; nhiều controller/service Sequelize còn implicit `any`.
2. Frontend còn 34 file `@ts-nocheck`, nhiều page/component dài từ 300 đến hơn 1.100 dòng,
   đang trộn UI, form state, gọi API và mapping nghiệp vụ.
3. Frontend còn thiên về technical layer; nên chuyển dần sang
   `features/<feature>/{api,components,hooks,schema,types}` và giữ `shared` cho UI chung.
4. Sequelize models chưa có model/attribute types đầy đủ và nằm ở legacy boundary chung.
5. Migration/database còn rủi ro ghi tại `database.md`; chưa đủ điều kiện khởi tạo DB production mới.
6. Đã có structured log, request ID, timeout AI và rate limit chat qua Redis; vẫn thiếu
   distributed tracing, metrics, dashboard, alert và centralized log storage.

## Roadmap ưu tiên

1. Tạo database baseline v2 từ schema thật, sửa money/FK/index và rehearsal restore.
2. Bật strict TypeScript từng API feature, typed Sequelize repository, sau đó bật strict toàn API.
3. Refactor frontend theo feature, tách component trên 300 dòng, xóa toàn bộ `@ts-nocheck`.
4. Thêm contract test web–API, test transaction/order/payment và WebSocket integration.
5. Thêm distributed tracing, metrics, readiness health và alert; giữ rate limit/chat timeout
   dưới kiểm thử tải.

Kiến trúc hiện tại là nền tảng tốt và deployable, nhưng chưa nên tuyên bố “hoàn tất clean
architecture” trước khi xử lý database, strict typing và frontend decomposition.
