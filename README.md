# 夜市地圖

大家一起維護的夜市地圖：先從全台夜市名錄找到附近夜市，再由各地貢獻者補充地址、營業日與攤位。

## 啟動 Web

```bash
npm install
npm run dev
```

Web 端使用 React + Vite，開發預覽預設在 `http://localhost:5173/`。

## 啟用社群功能

Web 沒有設定 Supabase 時會維持唯讀名錄，不會假稱投稿或評分成功。建立 Supabase project、執行 `supabase/migrations/202609180001_social_contributions.sql` 後，在 hosting 平台設定以下 build-time variables：

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public-anon-key>
```

同時在 Supabase Authentication 開啟 Anonymous Sign-Ins、設定 email magic-link redirect URL，並先把名錄匯入 `markets`（將 JSON 的字串 `id` 放入 `external_id`）。`service_role` key 不得放入前端或 repo。完整的 RLS 邊界與本機驗證方式見 [`supabase/README.md`](supabase/README.md)。

首頁可直接新增夜市；新增夜市提案必填縣市、區域、地址或明確位置描述與來源 URL，並會出現在全台/縣市的待確認列表。票數由資料庫 trigger 維護，前端只讀彙總；星評只對正式採用且已建立攤位的提案開放，沒有正式攤位時會明確顯示待採用。

## 啟動 iOS / Android

```bash
cd apps/mobile
npm install
npx expo start
```

手機端使用 Expo + React Native + `react-native-maps`，可用 Expo Go、iOS Simulator 或 Android Emulator 開啟。

## 目前採用的開源套件

- [Vite](https://github.com/vitejs/vite)：Web 開發伺服器與 production build
- [React Leaflet](https://github.com/PaulLeCam/react-leaflet) + [Leaflet](https://github.com/Leaflet/Leaflet)：Web 地圖元件與 OpenStreetMap 圖磚
- [Lucide](https://github.com/lucide-icons/lucide)：Web / Native 共用風格的圖示
- [React Hook Form](https://github.com/react-hook-form/react-hook-form) + [Zod](https://github.com/colinhacks/zod)：推薦攤位表單與驗證
- [Expo](https://github.com/expo/expo) + [React Native Maps](https://github.com/react-native-maps/react-native-maps)：iOS / Android 原生 App 基礎

## 專案結構

```text
src/                       Web React app
packages/shared/src/       Web 與 mobile 共用的攤位 seed data
apps/mobile/               Expo React Native app
dist/                      Sites 靜態部署輸出
```

## 夜市資料

Web 名錄位於 `public/data/night-markets.json`，來源欄位保留經濟部商業發展署[夜市資料（政府資料開放平臺資料集 95760）](https://data.gov.tw/dataset/95760)的資料集與品質平台快照網址、詮釋資料日期及本次匯入日期。2026-09-18 的非即時 JSON 快照原始 75 筆，清除 2 筆空白列後匯入 73 筆候選，與人工確認資料合併去重後共 86 筆，候選仍標為「待複核」，不代表完整即時全台名錄。包含中壢觀光夜市與中原夜市。已補上的座標都是官方景點描述對應的 OSM 入口或商圈中心近似點，逐筆保留 `coordinateSource`、精度說明與來源 URL；其餘未核對欄位保持空白。使用者定位後只對有座標的點位計算約略距離並排序，不會以假座標計算距離。

頁面支援瀏覽器定位與手動選縣市，並保留饒河街原型攤位資料的明確切換入口。社群功能在設定 Supabase 環境變數後才會連線；未設定時維持唯讀名錄，不會假稱投稿、表決或星評成功。
