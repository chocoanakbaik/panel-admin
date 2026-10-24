# Choco Panel Admin

**Panel Admin adalah dashboard privat khusus untuk pemilik (owner) Choco** untuk mengelola keamanan platform, meninjau laporan, memantau penggunaan layanan, serta mengambil tindakan terhadap akun yang terbukti melanggar aturan.

**Identitas payung:** The Choco Corporation (TCC). **Studio kreatif:** The Choco Studios (TCS), di bawah identitas payung tersebut. Ekosistem ini saat ini dikelola secara mandiri oleh Hasby Prasetya Saprudin; nama branding menjelaskan hierarki internal dan bukan klaim bahwa ada badan hukum atau struktur legal resmi.

Repositori ini merupakan pusat administrasi untuk ekosistem Choco. Choco AI dan Sara (Choco AI Help Center) tetap berjalan pada repositori dan layanan masing-masing; keduanya akan terhubung ke panel ini melalui API yang terautentikasi.

## Tujuan Utama

Panel ini dibuat agar owner dapat menjaga platform tetap aman, tertib, dan sesuai aturan penggunaan. Panel bukan alat untuk memantau kehidupan pribadi pengguna di luar layanan Choco.

## Cakupan Fitur

### 1. Dashboard Aktivitas
- Ringkasan penggunaan layanan dan aktivitas sistem yang relevan untuk operasional serta keamanan.
- Sumber aktivitas, waktu, status pemrosesan, dan indikator masalah.
- Filter berdasarkan layanan, kategori, rentang waktu, dan status tindak lanjut.

### 2. Manajemen Akun Choco AI
- Melihat akun yang terdaftar dan metadata akun yang diperlukan untuk mengelola layanan.
- Meninjau riwayat penggunaan layanan yang relevan dengan keamanan dan penegakan aturan.
- Melihat peringatan atau indikasi pelanggaran yang terdeteksi, beserta konteks minimum yang diperlukan untuk peninjauan.
- Menangguhkan sementara, memulihkan, atau menonaktifkan akun berdasarkan kebijakan platform dan hasil peninjauan.
- Mencatat alasan, waktu, serta tindakan moderasi agar keputusan dapat ditelusuri.

Panel tidak boleh menyimpan kata sandi dalam bentuk terbaca, token rahasia, atau kredensial autentikasi pengguna.

### 3. Kritik dan Saran
- Menerima masukan pengguna ketika formulir dan integrasinya tersedia.
- Mengelompokkan, mencari, memberi status, dan mencatat tindak lanjut masukan.

### 4. Laporan Penyalahgunaan
- Menerima laporan dugaan penyalahgunaan layanan atau pelanggaran aturan.
- Menyimpan kategori laporan, waktu, status, dan bukti yang relevan jika disertakan secara sah.
- Mendukung proses peninjauan sebelum tindakan moderasi diambil.

### 5. Laporan dan Masukan untuk Sara AI
- Menerima laporan tentang jawaban yang keliru, tidak relevan, bermasalah, atau diduga melanggar kebijakan.
- Menghubungkan laporan dengan layanan dan waktu kejadian agar dapat diperiksa.
- Menyediakan status tindak lanjut untuk membantu evaluasi kualitas Sara.

### 6. Integrasi Antar-Layanan
Panel dirancang untuk menerima event melalui API dari:
- **Choco AI** — aktivitas layanan, metadata akun yang diperlukan, serta sinyal keamanan atau pelanggaran yang relevan.
- **Sara / Choco AI Help Center** — aktivitas layanan yang relevan dan laporan atas jawaban atau pengalaman pengguna.
- **Kritik dan saran** — setelah formulir pengiriman tersedia.
- **Laporan pengguna** — setelah mekanisme pelaporan tersedia.

Tidak semua sumber otomatis terhubung sejak awal. Setiap aplikasi perlu menerapkan integrasi pengiriman data ke API panel admin.

## Batasan Privasi dan Penggunaan Data

Akses owner ditujukan untuk **administrasi, keamanan, moderasi, pemeliharaan, dan peningkatan layanan Choco**. Kepemilikan platform bukan alasan untuk mengumpulkan data tanpa batas.

- Kumpulkan hanya data yang diperlukan untuk fungsi di atas dan jelaskan pemrosesannya dalam kebijakan privasi layanan.
- Jangan mengumpulkan atau menampilkan aktivitas pribadi pengguna yang tidak berkaitan dengan penggunaan Choco.
- Jangan merekam seluruh percakapan secara diam-diam sebagai kebiasaan bawaan. Jika isi pesan atau potongan percakapan diperlukan untuk memeriksa laporan atau dugaan pelanggaran, batasi pada konteks yang relevan, berikan pemberitahuan yang sesuai, dan terapkan kontrol akses serta masa retensi.
- Pisahkan metadata operasional dari isi percakapan. Hindari mengirim isi pesan lengkap apabila metadata atau ringkasan kejadian sudah memadai.
- Jangan pernah menyimpan kata sandi, API key, token sesi, atau rahasia autentikasi dalam log.
- Batasi akses dashboard kepada owner yang terautentikasi; lindungi endpoint dengan autentikasi antarlayanan, validasi input, pembatasan permintaan, dan pencatatan akses admin.
- Gunakan data yang relevan dan bukti yang cukup sebelum menjatuhkan sanksi. Indikator otomatis sebaiknya menjadi sinyal untuk ditinjau, bukan selalu menjadi satu-satunya dasar keputusan.
- Tentukan masa retensi, mekanisme penghapusan, dan penanganan permintaan pengguna sesuai kebijakan privasi serta hukum yang berlaku.

## Rencana Arsitektur

Implementasi akan dikembangkan secara bertahap dengan pemisahan komponen agar mudah dirawat:

1. **Admin Dashboard** — antarmuka privat untuk melihat ringkasan, akun, aktivitas, masukan, dan laporan.
2. **Admin API** — endpoint terautentikasi untuk menerima dan mengelola data.
3. **Data Storage** — penyimpanan akun, event, laporan, status moderasi, dan audit log dengan akses terbatas.
4. **Integration Layer** — kontrak API dan validasi event dari setiap layanan Choco.
5. **Authentication & Authorization** — perlindungan login owner dan pemeriksaan izin pada setiap operasi sensitif.
6. **Moderation & Audit** — alur peninjauan, alasan keputusan, tindakan akun, dan jejak perubahan.

Pilihan framework, database, dan hosting harus ditetapkan berdasarkan kompatibilitas integrasi yang sudah digunakan, keamanan, biaya operasional, serta kemampuan berjalan ringan. Jangan menaruh kredensial produksi di repositori.

## Status Proyek

Repositori ini masih berada pada tahap fondasi. Deskripsi fitur di atas merupakan ruang lingkup dan rancangan awal, **bukan pernyataan bahwa fitur tersebut sudah tersedia atau sudah terhubung**. Setiap integrasi akan dianggap selesai setelah implementasi dan pengujiannya berhasil.

## Prinsip Pengembangan

- Keamanan dan privasi sejak tahap desain.
- Akses minimum sesuai kebutuhan.
- Validasi semua data masuk dan jangan memercayai payload dari klien.
- Operasi moderasi harus tercatat dan dapat ditinjau.
- Pisahkan modul agar perubahan pada satu fitur tidak merusak fitur lain.
- Utamakan solusi gratis atau berbiaya rendah tanpa mengorbankan keamanan.
- Dokumentasikan endpoint, skema event, konfigurasi, dan pengujian.

## Catatan

Panel ini adalah alat administrasi internal. Pengguna layanan harus memperoleh informasi yang jelas tentang data apa yang dikumpulkan, tujuan penggunaannya, dan cara mengajukan pertanyaan atau permintaan terkait data mereka.


## Login Owner dan Deployment Netlify

Halaman awal menggunakan kolom access key. Jika key valid, halaman beralih ke dashboard. Validasi dilakukan di Netlify Function, bukan hanya di browser. Sesi menggunakan cookie HttpOnly, Secure, dan SameSite=Strict dengan masa berlaku terbatas.

### Environment variables wajib

Di Netlify, buka Site configuration → Environment variables lalu buat dua variabel berikut:

- **PANEL_ADMIN_KEY** — access key rahasia pilihan owner, minimal 24 karakter.
- **PANEL_SESSION_SECRET** — rahasia acak yang berbeda, minimal 32 karakter.

Jangan menaruh nilai rahasia di repositori, README, frontend, atau tangkapan layar publik. Setelah mengubah environment variables, lakukan deploy ulang.

### Cara deploy

Karena autentikasi memakai Netlify Functions, pastikan file di folder `netlify/functions` ikut diproses saat deploy dan fungsi `admin-auth` muncul pada dashboard Netlify. Cara yang disarankan adalah menghubungkan repositori GitHub ini ke Netlify pada branch `main`, atau memakai Netlify CLI untuk deploy yang menyertakan Functions. Upload statis drag-and-drop saja tidak boleh diasumsikan telah menerbitkan Functions.

Dokumentasi: [Netlify Functions](https://docs.netlify.com/build/functions/overview/) · [Membuat deploy Netlify](https://docs.netlify.com/deploy/create-deploys/)

## Status Implementasi Login

Kerangka login dan tampilan dashboard sudah dibuat. Dashboard masih berisi placeholder: data aktivitas, akun, laporan, penyimpanan, dan integrasi Choco AI/Sara belum tersambung. Sebelum digunakan untuk moderasi produksi, integrasi dan pengamanan endpoint harus diselesaikan serta diuji.
