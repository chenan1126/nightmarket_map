# 夜市地圖

大家一起維護的夜市地圖：先探索饒河街觀光夜市，再逐步接上多夜市、登入、照片與社群審核。

## 啟動 Web

```bash
npm install
npm run dev
```

Web 端使用 React + Vite，開發預覽預設在 `http://localhost:5173/`。

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

現在的攤位資料仍是 prototype seed data，收藏先存在瀏覽器本機；下一階段會接上共同資料庫、登入、照片上傳與審核流程，才會成為真正的多人共同維護地圖。
