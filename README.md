# Kailan Huang — personal site

作品集 + AI 實驗 Playground + 日常 Notes。純 HTML/CSS/JS，沒有 build 步驟，push 到 `main` 就會由 GitHub Pages 發布到
https://kkanail.github.io 。

## 結構

```
index.html                 一屏首頁；左邊是互動區塊（插槽）
work/  playground/  notes/  about/
playground/<slug>/         每個實驗一個資料夾（頁面 + thumb.png）
data/experiments.json      Playground 的資料 → 卡片、tag 篩選自動產生
data/notes.json            Notes 的資料（note / reading / update = 網站更新紀錄）
data/works.json            Work 的資料
assets/css/site.css        共用樣式
assets/js/site.js          讀 JSON、產生列表與篩選
assets/js/effects/         首頁互動效果；換效果 = 新增一支檔案 + 改 index.html 的 data-effect
assets/kailan-huang-cv.pdf CV
CLAUDE.md                  給小秘書（Claude）的說明書
.claude/skills/            小秘書指令：/new-experiment、/new-note
```

## 怎麼更新

在 Claude Code 打開這個 repo，直接說「我做了一個 XX，幫我放上 Playground」，或用 `/new-experiment`、`/new-note`。

手動也可以：在 `data/*.json` 加一筆資料即可，介面會自動長出卡片和 tag 篩選。

## 本機預覽

```bash
python3 -m http.server 8000
```

然後打開 http://localhost:8000 （直接雙擊 html 檔讀不到 JSON）。

## 待辦

- Work：從 Figma 匯出作品圖，填進 `data/works.json` 的 `cover`；之後補作品內頁
- 綁定 kailanhuang.com：repo Settings → Pages → Custom domain，DNS 加 CNAME 指向 `kkanail.github.io`
