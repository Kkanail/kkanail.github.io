# Playground 交接說明（給另一個 Claude 用）

在別的地方（例如公司的 Claude）做互動實驗時，把下面「Brief」整段貼給那邊的 Claude，再描述你想做什麼。
做完後，把產出的 `.html` 檔放進 Google Drive 的 **Playground inbox** 資料夾（或直接貼／上傳到小秘書的對話），
跟小秘書說「inbox 有新東西」，它會接手修改、截縮圖、上架。

> ⚠️ 只帶個人實驗。不要帶公司的程式碼、資料、內部 API，或任何還沒公開的專案內容。網站是公開的。

---

## Brief（複製以下內容）

I'm making a small interactive experiment for the Playground section of my personal website.
Please follow these constraints so it drops into my site with minimal changes:

**Output format**
- One single, self-contained `.html` file. All CSS and JS inline. It must work by opening the file in a browser.
- No build step, no npm, no frameworks that need compiling. Plain HTML/CSS/JavaScript.
- If you need a library, load it from `https://cdnjs.cloudflare.com` or `https://cdn.jsdelivr.net/npm/` with an exact version number.
- Images/sounds: generate them in code, or embed as small data URIs. No other external assets.
- No API keys, tokens or calls to private/internal services. If it needs an AI API, stop and tell me instead.

**Look & feel**
- White background `#FFFFFF`, text `#101820`, muted text `#6B6F76`, hairlines `#E3E3E3`, one accent colour `#6E56CF`.
- Fonts (Google Fonts): headings "Newsreader", body "Open Sans", small labels "DM Mono" uppercase.
- Calm and minimal: no gradients, no drop shadows, colour used sparingly.
- Full-viewport experience; must work on a 390px-wide phone (touch) as well as desktop (mouse), with no horizontal scroll.
- Respect `prefers-reduced-motion` (show a calm/static version).

**Code**
- Readable code with short comments. Put tweakable values (sizes, speeds, colours) in one `CONFIG` object at the top.
- Handle window resize.

**If this is meant for my homepage hero slot** (I'll say so), also export the effect as an ES module function:
`export function mount(el, options) { /* draw only inside el */ return () => { /* cleanup */ } }`
— it must size itself to `el`, clean up all listeners/animation frames in the returned function,
and still look alive with no mouse (e.g. gentle idle motion).

At the end, give me: the file, a one-line description of what it does, and 2–4 short tags.
