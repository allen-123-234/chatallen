const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const dbDir = path.join(__dirname, 'db');

// 中間件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// 確保 db 目錄存在
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 資料檔案路徑
const usersFile = path.join(dbDir, 'users.json');
const postsFile = path.join(dbDir, 'posts.json');
const messagesFile = path.join(dbDir, 'messages.json');
const followsFile = path.join(dbDir, 'follows.json');
const likesFile = path.join(dbDir, 'likes.json');
const commentsFile = path.join(dbDir, 'comments.json');
const notificationsFile = path.join(dbDir, 'notifications.json');

// 初始化官方管理帳號
function initializeAdminAccount() {
  const users = readJSON(usersFile);
  const adminExists = users.some(u => u.username === 'allen');
  
  if (!adminExists) {
    const adminUser = {
      id: 'admin-' + Date.now(),
      username: 'allen',
      password: 'allen0728', // 實際應用中應該加密
      email: 'admin@cloudsite.com',
      avatar: 'https://picsum.photos/seed/admin/200/200.jpg',
      bio: '超級管理員',
      isAdmin: true,
      createdAt: new Date().toISOString()
    };
    
    users.push(adminUser);
    writeJSON(usersFile, users);
    console.log('✅ 超級管理員帳號已創建: allen/allen0728');
  }
}

// 初始化管理員帳號
initializeAdminAccount();

// 使用者 Token 存儲（簡單實現）
const activeTokens = new Set();

// 驗證碼臨時存儲（email -> {code, timestamp}）
const verificationCodes = new Map();

// 添加 Token 驗證端點（用於前端重新連接）
app.post('/api/auth/verify-token', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(400).json({ error: '沒有 Token' });
  }
  
  // 令牌格式檢查 (userId-timestamp)
  const lastDashIndex = token.lastIndexOf('-');
  if (lastDashIndex === -1) {
    return res.status(401).json({ error: 'Token 格式無效' });
  }
  
  // Token 有效（格式正確），添加到 activeTokens
  activeTokens.add(token);
  const users = readJSON(usersFile);
  const userId = token.slice(0, lastDashIndex);
  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: 'Token 對應用戶不存在' });
  }

  res.json({
    valid: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      isAdmin: !!user.isAdmin
    }
  });
});

// 相容舊版前端：/api/auth/verify
app.post('/api/auth/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(400).json({ error: '沒有 Token' });
  }

  // 直接沿用 verify-token 邏輯
  const lastDashIndex = token.lastIndexOf('-');
  if (lastDashIndex === -1) {
    return res.status(401).json({ error: 'Token 格式無效' });
  }

  activeTokens.add(token);
  const users = readJSON(usersFile);
  const userId = token.slice(0, lastDashIndex);
  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: 'Token 對應用戶不存在' });
  }

  res.json({
    valid: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      isAdmin: !!user.isAdmin
    }
  });
});

// 初始化資料檔案
function initializeFiles() {
  if (!fs.existsSync(usersFile)) {
    const adminUser = {
      id: 'admin',
      username: 'ab',
      password: 'ab',
      email: 'admin@official.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ab',
      bio: '官方管理帳號',
      isAdmin: true,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(usersFile, JSON.stringify([adminUser], null, 2));
  }
  if (!fs.existsSync(postsFile)) {
    fs.writeFileSync(postsFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(messagesFile)) {
    fs.writeFileSync(messagesFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(followsFile)) {
    fs.writeFileSync(followsFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(likesFile)) {
    fs.writeFileSync(likesFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, JSON.stringify([], null, 2));
  }
}

// 讀取 JSON 檔案
function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 寫入 JSON 檔案
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

initializeFiles();

// ==================== 認證中間件 ====================
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: '未授權' });
  }
  req.token = token;
  const lastDashIndex = token.lastIndexOf('-');
  if (lastDashIndex === -1) {
    return res.status(401).json({ error: 'Token 格式無效' });
  }
  req.userId = token.slice(0, lastDashIndex); // Token 格式：userId-timestamp（userId 允許包含 - ）
  next();
}

// ==================== 認證 API ====================

// 註冊
app.post('/api/auth/register', (req, res) => {
  const { username, password, email } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '用戶名和密碼為必填' });
  }

  const users = readJSON(usersFile);
  
  // 檢查用戶名是否已存在
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: '用戶名已存在' });
  }

  const newUser = {
    id: Date.now().toString(),
    username,
    password, // 實際應用應使用密碼加密
    email: email || '',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJSON(usersFile, users);

  res.status(201).json({ 
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    avatar: newUser.avatar,
    message: '註冊成功'
  });
});

// 登入
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '用戶名和密碼為必填' });
  }

  const users = readJSON(usersFile);
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ error: '用戶名或密碼錯誤' });
  }

  // 生成簡單的 Token
  const token = `${user.id}-${Date.now()}`;
  activeTokens.add(token);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      isAdmin: !!user.isAdmin
    }
  });
});

// 登出
app.post('/api/auth/logout', verifyToken, (req, res) => {
  activeTokens.delete(req.token);
  res.json({ message: '登出成功' });
});

// ==================== 忘記密碼 API ====================

// 發送驗證碼
app.post('/api/auth/send-verification-code', (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: '郵箱為必填' });
  }
  
  const users = readJSON(usersFile);
  const user = users.find(u => u.email === email);
  
  if (!user) {
    return res.status(404).json({ error: '郵箱不存在' });
  }
  
  // 生成 6 位數字驗證碼
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // 存儲驗證碼（15 分鐘後過期）
  verificationCodes.set(email, {
    code,
    timestamp: Date.now(),
    userId: user.id
  });
  
  // 開發環境：打印到控制台，生產環境應發送郵件
  console.log(`📧 驗證碼: ${code} (郵箱: ${email})`);
  
  // TODO: 集成真實的郵件服務（如 Nodemailer）
  // 暫時返回成功即可
  
  res.json({ message: '驗證碼已發送' });
});

// 驗證碼驗證
app.post('/api/auth/verify-code', (req, res) => {
  const { email, verificationCode } = req.body;
  
  if (!email || !verificationCode) {
    return res.status(400).json({ error: '郵箱和驗證碼為必填' });
  }
  
  const stored = verificationCodes.get(email);
  
  if (!stored) {
    return res.status(400).json({ error: '驗證碼已過期或不存在' });
  }
  
  // 檢查驗證碼是否在 15 分鐘內
  const expiryTime = 15 * 60 * 1000; // 15 分鐘
  if (Date.now() - stored.timestamp > expiryTime) {
    verificationCodes.delete(email);
    return res.status(400).json({ error: '驗證碼已過期' });
  }
  
  // 驗證碼是否正確
  if (stored.code !== verificationCode) {
    return res.status(400).json({ error: '驗證碼錯誤' });
  }
  
  res.json({ message: '驗證碼正確', valid: true });
});

// 重設密碼
app.post('/api/auth/reset-password', (req, res) => {
  const { email, verificationCode, newPassword } = req.body;
  
  if (!email || !verificationCode || !newPassword) {
    return res.status(400).json({ error: '郵箱、驗證碼和新密碼為必填' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: '密碼至少需要 6 個字符' });
  }
  
  const stored = verificationCodes.get(email);
  
  if (!stored) {
    return res.status(400).json({ error: '驗證碼已過期或不存在' });
  }
  
  // 檢查驗證碼是否在 15 分鐘內
  const expiryTime = 15 * 60 * 1000;
  if (Date.now() - stored.timestamp > expiryTime) {
    verificationCodes.delete(email);
    return res.status(400).json({ error: '驗證碼已過期' });
  }
  
  // 驗證碼是否正確
  if (stored.code !== verificationCode) {
    return res.status(400).json({ error: '驗證碼錯誤' });
  }
  
  // 更新密碼
  const users = readJSON(usersFile);
  const user = users.find(u => u.email === email);
  
  if (!user) {
    return res.status(404).json({ error: '用戶不存在' });
  }
  
  user.password = newPassword;
  writeJSON(usersFile, users);
  
  // 清除已使用的驗證碼
  verificationCodes.delete(email);
  
  res.json({ message: '密碼重設成功' });
});

// 獲取所有用戶
app.get('/api/users', verifyToken, (req, res) => {
  const users = readJSON(usersFile);
  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar
  })));
});

// 搜尋用戶
app.get('/api/users/search/:query', verifyToken, (req, res) => {
  const query = req.params.query.toLowerCase();
  const users = readJSON(usersFile);
  const follows = readJSON(followsFile);
  const posts = readJSON(postsFile);
  
  const results = users
    .filter(u => u.username.toLowerCase().includes(query) && u.id !== req.userId)
    .map(u => {
      const isFollowing = follows.some(f => f.followerId === req.userId && f.followingId === u.id);
      const postsCount = posts.filter(p => p.authorId === u.id).length;
      const followersCount = follows.filter(f => f.followingId === u.id).length;
      const followingCount = follows.filter(f => f.followerId === u.id).length;
      
      return {
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        bio: u.bio || '',
        isFollowing,
        postsCount,
        followersCount,
        followingCount
      };
    });
  
  res.json(results);
});

// 獲取用戶個人資料
app.get('/api/users/:id/profile', verifyToken, (req, res) => {
  const users = readJSON(usersFile);
  const posts = readJSON(postsFile);
  const follows = readJSON(followsFile);
  
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用戶未找到' });
  
  const userPosts = posts.filter(p => p.authorId === user.id).length;
  const followers = follows.filter(f => f.followingId === user.id).length;
  const following = follows.filter(f => f.followerId === user.id).length;
  const isFollowing = follows.some(f => f.followerId === req.userId && f.followingId === user.id);
  
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    email: user.email,
    postsCount: userPosts,
    followers,
    following,
    isFollowing: req.userId === user.id ? null : isFollowing,
    bio: user.bio || ''
  });
});

// 更新用戶資料
app.put('/api/users/:id', verifyToken, (req, res) => {
  if (req.params.id !== req.userId) {
    return res.status(403).json({ error: '只能編輯自己的資料' });
  }
  
  const users = readJSON(usersFile);
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用戶未找到' });
  
  // 允許更新 bio、avatar、email
  user.bio = req.body.bio !== undefined ? req.body.bio : user.bio;
  user.avatar = req.body.avatar !== undefined ? req.body.avatar : user.avatar;
  user.email = req.body.email !== undefined ? req.body.email : user.email;
  
  writeJSON(usersFile, users);
  
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    email: user.email,
    bio: user.bio
  });
});

// ==================== Posts API ====================
app.get('/api/posts', verifyToken, (req, res) => {
  const posts = readJSON(postsFile);
  res.json(posts);
});

app.post('/api/posts', verifyToken, (req, res) => {
  const posts = readJSON(postsFile);
  const newPost = {
    id: Date.now(),
    title: req.body.title,
    content: req.body.content,
    authorId: req.userId,
    author: req.body.author || 'Anonymous',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  posts.push(newPost);
  writeJSON(postsFile, posts);
  broadcastPostUpdate('add', newPost);
  res.status(201).json(newPost);
});

app.put('/api/posts/:id', verifyToken, (req, res) => {
  const posts = readJSON(postsFile);
  const post = posts.find(p => p.id == req.params.id);
  if (!post) return res.status(404).json({ error: '文章未找到' });
  if (post.authorId !== req.userId) return res.status(403).json({ error: '無權限編輯' });
  
  post.title = req.body.title || post.title;
  post.content = req.body.content || post.content;
  post.updatedAt = new Date().toISOString();
  writeJSON(postsFile, posts);
  broadcastPostUpdate('update', post);
  res.json(post);
});

app.delete('/api/posts/:id', verifyToken, (req, res) => {
  const posts = readJSON(postsFile);
  const index = posts.findIndex(p => p.id == req.params.id);
  if (index === -1) return res.status(404).json({ error: '文章未找到' });
  if (posts[index].authorId !== req.userId) return res.status(403).json({ error: '無權限刪除' });
  
  const deleted = posts.splice(index, 1);
  writeJSON(postsFile, posts);
  broadcastPostUpdate('delete', deleted[0]);
  res.json(deleted[0]);
});

// ==================== Feed API ====================

// 獲取信息流（跟隨用戶的貼文）
app.get('/api/feed', verifyToken, (req, res) => {
  const follows = readJSON(followsFile);
  const posts = readJSON(postsFile);
  const likes = readJSON(likesFile);
  
  // 找出當前用戶跟隨的所有用戶
  const followingIds = follows
    .filter(f => f.followerId === req.userId)
    .map(f => f.followingId);
  
  // 包括自己的貼文
  followingIds.push(req.userId);
  
  // 獲取這些用戶的貼文，按時間排序
  const feedPosts = posts
    .filter(p => followingIds.includes(p.authorId))
    .map(p => ({
      ...p,
      likeCount: likes.filter(l => l.postId === p.id).length,
      isLiked: likes.some(l => l.postId === p.id && l.userId === req.userId)
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json(feedPosts);
});

// ==================== 跟隨系統 ====================

// 跟隨用戶
app.post('/api/follow/:userId', verifyToken, (req, res) => {
  if (req.params.userId === req.userId) {
    return res.status(400).json({ error: '不能跟隨自己' });
  }
  
  const follows = readJSON(followsFile);
  
  // 檢查是否已跟隨
  if (follows.some(f => f.followerId === req.userId && f.followingId === req.params.userId)) {
    return res.status(400).json({ error: '已經跟隨此用戶' });
  }
  
  follows.push({
    id: Date.now(),
    followerId: req.userId,
    followingId: req.params.userId,
    createdAt: new Date().toISOString()
  });
  
  writeJSON(followsFile, follows);
  res.json({ message: '已跟隨用戶' });
});

// 取消跟隨
app.delete('/api/follow/:userId', verifyToken, (req, res) => {
  const follows = readJSON(followsFile);
  const index = follows.findIndex(f => f.followerId === req.userId && f.followingId === req.params.userId);
  
  if (index === -1) {
    return res.status(404).json({ error: '未跟隨此用戶' });
  }
  
  follows.splice(index, 1);
  writeJSON(followsFile, follows);
  res.json({ message: '已取消跟隨' });
});

// ==================== 點讚系統 ====================

// 按讚貼文
app.post('/api/posts/:postId/like', verifyToken, (req, res) => {
  const posts = readJSON(postsFile);
  const likes = readJSON(likesFile);
  const users = readJSON(usersFile);
  
  const post = posts.find(p => p.id == req.params.postId);
  if (!post) return res.status(404).json({ error: '貼文未找到' });
  
  const userId = req.userId;
  const existingLike = likes.find(l => l.postId === post.id && l.userId === userId);
  
  if (existingLike) {
    // 取消按讚
    likes.splice(likes.indexOf(existingLike), 1);
  } else {
    // 按讚
    likes.push({
      id: Date.now().toString(),
      postId: post.id,
      userId,
      createdAt: new Date().toISOString()
    });
    
    // 創建通知給貼文作者（如果不是自己按讚）
    if (post.authorId !== userId) {
      const liker = users.find(u => u.id === userId);
      createNotification(post.authorId, `${liker.username} 按讚了你的貼文「${post.title}」`, 'like');
    }
  }
  
  writeJSON(likesFile, likes);
  res.json({ liked: !existingLike });
});

// 取消點讚
app.delete('/api/posts/:id/like', verifyToken, (req, res) => {
  const likes = readJSON(likesFile);
  const index = likes.findIndex(l => l.postId == req.params.id && l.userId === req.userId);
  
  if (index === -1) {
    return res.status(404).json({ error: '未點讚' });
  }
  
  likes.splice(index, 1);
  writeJSON(likesFile, likes);
  res.json({ message: '已取消點讚' });
});

// ==================== 留言系統 ====================

// 新增留言
app.post('/api/posts/:id/comments', verifyToken, (req, res) => {
  const posts = readJSON(postsFile);
  if (!posts.find(p => p.id == req.params.id)) {
    return res.status(404).json({ error: '貼文未找到' });
  }
  
  const comments = readJSON(commentsFile);
  const newComment = {
    id: Date.now(),
    postId: req.params.id,
    userId: req.userId,
    content: req.body.content,
    username: req.body.username,
    avatar: req.body.avatar,
    createdAt: new Date().toISOString()
  };
  
  comments.push(newComment);
  writeJSON(commentsFile, comments);
  broadcastCommentUpdate('add', newComment);
  
  res.status(201).json(newComment);
});

// 獲取留言
app.get('/api/posts/:id/comments', verifyToken, (req, res) => {
  const comments = readJSON(commentsFile);
  const postComments = comments
    .filter(c => c.postId == req.params.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  res.json(postComments);
});

// 刪除留言
app.delete('/api/comments/:id', verifyToken, (req, res) => {
  const comments = readJSON(commentsFile);
  const index = comments.findIndex(c => c.id == req.params.id);
  
  if (index === -1) return res.status(404).json({ error: '留言未找到' });
  if (comments[index].userId !== req.userId) return res.status(403).json({ error: '無權限' });
  
  const deleted = comments.splice(index, 1);
  writeJSON(commentsFile, comments);
  broadcastCommentUpdate('delete', deleted[0]);
  
  res.json(deleted[0]);
});

// ==================== Messages API （私訊系統） ====================

// 獲取與特定用戶的私訊
app.get('/api/messages/:recipientId', verifyToken, (req, res) => {
  const messages = readJSON(messagesFile);
  const senderId = req.userId;
  const recipientId = req.params.recipientId;

  const conversation = messages.filter(m => 
    (m.senderId === senderId && m.recipientId === recipientId) ||
    (m.senderId === recipientId && m.recipientId === senderId)
  );

  res.json(conversation);
});

// 發送私訊
app.post('/api/messages', verifyToken, (req, res) => {
  const { recipientId, content } = req.body;
  
  if (!recipientId || !content) {
    return res.status(400).json({ error: '收件人和內容為必填' });
  }

  const messages = readJSON(messagesFile);
  const newMessage = {
    id: Date.now(),
    senderId: req.userId,
    recipientId,
    content,
    timestamp: new Date().toISOString(),
    isRead: false
  };

  messages.push(newMessage);
  writeJSON(messagesFile, messages);
  broadcastMessage(newMessage);

  res.status(201).json(newMessage);
});

// 標記訊息為已讀
app.put('/api/messages/:messageId/read', verifyToken, (req, res) => {
  const messages = readJSON(messagesFile);
  const message = messages.find(m => m.id == req.params.messageId);
  
  if (!message) return res.status(404).json({ error: '訊息未找到' });
  if (message.recipientId !== req.userId) return res.status(403).json({ error: '無權限' });

  message.isRead = true;
  writeJSON(messagesFile, messages);
  res.json(message);
});

// 刪除訊息（收回功能）
app.delete('/api/messages/:messageId', verifyToken, (req, res) => {
  const messages = readJSON(messagesFile);
  const messageIndex = messages.findIndex(m => m.id == req.params.messageId);
  
  if (messageIndex === -1) {
    return res.status(404).json({ error: '訊息未找到' });
  }
  
  const message = messages[messageIndex];
  
  // 只允許發送者刪除自己的訊息
  if (message.senderId !== req.userId) {
    return res.status(403).json({ error: '只能刪除自己的訊息' });
  }
  
  // 刪除訊息
  messages.splice(messageIndex, 1);
  writeJSON(messagesFile, messages);
  
  res.json({ success: true });
});

// 按讚訊息
app.post('/api/messages/:messageId/like', verifyToken, (req, res) => {
  const messages = readJSON(messagesFile);
  const message = messages.find(m => m.id == req.params.messageId);
  
  if (!message) {
    return res.status(404).json({ error: '訊息未找到' });
  }
  
  // 初始化按讚數據
  if (!message.likes) {
    message.likes = [];
  }
  
  const userId = req.userId;
  const likeIndex = message.likes.indexOf(userId);
  
  if (likeIndex === -1) {
    // 按讚
    message.likes.push(userId);
  } else {
    // 取消按讚
    message.likes.splice(likeIndex, 1);
  }
  
  writeJSON(messagesFile, messages);
  
  res.json({ 
    liked: likeIndex === -1,
    likesCount: message.likes.length
  });
});

// ==================== 管理員 API ====================

// 檢查是否為管理員
function checkAdmin(req, res, next) {
  const users = readJSON(usersFile);
  const user = users.find(u => u.id === req.userId);
  
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: '需要管理員權限' });
  }
  
  next();
}

// 獲取所有用戶
app.get('/api/admin/users', verifyToken, checkAdmin, (req, res) => {
  const users = readJSON(usersFile);
  const follows = readJSON(followsFile);
  const posts = readJSON(postsFile);
  
  const usersWithStats = users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    avatar: u.avatar,
    bio: u.bio,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
    postsCount: posts.filter(p => p.authorId === u.id).length,
    followersCount: follows.filter(f => f.followingId === u.id).length,
    followingCount: follows.filter(f => f.followerId === u.id).length
  }));
  
  res.json(usersWithStats);
});

// 刪除用戶
app.delete('/api/admin/users/:userId', verifyToken, checkAdmin, (req, res) => {
  const users = readJSON(usersFile);
  const posts = readJSON(postsFile);
  const follows = readJSON(followsFile);
  const likes = readJSON(likesFile);
  const comments = readJSON(commentsFile);
  const messages = readJSON(messagesFile);
  const notifications = readJSON(notificationsFile);
  
  const userId = req.params.userId;
  const currentUser = users.find(u => u.id === req.userId);
  
  // 不能刪除自己
  if (userId === req.userId) {
    return res.status(403).json({ error: '不能刪除自己' });
  }
  
  // 只有超級管理員才能刪除其他管理員（第一個管理員）
  const userToDelete = users.find(u => u.id === userId);
  if (!userToDelete) {
    return res.status(404).json({ error: '用戶未找到' });
  }
  
  if (userToDelete.isAdmin && currentUser.username !== 'allen') {
    return res.status(403).json({ error: '只有超級管理員才能刪除其他管理員' });
  }
  
  // 刪除用戶的所有數據
  const filteredUsers = users.filter(u => u.id !== userId);
  const filteredPosts = posts.filter(p => p.authorId !== userId);
  const filteredFollows = follows.filter(f => f.followerId !== userId && f.followingId !== userId);
  const filteredLikes = likes.filter(l => l.userId !== userId);
  const filteredComments = comments.filter(c => c.userId !== userId);
  const filteredMessages = messages.filter(m => m.senderId !== userId && m.recipientId !== userId);
  const filteredNotifications = notifications.filter(n => n.userId !== userId);
  
  writeJSON(usersFile, filteredUsers);
  writeJSON(postsFile, filteredPosts);
  writeJSON(followsFile, filteredFollows);
  writeJSON(likesFile, filteredLikes);
  writeJSON(commentsFile, filteredComments);
  writeJSON(messagesFile, filteredMessages);
  writeJSON(notificationsFile, filteredNotifications);
  
  res.json({ success: true, message: `用戶 ${userToDelete.username} 已刪除` });
});

// 刪除文章
app.delete('/api/admin/posts/:postId', verifyToken, checkAdmin, (req, res) => {
  const posts = readJSON(postsFile);
  const likes = readJSON(likesFile);
  const comments = readJSON(commentsFile);
  
  const postId = req.params.postId;
  
  // 刪除文章
  const filteredPosts = posts.filter(p => p.id != postId);
  const filteredLikes = likes.filter(l => l.postId != postId);
  const filteredComments = comments.filter(c => c.postId != postId);
  
  writeJSON(postsFile, filteredPosts);
  writeJSON(likesFile, filteredLikes);
  writeJSON(commentsFile, filteredComments);
  
  res.json({ success: true, message: '文章已刪除' });
});

// 清除所有數據（超級管理員專用）
app.delete('/api/admin/clear-all', verifyToken, checkAdmin, (req, res) => {
  const users = readJSON(usersFile);
  const posts = readJSON(postsFile);
  const follows = readJSON(followsFile);
  const likes = readJSON(likesFile);
  const comments = readJSON(commentsFile);
  const messages = readJSON(messagesFile);
  const notifications = readJSON(notificationsFile);
  
  // 清除所有數據（除了超級管理員）
  const superAdmin = users.find(u => u.username === 'allen');
  if (!superAdmin) {
    return res.status(403).json({ error: '只有超級管理員才能清除所有數據' });
  }
  
  // 保留超級管理員和普通管理員的帳號
  const adminUsers = users.filter(u => u.isAdmin);
  const filteredUsers = users.filter(u => !u.isAdmin);
  
  // 清除普通用戶的所有數據
  const filteredUserIds = filteredUsers.map(u => u.id);
  
  const finalUsers = [...adminUsers, superAdmin]; // 保留所有管理員
  const finalPosts = posts.filter(p => !filteredUserIds.includes(p.authorId));
  const finalFollows = follows.filter(f => !filteredUserIds.includes(f.followerId) && !filteredUserIds.includes(f.followingId));
  const finalLikes = likes.filter(l => !filteredUserIds.includes(l.userId));
  const finalComments = comments.filter(c => !filteredUserIds.includes(c.userId));
  const finalMessages = messages.filter(m => !filteredUserIds.includes(m.senderId) && !filteredUserIds.includes(m.recipientId));
  const finalNotifications = notifications.filter(n => !filteredUserIds.includes(n.userId));
  
  // 寫入清空後的數據
  writeJSON(usersFile, finalUsers);
  writeJSON(postsFile, finalPosts);
  writeJSON(followsFile, finalFollows);
  writeJSON(likesFile, finalLikes);
  writeJSON(commentsFile, finalComments);
  writeJSON(messagesFile, finalMessages);
  writeJSON(notificationsFile, finalNotifications);
  
  res.json({ 
    success: true, 
    message: '已清除所有普通用戶數據',
    stats: {
      usersKept: finalUsers.length,
      usersDeleted: filteredUsers.length,
      postsDeleted: posts.length - finalPosts.length,
      commentsDeleted: comments.length - finalComments.length,
      messagesDeleted: messages.length - finalMessages.length
    }
  });
});

// 清除所有數據（超級管理員專用）
app.delete('/api/admin/clear-all', verifyToken, checkAdmin, (req, res) => {
  const users = readJSON(usersFile);
  const posts = readJSON(postsFile);
  const follows = readJSON(followsFile);
  const likes = readJSON(likesFile);
  const comments = readJSON(commentsFile);
  const messages = readJSON(messagesFile);
  const notifications = readJSON(notificationsFile);
  
  // 檢查是否為超級管理員
  const superAdmin = users.find(u => u.username === 'allen');
  if (!superAdmin) {
    return res.status(403).json({ error: '只有超級管理員才能清除所有數據' });
  }
  
  // 保留超級管理員和普通管理員的帳號
  const adminUsers = users.filter(u => u.isAdmin);
  const filteredUsers = users.filter(u => !u.isAdmin);
  
  // 清除普通用戶的所有數據
  const filteredUserIds = filteredUsers.map(u => u.id);
  const finalUsers = [...adminUsers, superAdmin];
  
  const finalPosts = posts.filter(p => !filteredUserIds.includes(p.authorId));
  const finalFollows = follows.filter(f => !filteredUserIds.includes(f.followerId) && !filteredUserIds.includes(f.followingId));
  const finalLikes = likes.filter(l => !filteredUserIds.includes(l.userId));
  const finalComments = comments.filter(c => !filteredUserIds.includes(c.userId));
  const finalMessages = messages.filter(m => !filteredUserIds.includes(m.senderId) && !filteredUserIds.includes(m.recipientId));
  const finalNotifications = notifications.filter(n => !filteredUserIds.includes(n.userId));
  
  // 寫入清理後的數據
  writeJSON(usersFile, finalUsers);
  writeJSON(postsFile, finalPosts);
  writeJSON(followsFile, finalFollows);
  writeJSON(likesFile, finalLikes);
  writeJSON(commentsFile, finalComments);
  writeJSON(messagesFile, finalMessages);
  writeJSON(notificationsFile, finalNotifications);
  
  res.json({ 
    success: true, 
    message: '已清除所有普通用戶數據',
    stats: {
      usersKept: finalUsers.length,
      usersDeleted: filteredUsers.length,
      postsDeleted: posts.length - finalPosts.length,
      commentsDeleted: comments.length - finalComments.length,
      messagesDeleted: messages.length - finalMessages.length,
      notificationsDeleted: notifications.length - finalNotifications.length
    }
  });
});

// 獲取用戶的粉絲列表
app.get('/api/users/:userId/followers', verifyToken, (req, res) => {
  const follows = readJSON(followsFile);
  const users = readJSON(usersFile);
  const followers = follows
    .filter(f => f.followingId === req.params.userId)
    .map(f => {
      const user = users.find(u => u.id === f.followerId);
      return {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio || '',
        followedAt: f.createdAt
      };
    });
  
  res.json(followers);
});

// 獲取用戶的追蹤列表
app.get('/api/users/:userId/following', verifyToken, (req, res) => {
  const follows = readJSON(followsFile);
  const users = readJSON(usersFile);
  const following = follows
    .filter(f => f.followerId === req.params.userId)
    .map(f => {
      const user = users.find(u => u.id === f.followingId);
      return {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio || '',
        followedAt: f.createdAt
      };
    });
  
  res.json(following);
});

// ==================== Notifications API ====================

// 獲取用戶通知
app.get('/api/notifications', verifyToken, (req, res) => {
  const notifications = readJSON(notificationsFile);
  const userNotifications = notifications
    .filter(n => n.userId === req.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json(userNotifications);
});

// 標記通知為已讀
app.put('/api/notifications/:notificationId/read', verifyToken, (req, res) => {
  const notifications = readJSON(notificationsFile);
  const notification = notifications.find(n => n.id == req.params.notificationId);
  
  if (!notification) {
    return res.status(404).json({ error: '通知未找到' });
  }
  
  if (notification.userId !== req.userId) {
    return res.status(403).json({ error: '無權限' });
  }
  
  notification.read = true;
  writeJSON(notificationsFile, notifications);
  
  res.json({ success: true });
});

// 清除所有通知
app.delete('/api/notifications', verifyToken, (req, res) => {
  const notifications = readJSON(notificationsFile);
  const filteredNotifications = notifications.filter(n => n.userId !== req.userId);
  
  writeJSON(notificationsFile, filteredNotifications);
  
  res.json({ success: true });
});

// 創建通知（內部函數）
function createNotification(userId, content, type = 'follow') {
  const notifications = readJSON(notificationsFile);
  const notification = {
    id: Date.now().toString(),
    userId,
    content,
    type,
    read: false,
    createdAt: new Date().toISOString()
  };
  
  notifications.push(notification);
  writeJSON(notificationsFile, notifications);
  
  return notification;
}

// 修改追蹤API以添加通知
app.post('/api/follow/:userId', verifyToken, (req, res) => {
  const follows = readJSON(followsFile);
  const users = readJSON(usersFile);
  
  const followerId = req.userId;
  const followingId = req.params.userId;
  
  if (followerId === followingId) {
    return res.status(400).json({ error: '不能追蹤自己' });
  }
  
  // 檢查是否已經追蹤
  const existingFollow = follows.find(f => 
    f.followerId === followerId && f.followingId === followingId
  );
  
  if (existingFollow) {
    return res.status(400).json({ error: '已經追蹤了' });
  }
  
  // 添加追蹤記錄
  follows.push({
    id: Date.now().toString(),
    followerId,
    followingId,
    createdAt: new Date().toISOString()
  });
  
  writeJSON(followsFile, follows);
  
  // 獲取追蹤者信息
  const follower = users.find(u => u.id === followerId);
  
  // 創建通知給被追蹤者
  createNotification(followingId, `${follower.username} 開始追蹤你了！`, 'follow');
  
  res.json({ success: true });
});

// 獲取對話列表（最近的對話）
app.get('/api/conversations', verifyToken, (req, res) => {
  const messages = readJSON(messagesFile);
  const userId = req.userId;
  const users = readJSON(usersFile);

  // 找出所有與當前用戶有對話的用戶
  const conversationUsers = new Map();
  
  messages.forEach(msg => {
    if (msg.senderId === userId) {
      if (!conversationUsers.has(msg.recipientId)) {
        conversationUsers.set(msg.recipientId, msg);
      } else if (msg.timestamp > conversationUsers.get(msg.recipientId).timestamp) {
        conversationUsers.set(msg.recipientId, msg);
      }
    } else if (msg.recipientId === userId) {
      if (!conversationUsers.has(msg.senderId)) {
        conversationUsers.set(msg.senderId, msg);
      } else if (msg.timestamp > conversationUsers.get(msg.senderId).timestamp) {
        conversationUsers.set(msg.senderId, msg);
      }
    }
  });

  // 獲取未讀計數
  const conversations = Array.from(conversationUsers.entries()).map(([otherUserId, lastMessage]) => {
    const otherUser = users.find(u => u.id === otherUserId);
    const unreadCount = messages.filter(m => 
      m.recipientId === userId && m.senderId === otherUserId && !m.isRead
    ).length;

    return {
      userId: otherUserId,
      username: otherUser?.username || '未知用戶',
      avatar: otherUser?.avatar,
      lastMessage: lastMessage.content,
      lastMessageTime: lastMessage.timestamp,
      unreadCount
    };
  }).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

  res.json(conversations);
});

// ==================== WebSocket 設定 ====================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const chatClients = new Map(); // { userId: Set<WebSocket> }
const postClients = new Set();

wss.on('connection', (ws) => {
  let userId = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      if (message.type === 'auth') {
        userId = message.userId;
        if (!chatClients.has(userId)) {
          chatClients.set(userId, new Set());
        }
        chatClients.get(userId).add(ws);
        console.log(`用戶 ${userId} 已連接`);
      } else if (message.type === 'subscribe-posts') {
        postClients.add(ws);
      }
    } catch (e) {
      console.error('WebSocket 消息解析錯誤:', e);
    }
  });

  ws.on('close', () => {
    if (userId && chatClients.has(userId)) {
      chatClients.get(userId).delete(ws);
      if (chatClients.get(userId).size === 0) {
        chatClients.delete(userId);
      }
    }
    postClients.delete(ws);
  });
});

function broadcastMessage(message) {
  // 發送給收件人
  if (chatClients.has(message.recipientId)) {
    chatClients.get(message.recipientId).forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ 
          type: 'new-message', 
          data: message 
        }));
      }
    });
  }
}

function broadcastPostUpdate(action, post) {
  postClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'post-update', action, data: post }));
    }
  });
}

function broadcastCommentUpdate(action, comment) {
  postClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'comment-update', action, data: comment }));
    }
  });
}

// ==================== 啟動伺服器 ====================
server.listen(PORT, () => {
  console.log(`🚀 伺服器運行在 http://localhost:${PORT}`);
  console.log(`📁 數據存放在: ${dbDir}`);
});
