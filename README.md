# Kailan Huang — Personal site

一頁式個人網站草稿:作品集 + 經歷 + Playground(互動實驗區)。純 HTML/CSS,無相依套件。

## 推上 GitHub Pages(約 2 分鐘)

1. 在 GitHub 建一個新 repo,命名為 `<你的帳號>.github.io`(公開、不要勾 README)
2. 在這個資料夾裡執行:

```bash
git init
git add .
git commit -m "Draft personal site"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<你的帳號>.github.io.git
git push -u origin main
```

3. 一兩分鐘後網站就會出現在 `https://<你的帳號>.github.io`

若要綁 kailanhuang.com:repo Settings → Pages → Custom domain 填入網域,再到 DNS 加 CNAME 指向 `<你的帳號>.github.io`。

## 換上真實作品圖

Selected work 目前是文字佔位封面。從 Figma(Works 檔案)匯出各專案主圖後,依下列檔名放進 `assets/`,再到 `index.html` 把對應 `<img>` 的註解拿掉、刪掉 `<span class="ph">`:

| 檔名 | 專案 |
|---|---|
| `assets/dyson-landing.png` | Dyson Finance — Landing page |
| `assets/dyson-dex.png` | Dyson Finance — DEX interface |
| `assets/vincent-ai.png` | Vincent AI — Telegram PoW mining app |
| `assets/bank-app.png` | Bank app redesign |
| `assets/asus-aura.png` | ASUS Aura — concept demo |
| `assets/bp-watch.png` | Blood pressure watch interface |

建議匯出寬 1200px 左右、裁成約 4:3。

## 檔案結構

```
index.html                  網站本體(單檔,含 CSS)
assets/kailan-huang-cv.pdf  CV 下載
assets/*.png                作品圖(待補)
```
