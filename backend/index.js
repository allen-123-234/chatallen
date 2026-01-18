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
// 增加 JSON 解析限制以支援 Base64 圖片
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// 使用者 Token 存儲（簡單實現）
const activeTokens = new Set();

// 添加 Token 驗證端點（用於前端重新連接）
app.post('/api/auth/verify-token', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(400).json({ error: '沒有 Token' });
  }
  
  // 令牌格式檢查 (userId-timestamp)
  const parts = token.split('-');
  if (parts.length < 2) {
    return res.status(401).json({ error: 'Token 格式無效' });
  }
  
  // Token 有效（格式正確），添加到 activeTokens
  activeTokens.add(token);
  res.json({ valid: true });
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
  req.userId = token.split('-')[0]; // Token 格式：userId-timestamp
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
      avatar: user.avatar
    }
  });
});

// 登出
app.post('/api/auth/logout', verifyToken, (req, res) => {
  activeTokens.delete(req.token);
  res.json({ message: '登出成功' });
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
  user.email = req.body.email !== undefined ? req.body.email : user.email;
  
  // 處理 avatar 更新 - 驗證 Base64 大小
  if (req.body.avatar !== undefined) {
    // 如果是 Base64 圖片（長度超過 100），驗證大小
    if (req.body.avatar.startsWith('data:image')) {
      const base64Size = Buffer.byteLength(req.body.avatar, 'utf8');
      // 限制為 3MB
      if (base64Size > 3 * 1024 * 1024) {
        return res.status(413).json({ error: '圖片檔案過大，請使用小於 3MB 的圖片' });
      }
    }
    user.avatar = req.body.avatar;
  }
  
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

// 點讚
app.post('/api/posts/:id/like', verifyToken, (req, res) => {
  const posts = readJSON(postsFile);
  if (!posts.find(p => p.id == req.params.id)) {
    return res.status(404).json({ error: '貼文未找到' });
  }
  
  const likes = readJSON(likesFile);
  
  if (likes.some(l => l.postId == req.params.id && l.userId === req.userId)) {
    return res.status(400).json({ error: '已點讚' });
  }
  
  likes.push({
    id: Date.now(),
    postId: req.params.id,
    userId: req.userId,
    createdAt: new Date().toISOString()
  });
  
  writeJSON(likesFile, likes);
  res.json({ message: '已點讚' });
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
