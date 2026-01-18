# My Cloud Site - Instagram 克隆應用

完整的全棧社交媒體應用，具有個人化 Feed、用戶關注、點讚、評論和私訊功能。

## 📦 專案結構

```
my-cloud-site/
├── backend/
│   ├── index.js          # Express 伺服器（API + WebSocket）
│   └── db/
│       ├── users.json    # 用戶數據
│       ├── posts.json    # 文章數據
│       ├── messages.json # 私訊
│       ├── follows.json  # 關注關係
│       ├── likes.json    # 點讚記錄
│       └── comments.json # 評論
├── frontend/
│   ├── index.html        # 主頁面
│   └── main.js          # 前端邏輯
└── package.json         # 專案配置
```

## ✨ 功能特性

### 社交媒體功能
- ✅ **用戶系統**：註冊、登入、登出、個人資料
- ✅ **關注系統**：關注/取消關注其他用戶
- ✅ **個人化 Feed**：只顯示關注用戶的文章
- ✅ **文章管理**：創建、編輯、刪除文章
- ✅ **點讚功能**：對文章點讚/取消點讚
- ✅ **評論系統**：添加、查看、刪除評論
- ✅ **用戶搜尋**：按用戶名搜尋用戶
- ✅ **私訊功能**：用戶間私密對話
- ✅ **用戶資料**：查看用戶統計信息

### 技術特性
- ✅ RESTful API（GET / POST / PUT / DELETE）
- ✅ 6 個 JSON Collections（Users、Posts、Messages、Follows、Likes、Comments）
- ✅ Token 基礎認證系統
- ✅ WebSocket 即時推送
- ✅ CORS 跨域支援
- ✅ 環境變數支援（PORT）
- ✅ XSS 防護
- ✅ 3 列響應式設計

## 🚀 快速開始

### 1. 安裝依賴

```bash
cd my-cloud-site
npm install
```

### 2. 啟動後端伺服器

```bash
npm start
```

或開發模式（自動重載）：
```bash
npm run dev
```

伺服器將在 `http://localhost:3000` 運行

### 3. 開啟前端

在瀏覽器中打開：
```
frontend/index.html
```

或用 Live Server：
```bash
# VS Code 中安裝 Live Server 擴展，右鍵點擊 index.html 選擇 "Open with Live Server"
```

## 📡 API 端點

### 認證 (Authentication)

```bash
# 用戶註冊
POST /api/auth/register
Body: { "username": "user", "password": "pass", "email": "user@example.com" }

# 用戶登入
POST /api/auth/login
Body: { "username": "user", "password": "pass" }

# 用戶登出
POST /api/auth/logout
```

### 文章 (Posts)

```bash
# 獲取所有文章
GET /api/posts
Headers: { Authorization: Bearer TOKEN }

# 創建文章
POST /api/posts
Headers: { Authorization: Bearer TOKEN }
Body: { "title": "標題", "content": "內容" }

# 更新文章
PUT /api/posts/:id
Headers: { Authorization: Bearer TOKEN }
Body: { "title": "新標題", "content": "新內容" }

# 刪除文章
DELETE /api/posts/:id
Headers: { Authorization: Bearer TOKEN }

# 獲取個人化 Feed（只顯示關注用戶的文章）
GET /api/feed
Headers: { Authorization: Bearer TOKEN }
```

### 關注 (Follows)

```bash
# 關注用戶
POST /api/follow/:userId
Headers: { Authorization: Bearer TOKEN }

# 取消關注
DELETE /api/follow/:userId
Headers: { Authorization: Bearer TOKEN }
```

### 點讚 (Likes)

```bash
# 對文章點讚
POST /api/posts/:postId/like
Headers: { Authorization: Bearer TOKEN }

# 取消點讚
DELETE /api/posts/:postId/like
Headers: { Authorization: Bearer TOKEN }
```

### 評論 (Comments)

```bash
# 添加評論
POST /api/posts/:postId/comments
Headers: { Authorization: Bearer TOKEN }
Body: { "content": "評論內容" }

# 獲取評論
GET /api/posts/:postId/comments
Headers: { Authorization: Bearer TOKEN }

# 刪除評論
DELETE /api/comments/:commentId
Headers: { Authorization: Bearer TOKEN }
```

### 用戶 (Users)

```bash
# 搜尋用戶
GET /api/users/search/:query
Headers: { Authorization: Bearer TOKEN }

# 獲取用戶資料
GET /api/users/:userId/profile
Headers: { Authorization: Bearer TOKEN }
```

### 私訊 (Messages)

```bash
# 發送私訊
POST /api/messages
Headers: { Authorization: Bearer TOKEN }
Body: { "recipientId": "userId", "content": "訊息內容" }

# 獲取對話訊息
GET /api/messages/:userId
Headers: { Authorization: Bearer TOKEN }
```

## 🔗 WebSocket 連接

### 連接
```javascript
const token = localStorage.getItem('token');
ws = new WebSocket(`ws://localhost:3000?token=${token}`);
```

### 接收消息
```javascript
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'message') {
        // 接收私訊
        console.log('新私訊:', data);
    } else if (data.type === 'post-update') {
        // 接收文章更新
        console.log('有新文章或文章被更新');
    } else if (data.type === 'comment-update') {
        // 接收評論更新
        console.log('有新評論');
    }
};
```

### 自動重新連接
- WebSocket 斷開連接時自動重新連接
- 最多重試 5 次，每次間隔 5 秒

## 🌐 環境變數

### 後端

```bash
# 設定伺服器埠口（Windows PowerShell）
$env:PORT=8080 ; npm start

# 或使用環境變數文件 .env
PORT=3000
```

### 前端

在 `frontend/main.js` 中修改 baseURL：
```javascript
const baseURL = 'http://localhost:3000';
```

## 📝 使用範例

### 使用 curl 測試後端

```bash
# 用戶註冊
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"pass123","email":"alice@example.com"}'

# 用戶登入
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"pass123"}'

# 使用令牌創建文章
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"title":"Hello","content":"World"}'

# 獲取個人化 Feed
curl http://localhost:3000/api/feed \
  -H "Authorization: Bearer YOUR_TOKEN"

# 搜尋用戶
curl http://localhost:3000/api/users/search/alice \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 前端操作

1. **開啟應用**
   - 打開 `http://localhost:3000`
   - 確認伺服器已運行

2. **註冊和登入**
   - 點擊「註冊」創建新帳戶
   - 輸入用戶名、密碼、郵箱
   - 點擊「登入」進入應用

3. **發佈文章**
   - 點擊「My Posts」標籤
   - 輸入標題和內容
   - 點擊「發佈」按鈕
   - 文章立即出現在 Feed 中

4. **搜尋和關注用戶**
   - 使用頂部搜尋框
   - 輸入用戶名
   - 從結果中選擇用戶
   - 點擊「關注」按鈕

5. **與他人互動**
   - 在 Feed 中查看關注用戶的文章
   - 點擊心形圖標點讚
   - 點擊評論圖標添加評論
   - 從搜尋結果發送私訊

3. **編輯/刪除文章**
   - 在文章下方點擊「編輯」或「刪除」
   - 編輯時會彈出提示框

4. **發送聊天**
   - 輸入暱稱和訊息
   - 點擊「發送訊息」
   - 訊息即時出現在聊天區域

## 🚀 Railway 部署指南

### 1. 準備 GitHub 儲存庫

```bash
# 初始化 Git
git init
git add .
git commit -m "Initial commit: My Cloud Site - Instagram Clone"

# 連接到 GitHub
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/my-cloud-site.git
git push -u origin main
```

### 2. 部署到 Railway

1. **創建 Railway 帳號**
   - 訪問 [railway.app](https://railway.app)
   - 用 GitHub 帳號登入

2. **創建新專案**
   - 點擊 "New Project"
   - 選擇 "Deploy from GitHub repo"
   - 選擇你的 `my-cloud-site` 儲存庫

3. **設定環境變數**
   - 在 Railway 專案設定中添加：
   ```
   PORT=3000
   NODE_ENV=production
   ```

4. **部署設定**
   - Railway 會自動檢測 Node.js 專案
   - 確保 `package.json` 中的 `start` 腳本正確
   - 點擊 "Deploy"

5. **獲取部署 URL**
   - 部署完成後，Railway 會提供一個 URL
   - 例如：`https://my-cloud-site.up.railway.app`

### 3. 前端配置更新

修改 `frontend/main.js` 中的 baseURL：

```javascript
// 本地開發
let baseURL = 'http://localhost:3000';

// 生產環境（Railway）
let baseURL = 'https://your-railway-url.up.railway.app';
```

### 4. 手機雲端連線

部署完成後，你可以：
- **手機瀏覽器**：直接訪問 Railway 提供的 URL
- **分享連結**：將 URL 分享給其他人
- **跨平台使用**：任何有瀏覽器的設備都能使用

### 5. Railway 特色功能

- ✅ **自動 HTTPS**：免費 SSL 證書
- ✅ **自動部署**：Git push 後自動更新
- ✅ **免費額度**：每月 500 小時免費使用
- ✅ **自定義域名**：可綁定自己的域名
- ✅ **環境變數**：安全的配置管理
- ✅ **日誌查看**：實時監控應用狀態

## 🛠 部署指南

### 本地開發

```bash
# 終端 1：啟動後端
npm start

# 終端 2：用 Live Server 啟動前端
# 或簡單用 Python 啟動靜態伺服器
cd frontend
python -m http.server 8000
# 訪問 http://localhost:8000
```

### Docker 部署

建立 `Dockerfile`：

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY backend/ ./backend/
EXPOSE 3000
CMD ["npm", "start"]
```

建立和運行：

```bash
docker build -t my-cloud-site .
docker run -p 3000:3000 -e PORT=3000 my-cloud-site
```

### Vercel / Heroku 部署

#### Vercel（前端）

```bash
# 部署前端
vercel frontend/
```

#### Heroku（後端）

```bash
heroku create my-cloud-site-api
git push heroku main
```

設定環境變數：
```bash
heroku config:set PORT=3000
```

## 📊 數據格式

### Post 對象
```json
{
  "id": 1234567890,
  "title": "文章標題",
  "content": "文章內容...",
  "author": "作者名稱",
  "createdAt": "2026-01-18T10:30:00.000Z",
  "updatedAt": "2026-01-18T10:30:00.000Z"
}
```

### Chat 對象
```json
{
  "id": 1234567890,
  "user": "用戶暱稱",
  "message": "聊天內容",
  "timestamp": "2026-01-18T10:30:00.000Z"
}
```

### User 對象
```json
{
  "id": 1234567890,
  "name": "用戶名",
  "email": "user@example.com",
  "createdAt": "2026-01-18T10:30:00.000Z"
}
```

## 🐛 故障排除

### 「無法連接伺服器」

1. 確認後端已啟動：`npm start`
2. 檢查埠口（預設 3000）：`netstat -an | findstr 3000`（Windows）
3. 檢查 API URL 設定是否正確

### 聊天訊息未即時更新

- WebSocket 失敗時自動降級到輪詢（5 秒刷新一次）
- 檢查瀏覽器控制台是否有錯誤

### JSON 文件錯誤

- `db/` 資料夾中的 JSON 文件損壞時，伺服器會自動初始化
- 也可手動清空文件內容為 `[]`

## 🎓 學習資源

- [Express.js 官方文檔](https://expressjs.com/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)

## 📄 授權

MIT License

---

**祝你使用愉快！** 🎉
