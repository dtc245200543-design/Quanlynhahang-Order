# Đề tài 12 — Hệ thống Quản lý Nhà hàng / Order

Ứng dụng quản lý thực đơn, bàn và đơn hàng. Dự án triển khai bằng Docker Compose, dùng PostgreSQL để lưu dữ liệu, Nginx làm reverse proxy, Prometheus/Grafana giám sát và Loki/Promtail tập trung nhật ký.

## Thành phần

| Thành phần | Vai trò | Địa chỉ mặc định |
|---|---|---|
| Website qua Nginx | Giao diện và API gọi món | <http://localhost:8080> |
| pgAdmin | Quản trị PostgreSQL | <http://localhost:5050> |
| Prometheus | Thu thập metrics | <http://localhost:9090> |
| Grafana | Dashboard và truy vấn log | <http://localhost:3001> |
| PostgreSQL, Loki | Database và lưu log | Chỉ truy cập nội bộ Docker |

Các cổng quản trị chỉ bind vào máy local. PostgreSQL không mở cổng trực tiếp ra host.

## Yêu cầu

- Docker Desktop hoặc Docker Engine có Docker Compose v2.
- Git để lấy mã nguồn.
- Trên Windows, khởi động Docker Desktop ở chế độ Linux containers.

## Cấu hình và chạy

Tại thư mục gốc, tạo `.env` từ mẫu:

```powershell
Copy-Item .env.example .env
notepad .env
```

Thay tất cả giá trị `REPLACE_WITH_...` bằng mật khẩu riêng, mạnh và không dùng lại. Không chia sẻ hoặc commit `.env`; file này đã được loại trừ trong `.gitignore`.

Khởi động và kiểm tra các dịch vụ:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
```

Mở website tại <http://localhost:8080>. Thông tin đăng nhập pgAdmin và Grafana được cấu hình trong `.env`. PostgreSQL lưu dữ liệu trong Docker named volumes.

## Demo chức năng

1. Xem thực đơn, bàn, đơn hàng và số liệu tổng quan trên website.
2. Thêm món vào đơn, chọn bàn trống, chỉnh số lượng và xác nhận tạo đơn.
3. Cập nhật trạng thái đơn: **Chờ xử lý → Đang chuẩn bị → Sẵn sàng → Hoàn thành**. Có thể hủy đơn trước khi hoàn thành.
4. Mở pgAdmin, đăng nhập bằng thông tin trong `.env`, chọn server **Restaurant PostgreSQL**. Lần đầu kết nối, nhập mật khẩu `DB_PASSWORD`.

Một số API chính: `/api/menu`, `/api/tables`, `/api/orders`, `/api/summary`.

## Giám sát và nhật ký

- Prometheus thu thập metrics ứng dụng, Nginx, PostgreSQL và container. Trong **Status → Targets**, các target cần ở trạng thái `UP`.
- Grafana có dashboard **Restaurant - System Overview** và datasource Prometheus/Loki được cấu hình sẵn.
- Xem log tại Grafana → **Explore** → datasource **Loki**. Ví dụ truy vấn:

```logql
{service="nginx"}
```

```logql
{service="app"} |= "Lỗi"
```

## Lệnh vận hành

```powershell
docker compose logs -f app
docker compose logs -f db
docker compose logs -f promtail loki
docker compose restart app
docker compose down
```

`docker compose down` giữ lại dữ liệu. **Không chạy `docker compose down -v` nếu cần giữ database hoặc dữ liệu giám sát**, vì lệnh này xóa các volumes.

## Bảo mật

- Mật khẩu được lấy từ `.env`; `.env.example` chỉ chứa giá trị mẫu.
- PostgreSQL không publish cổng ra host; các giao diện quản trị mặc định chỉ mở trên loopback.
- Ứng dụng chạy bằng user không phải root; Nginx cấu hình security headers và giới hạn tốc độ API.
- Promtail cần quyền đọc Docker socket và cAdvisor cần quyền truy cập thông tin container. Chỉ chạy stack trên máy tin cậy; không đưa các giao diện quản trị ra Internet nếu chưa cấu hình TLS, firewall và xác thực phù hợp.

## Lịch sử commit trên `main`

Tên bên dưới khớp với các commit đã đẩy lên `origin/main`:

| Commit | Thông điệp |
|---|---|
| `c8dea31` | `feat: triển khai ứng dụng quản lý nhà hàng với PostgreSQL và Nginx` |
| `55b0ace` | `feat: bổ sung Prometheus và Grafana để giám sát hệ thống` |
| `b6dae4b` | `feat: tích hợp Loki và Promtail để tập trung nhật ký hệ thống` |
| `460c221` | `docs: bổ sung hướng dẫn triển khai và báo cáo thực hành` |
| `aa7ca8b` | `feat: làm mới giao diện ứng dụng nhà hàng` |
| `c92b82c` | `style: chuẩn hóa bảng màu giao diện nhà hàng` |
| `af994ab` | `feat: hoàn thiện luồng gọi món và quản lý đơn hàng` |

## Báo cáo và cấu trúc

Khung báo cáo môn học nằm tại [report/BAO-CAO.md](report/BAO-CAO.md). Bổ sung thông tin cá nhân và ảnh chụp minh chứng thật sau khi chạy hệ thống.

```text
app/                 Ứng dụng Express, API, giao diện và Dockerfile
database/            Khởi tạo schema, dữ liệu và role PostgreSQL
nginx/               Reverse proxy và cấu hình bảo mật
pgadmin/             Cấu hình server PostgreSQL
prometheus/          Cấu hình thu thập metrics
grafana/             Datasource và dashboard
loki/ promtail/      Lưu trữ và thu thập log
docker-compose.yml   Khai báo dịch vụ, network và volumes
report/              Khung báo cáo thực hành
```
