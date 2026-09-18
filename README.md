# 夜市地圖

大家一起維護的夜市地圖：先從全台夜市名錄找到附近夜市，再由各地貢獻者補充地址、營業日與攤位。

## 啟動 Web

```bash
npm install
npm run dev
```

Web 端使用 React + Vite，開發預覽預設在 `http://localhost:5173/`。

## 啟用社群功能

Web 沒有設定 Supabase 時會維持唯讀名錄，不會假稱投稿或評分成功。目前 Supabase project 已完成兩個 versioned migrations 與 86 筆 `needs_review` 名錄匯入；在 hosting 平台設定以下 build-time variables：

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
VITE_TURNSTILE_SITE_KEY=<cloudflare-turnstile-site-key>
```

舊部署也可繼續使用 `VITE_SUPABASE_ANON_KEY`；前端會將它視為相同的瀏覽器公開金鑰。

匿名投稿需要 Cloudflare Turnstile：瀏覽器只使用 `VITE_TURNSTILE_SITE_KEY`，Turnstile secret 必須在 Supabase Auth 的 CAPTCHA 設定中配置，不能放入前端或 repo。CAPTCHA 只在建立匿名 session 時驗證；資料庫另外限制每個匿名 user 每小時最多 3 筆提案。未設定 site key 時，匿名投稿與 magic link 登入會停在表單並明確顯示未啟用；永久登入會員仍可投稿。本機 email magic-link redirect 已允許 `http://localhost:5173`，正式網域尚未決定。`service_role` key 不得放入前端或 repo。完整的 RLS 邊界與本機驗證方式見 [`supabase/README.md`](supabase/README.md)。

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
