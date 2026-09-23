# Follow-up không chặn Database V2 cutover

## Resend Email và OTP

- [ ] Chạy OTP concurrency/infrastructure suite với Redis thật và database `_test`; suite không được skip.
- [ ] Kiểm chứng live delivery Resend tới recipient test được người dùng cấu hình rõ ràng; không gửi
  email thật tới địa chỉ tùy ý và không ghi recipient/secret vào source hoặc log.

Hai mục này được chuyển từ plan OTP ngày 2026-09-23 theo phê duyệt của người dùng. Chúng không
chặn Database V2 compatibility-first nhưng vẫn phải hoàn thành trước khi tuyên bố email production-ready.

## Dependency security debt

- [ ] Trước khi deploy production, refactor chuỗi upload Cloudinary và nâng dependency an toàn sau
  khi có regression test. `npm audit --omit=dev` ngày 2026-09-23 báo 2 high tại `cloudinary` và
  `multer-storage-cloudinary`; remediation hiện tại là breaking change nên không được tự động
  `audit fix --force`. Review chậm nhất: 2026-09-30.
- [ ] Triage và lên lịch nâng các runtime dependency moderate còn lại: Express/`qs`, React Router
  và Sequelize/`uuid`. Review chậm nhất: 2026-10-07.

`@dbml/core@10.1.1` và `@dbml/parse@10.1.1` được thêm ở T02 không xuất hiện trong advisory report.
