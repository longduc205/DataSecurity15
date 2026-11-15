# Hướng dẫn demo và ôn tập bảo vệ – Đề 7

Tài liệu cho cả nhóm. Đọc phần chung trước, sau đó đọc kỹ phần của mình (A, B hoặc C).

---

## Phần 1. Chạy demo

### Chuẩn bị

**Vài ngày trước buổi bảo vệ (người giữ máy demo):**
1. Mở Supabase Dashboard. Nếu project báo đang tạm dừng thì bấm khôi phục, rồi đợi trạng thái hết "Coming up...".
2. Chạy `npm run demo -- all`. Nếu mọi dòng đều `[PASS]` thì máy đã sẵn sàng.
3. Quay một video demo đầy đủ để dự phòng.

**Sáng hôm bảo vệ:**
- Chạy thử `npm run demo -- tls` bằng mạng ở trường. Nếu bị lỗi kết nối hoặc timeout, Wi-Fi có thể đang chặn cổng 5432: chuyển sang 4G phát từ điện thoại.
- Phóng to chữ terminal (`Ctrl` + `+`) cho cả phòng đọc được.
- **Không mở file `.env` trên màn hình chiếu**, vì trong đó có mật khẩu và khóa mã hóa.

### Lệnh demo

Mỗi bước chạy độc lập. Lệnh demo không ghi đè bằng chứng đã dùng trong báo cáo.

| Bước | Lệnh | Người | Chỉ vào điều gì trên màn hình |
|---|---|---|---|
| 0 | (slide) | C | Kịch bản phòng khám, Hình 1 kiến trúc, các lớp bảo vệ |
| 1 | `npm run demo -- tls` | A | `TLSv1.3`; kết nối không mã hóa bị từ chối với `SSL connection is required` |
| 2 | `npm run demo -- api` | A | Anon key gọi vào schema `clinic` nhận HTTP 406. Bảng đối chứng không có RLS thì đọc được ngay (HTTP 200) |
| 3 | `npm run demo -- rbac` | B | `permission denied`, mã lỗi 42501, với lễ tân, bác sĩ khi xóa, DBA khi sửa |
| 4 | `npm run demo -- rls` | B | Cùng một câu lệnh: `doctor_a` thấy 100 dòng của bác sĩ 1, `doctor_b` thấy 100 dòng của bác sĩ 2 |
| 5 | `npm run demo -- mask` | B | Lễ tân thấy `*******181`, bác sĩ thấy số thật |
| 6 | `npm run demo -- enc` | B | DBA chỉ thấy chuỗi Base64 vô nghĩa; client có khóa giải mã được; sửa 1 bit thì bị từ chối |
| 7 | `npm run demo -- audit` | A | Mọi dòng đều `FOUND` với đúng tên role |
| 8 | (slide) | C | Bảng 11: mỗi biện pháp ngăn được gì, không ngăn được gì. Các hạn chế |

**Lưu ý:**
- Chạy bước 7 **sau** các bước 3–6 và chờ khoảng 1 phút, vì log cần thời gian để vào hệ thống.
- **Không demo trực tiếp phần chặn IP (T1.4):** bài này chặn mọi kết nối database trong 1–2 phút. Thay vào đó, trình bày Hình 4 trong báo cáo.
- Nếu một bước lỗi khi đang demo, đừng sửa tại chỗ: chuyển sang video dự phòng hoặc hình tương ứng trong báo cáo.
- Có thể mở thêm **Table Editor** trên Supabase Dashboard để cho thầy thấy cột `national_id_enc` và `diagnosis_enc` chỉ chứa bản mã.

---

## Phần 2. Kiến thức cả nhóm phải nắm

Đây là những ý ai cũng phải nói được, vì thầy có thể hỏi bất kỳ ai.

1. **Đề tài làm gì:** dựng một database thật trên đám mây (Supabase, PostgreSQL), áp dụng nhiều lớp bảo mật, rồi chứng minh bằng thử nghiệm tự động. Kết quả: 24/24 thử nghiệm đạt.
2. **Vì sao dùng Supabase mà không dùng Azure:** đăng ký Azure for Students không thành công. Supabase có gói miễn phí, là PostgreSQL thật chạy trên Internet. Azure và AWS chỉ được so sánh qua tài liệu (Bảng 4).
3. **Mô hình trách nhiệm chung:** nhà cung cấp lo hạ tầng; khách hàng luôn chịu trách nhiệm về dữ liệu, tài khoản, quyền truy cập và cấu hình. Phần lớn sự cố đến từ cấu hình sai của khách hàng.
4. **Phòng thủ theo chiều sâu:** không biện pháp nào đủ một mình. Mỗi lớp chặn được một số mối đe dọa và để hở một số khác (Bảng 11).
5. **Dữ liệu là giả:** 200 bệnh nhân giả. Số điện thoại bắt đầu bằng `000`, số CCCD bắt đầu bằng `999`, email dùng `example.com`.
6. **Năm role:** `doctor_a`, `doctor_b`, `receptionist`, `db_admin`, `auditor`. Mỗi role được gì, bị chặn gì: xem Bảng 7.
7. **Phát hiện đáng chú ý nhất:**
   - Role `postgres` có `BYPASSRLS`, nên RLS không chặn được nó.
   - Lệnh bị từ chối quyền không xuất hiện trong pgAudit mà chỉ có trong log lỗi của Postgres.
   - Chỉ một lệnh `GRANT` nhầm là một bảng có thể bị công khai qua REST API.

---

## Phần 3. Kiến thức riêng từng người

### A – Đám mây và giám sát (mục 3.2, 3.3, 3.8, 3.9, 3.10)

**Cần hiểu:**
- **TLS:** mã hóa đường truyền giữa client và server.
  - Server phải bật chế độ bắt buộc SSL, nếu không client vẫn có thể kết nối không mã hóa.
  - Mã hóa chưa đủ: client còn phải xác minh chứng chỉ (`verify-full`) để chống giả mạo server. Đây là hạn chế của nhóm.
- **Danh sách IP (Network Restrictions):** chỉ áp dụng cho kết nối database, **không áp dụng cho REST API**. Thử nghiệm dùng dải `203.0.113.0/24`, dải dành riêng cho tài liệu, sau đó tự khôi phục.
- **Data API:** Supabase tự sinh REST API từ các bảng. Nhóm đặt bảng vào schema riêng `clinic` không được mở ra API và thu hồi quyền của `anon`. Bảng đối chứng chứng minh API vẫn hoạt động, nên việc bị chặn là nhờ cấu hình.
- **Mã hóa khi lưu trữ:** Supabase công bố dùng AES-256, nhưng khách hàng **không tự kiểm chứng được**. Báo cáo ghi rõ điều này.
- **pgAudit:**
  - Ghi log theo role với các lớp `read, write, ddl, role`.
  - Log chỉ giữ 1 ngày trên gói Free, nên phải xuất ra ngay.
  - Lệnh bị từ chối không có trong pgAudit, phải đọc thêm log lỗi.
- **Hiệu năng:**
  - Mã hóa làm chậm thêm tối đa 1,9% (trung vị).
  - Mạng chiếm phần lớn thời gian (khoảng 237 ms mỗi truy vấn, vì server đặt ở Sydney).
  - Riêng mã hóa và giải mã chỉ mất khoảng 0,02 ms mỗi giá trị.
  - Công thức: chi phí = (t_mã hóa − t_thường) / t_thường × 100%.

### B – Bảo mật database (Chương 2, mục 3.4–3.7)

**Cần hiểu:**
- **RBAC và đặc quyền tối thiểu:**
  - Mặc định thu hồi hết, sau đó chỉ cấp đúng quyền công việc cần.
  - Lỗi 42501 = `permission denied`.
- **RLS (Row-Level Security):**
  - Policy `USING` lọc những dòng được thấy; `WITH CHECK` kiểm tra dữ liệu ghi vào.
  - Dòng không thỏa điều kiện bị ẩn chứ không báo lỗi: người dùng không biết dòng đó có tồn tại.
  - Superuser và role có `BYPASSRLS` luôn bỏ qua RLS. `FORCE ROW LEVEL SECURITY` buộc cả chủ sở hữu bảng phải tuân theo.
- **Che dữ liệu bằng view `patients_masked`:**
  - PostgreSQL không có Dynamic Data Masking như SQL Server, nên nhóm dùng view.
  - Lễ tân không có quyền trên bảng gốc, chỉ đọc qua view.
  - DDM của Microsoft có thể bị suy đoán bằng `WHERE`. Với view của nhóm, lọc theo `000` không trả về dòng nào, vì điều kiện áp lên dữ liệu đã che (T5.2).
- **Mã hóa phía client bằng AES-256-GCM:**
  - Khóa chỉ nằm ở client, nên DBA và cả Supabase chỉ thấy bản mã.
  - GCM vừa giữ bí mật vừa phát hiện sửa đổi (có thẻ xác thực).
  - Nonce ngẫu nhiên 96 bit: cùng một giá trị mã hóa hai lần cho ra hai bản mã khác nhau.
  - AAD = `patient:id:column` gắn bản mã với đúng dòng và cột, nên chép bản mã sang bệnh nhân khác sẽ bị phát hiện (T6.4).
  - Blind index HMAC cho CCCD: tra cứu chính xác được mà không lộ giá trị. Đổi lại, nó cho biết những dòng nào có cùng CCCD.
- **Hạn chế:**
  - Không sắp xếp hay tìm kiếm được trên cột mã hóa.
  - Mọi bác sĩ dùng chung một khóa lưu trong file, không xoay vòng. Hệ thống thật nên dùng KMS.

### C – Lý thuyết và tổng hợp (Mở đầu, Chương 1, Kết luận)

**Cần hiểu:**
- **Định nghĩa đám mây của NIST:** 5 đặc trưng (tự phục vụ theo nhu cầu, truy cập mạng rộng rãi, gộp tài nguyên, co giãn nhanh, dịch vụ được đo lường) và 3 mô hình (IaaS, PaaS, SaaS). Database được quản lý gần với PaaS.
- **Mã hóa ở 3 trạng thái và mỗi loại không chặn được gì (Bảng 3):**
  - Khi lưu trữ (TDE): không chặn người truy vấn qua database đang chạy.
  - Khi truyền (TLS): không chặn đầu cuối hợp lệ.
  - Phía client (Always Encrypted): không chặn khi client hoặc khóa bị lộ.
- **Always Encrypted:**
  - Mã hóa tất định cho phép tìm kiếm bằng nhưng lộ mẫu dữ liệu.
  - Mã hóa ngẫu nhiên an toàn hơn nhưng không tìm kiếm được.
- **Quản lý khóa:**
  - Khóa do nhà cung cấp quản lý thì tiện, nhưng phải tin nhà cung cấp.
  - Khóa do khách hàng quản lý (Azure Key Vault, AWS KMS) cho quyền kiểm soát, đổi lại mất khóa là mất dữ liệu.
- **So sánh 3 nền tảng (Bảng 4):** Azure có sẵn nhiều tính năng nhất. Supabase phải tự xây dựng tương đương, nên kết quả của nhóm không nói lên hành vi của các tính năng trên Azure hay AWS.
- **Ba bài học trong Kết luận và các hạn chế:** thuộc để chốt phần trình bày.

---

## Phần 4. Câu hỏi thầy có thể hỏi

| Câu hỏi | Ý trả lời |
|---|---|
| Đã mã hóa khi lưu trữ rồi, sao còn mã hóa phía client? | Mã hóa khi lưu trữ chỉ chống mất ổ đĩa. Ai truy vấn được database vẫn đọc được bản rõ. Mã hóa phía client chống cả DBA và nhà cung cấp. |
| Sao không dùng RLS cho mọi thứ? | Role `postgres` có `BYPASSRLS` (T4.6). Người giữ mật khẩu này đọc được tất cả. |
| Che dữ liệu có phải là mã hóa không? | Không. Giá trị gốc vẫn nằm nguyên trong database; chỉ phần hiển thị bị che. |
| Nếu lộ file `.env` thì sao? | Lộ toàn bộ dữ liệu đã mã hóa và mật khẩu các role. Đây là hạn chế đã nêu; hệ thống thật nên dùng KMS. |
| Làm sao chứng minh kết quả là thật? | Script chạy trên cloud thật; database được xóa và dựng lại rồi chạy lại vẫn 24/24; có thể demo trực tiếp ngay. |
| Sao mã hóa gần như không làm chậm? | Độ trễ mạng khoảng 237 ms lấn át; riêng mã hóa và giải mã chỉ mất khoảng 0,02 ms mỗi giá trị. |
| Danh sách IP đã bật rồi, có cần chặn REST API nữa không? | Có. Network Restrictions không áp dụng cho REST API, nên cần schema riêng và thu hồi quyền của `anon`. |
| Nếu lễ tân lấy được quyền trên bảng gốc thì sao? | View mất tác dụng. Vì vậy phải kết hợp RBAC và audit. |
| Điểm yếu lớn nhất của hệ thống là gì? | Khóa lưu trong file cục bộ, client không xác minh chứng chỉ, mã hóa khi lưu trữ không tự kiểm chứng được. |
| Sao pgAudit không ghi lệnh bị từ chối? | Nhóm quan sát được điều này qua thực nghiệm (10 lệnh thành công cho đúng 10 dòng pgAudit), chứ chưa phân tích mã nguồn pgAudit để biết nguyên nhân. Hệ quả: quy trình audit phải đọc cả log lỗi. |

**Mẹo:** câu nào không chắc thì nói thẳng là chưa kiểm chứng và nêu hướng kiểm tra. Đừng đoán, vì báo cáo đã ghi rõ những gì làm được và chưa làm được.
