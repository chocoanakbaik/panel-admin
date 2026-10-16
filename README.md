# Choco Panel Admin

**Choco Panel Admin** adalah pusat kendali privat untuk owner yang menyatukan laporan operasional dan keamanan ekosistem Choco: Choco AI, Sara AI, Choco AI Help Center, masukan pengguna, serta laporan penyalahgunaan.

Panel ini bukan alat untuk memantau kehidupan pribadi pengguna di luar layanan. Data yang diterima dibatasi pada kebutuhan operasional, keamanan, moderasi, dan peningkatan produk.

## Tampilan dan identitas visual

Panel mengikuti sistem visual Choco AI Help Center:
- Latar utama navy gelap: `#080b14`
- Surface utama: `#111625`
- Teks utama: `#eef2ff`
- Aksen biru: `#638cff`
- Aksen ungu: `#a16bff`
- Gradasi aksen biru–ungu

Desain responsif mencakup ringkasan ekosistem, status integrasi, aktivitas terbaru, akun yang tercatat, laporan masuk, serta kritik dan saran.

## Fitur dan status

| Modul | Fungsi | Status |
|---|---|---|
| Login owner | Access key diverifikasi di server, sesi bertanda tangan, cookie HttpOnly/Secure/SameSite, pembatasan percobaan berbasis database | Fondasi diimplementasikan; perlu konfigurasi dan pengujian deployment |
| Ringkasan | Jumlah event 24 jam, akun, laporan terbuka, masukan terbuka | API dibuat; memerlukan database |
| Status layanan | Menampilkan koneksi dan waktu event terakhir | API dibuat; belum ada sender layanan yang dikonfirmasi |
| Aktivitas | Daftar event operasional yang diterima | API dibuat |
| Akun | Daftar referensi akun yang dilaporkan oleh sumber | API dibuat; tidak menggantikan autentikasi sumber |
| Laporan | Daftar laporan, status tindak lanjut, alasan, audit log | API dan pembaruan status dibuat |
| Kritik & saran | Daftar masukan dan pembaruan status | API dan pembaruan status dibuat |
| Penangguhan akun | Harus dikonfirmasi oleh layanan yang memiliki akun | Belum terhubung ke backend Choco AI; panel tidak boleh mengklaim akun telah diblokir |
| Integrasi Sara AI | Event operasional dan laporan jawaban yang dikirim secara eksplisit | Kontrak dibuat; sender belum terhubung |

Fitur yang membutuhkan database atau sender sumber **belum dapat dianggap aktif hanya karena endpoint atau tampilannya sudah ada**. Status "belum terhubung" harus dipertahankan sampai pengujian end-to-end berhasil.

## Arsitektur

- **Frontend:** HTML, CSS, JavaScript tanpa framework berat; memakai desain responsif dan merender data tidak tepercaya melalui `textContent`.
- **Backend:** Netlify Functions di `netlify/functions/`.
- **Database:** Supabase PostgreSQL melalui REST API server-side.
- **Integrasi:** endpoint event berversi dengan HMAC, timestamp, sumber yang diizinkan, validasi payload, batas ukuran, dan idempotency key.
- **Moderasi:** harus memakai API backend layanan sumber. Status akun di panel hanya cache/status terakhir yang dikonfirmasi sumber.
- **Audit:** perubahan status laporan/masukan dicatat secara atomik bersama perubahan status melalui fungsi SQL.

Dokumentasi rancangan:
- [Arsitektur sistem](docs/architecture/system-overview.md)
- [Kontrak event dan API](docs/integrations/event-contract.md)
- [Panduan integrasi sender](docs/integrations/senders.md)
- [Kontrak moderasi akun](docs/integrations/moderation-contract.md)
- [Status kesiapan integrasi sumber](docs/integrations/source-status.md)
- [Model data](docs/data/data-model.md)
- [Model keamanan dan privasi](docs/security/security-model.md)
- [Strategi rilis](docs/deployment/release-strategy.md)
- [Checklist penerimaan](docs/testing/acceptance-checklist.md)

## Setup produksi satu kali

### 1. Siapkan database

1. Buat proyek Supabase.
2. Buka SQL Editor.
3. Jalankan isi `supabase/schema.sql` satu kali.
4. Pastikan tabel dan fungsi SQL berhasil dibuat.
5. Jangan pernah menaruh service-role key di HTML, CSS, atau JavaScript browser.

### 2. Hubungkan repositori ke Netlify

- Hubungkan repositori `chocoanakbaik/panel-admin` ke Netlify.
- Tetapkan `main` sebagai production branch.
- Biarkan pengerjaan lanjutan berlangsung di `development`.
- Jangan merge ke `main` sampai checklist penerimaan lulus.
- Pastikan deployment menyertakan direktori `netlify/functions`; deployment statis tanpa Functions tidak cukup.

### 3. Atur environment variables di Netlify

Buat variabel berikut melalui pengaturan situs Netlify. Nilai rahasia tidak boleh ditulis ke GitHub.

| Variabel | Kegunaan |
|---|---|
| `PANEL_ADMIN_KEY` | Access key owner, minimal 24 karakter |
| `PANEL_SESSION_SECRET` | Rahasia HMAC sesi, berbeda dari access key, minimal 32 karakter |
| `SUPABASE_URL` | URL proyek Supabase, HTTPS |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key untuk akses database server-side saja |
| `INTEGRATION_CHOCO_AI_SECRET` | HMAC secret khusus pengirim Choco AI |
| `INTEGRATION_SARA_AI_SECRET` | HMAC secret khusus pengirim Sara AI |
| `INTEGRATION_HELP_CENTER_SECRET` | HMAC secret khusus pengirim Help Center |
| `MODERATION_CHOCO_AI_URL` | Endpoint moderasi backend Choco AI, setelah tersedia |
| `MODERATION_CHOCO_AI_SECRET` | Secret HMAC untuk komunikasi panel ke backend Choco AI, setelah tersedia |\n| `MODERATION_CHOCO_AI_ENABLED` | Set ke `true` hanya setelah kontrak moderasi diuji end-to-end; selain itu kontrol tetap nonaktif |\n| `PANEL_EVENT_RETENTION_DAYS` | Retensi event operasional, default 90 hari (rentang 7–730) |\n| `PANEL_REPORT_RETENTION_DAYS` | Retensi laporan sebelum selesai, default 365 hari (rentang 30–1825) |\n| `PANEL_FEEDBACK_RETENTION_DAYS` | Retensi masukan sebelum selesai, default 365 hari (rentang 30–1825) |

Setiap source secret harus unik dan dibuat secara acak. Variabel integrasi/moderasi dapat ditambahkan saat sender atau backend terkait sudah siap. Jangan membuat nilai rahasia yang sama untuk semua layanan.

### 4. Hubungkan aplikasi sumber

Panel tidak bisa membaca data dari repositori lain secara otomatis. Tiap layanan harus mengirim event ke:

`POST /.netlify/functions/ingest-event`

Request memakai header `x-choco-source`, `x-choco-timestamp`, dan `x-choco-signature`. Signature adalah HMAC-SHA256 hex dari teks `<timestamp>.<raw-json-body>`, menggunakan secret sumber yang cocok. Contoh pengirim server-side tersedia di [panduan sender](docs/integrations/senders.md).

**Jangan pernah menaruh integration secret di JavaScript browser.** Jika Choco AI berupa situs statis, pengiriman event harus dilakukan melalui backend/function yang aman. Sara AI yang berjalan lokal hanya akan terhubung jika aplikasi mengirim event yang disetujui secara eksplisit.

### 5. Uji sebelum rilis

Gunakan [checklist penerimaan](docs/testing/acceptance-checklist.md). Verifikasi login, sesi, rate limit, storage, event duplikat, payload invalid, pembaruan status, audit log, dan status integrasi. Jangan gunakan panel untuk moderasi produksi sebelum layanan sumber benar-benar mengonfirmasi tindakan.

## Retensi data\n\nPembersihan terjadwal berjalan setiap hari pada deployment produksi. Event operasional dihapus setelah masa retensinya (default 90 hari). Laporan dan masukan yang sudah berstatus selesai/ditutup dihapus setelah masa retensi setelah penutupan (default 365 hari). Catatan audit dan tindakan moderasi dipertahankan untuk akuntabilitas; hindari memasukkan data pribadi yang tidak perlu ke alasan tindakan. Masa retensi dapat disesuaikan melalui environment variables yang tercantum di atas.\n\n## Privasi dan batas pengumpulan

- Jangan simpan kata sandi, token sesi, API key, atau kredensial pengguna.
- Jangan mengumpulkan seluruh percakapan secara diam-diam sebagai default.
- Kirim metadata operasional seperlunya dan konteks laporan paling minimum yang dibutuhkan.
- Gunakan event keselamatan otomatis sebagai sinyal peninjauan, bukan bukti tunggal untuk sanksi permanen.
- Tentukan masa retensi dan mekanisme penghapusan data sebelum rilis.
- Catat tindakan owner yang mengubah status laporan, masukan, atau akun.

## Strategi rilis

Tidak ada arsitektur yang menjamin layanan tidak pernah memerlukan perbaikan. Untuk meminimalkan deploy berulang, semua pekerjaan dan tes dilakukan di branch `development`, sedangkan `main` tetap sebagai branch rilis. Deployment produksi dilakukan setelah fondasi, database, keamanan, UI, dan integrasi yang memang tersedia lulus pengujian. Integrasi sumber yang belum dibuat akan tetap ditandai sebagai belum terhubung, bukan disamarkan sebagai fitur selesai.
