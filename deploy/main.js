// 配置
let baseURL = localStorage.getItem('baseURL') || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'http://localhost:3000' 
    : 'https://app-lin-git-main-linjunyuans-projects.vercel.app'; // 後端 API (Vercel)
let currentUser = null;
let currentToken = null;
let selectedUserId = null;
let ws = null;
let allUsers = [];
let allAdminUsers = []; // 管理員專用用戶列表
let currentPage = 'feed';
let wsRetryCount = 0;

// 全局錯誤捕捉
window.addEventListener('error', (event) => {
  console.error('❌ 全局錯誤:', event.error);
  console.error('   堆疊:', event.error?.stack);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ 未捕捉的 Promise 拒絕:', event.reason);
  console.error('   堆疊:', event.reason?.stack);
});

// 防止意外的頁面導航
// ==================== 頁面切換 ====================
function showMainPage() {
  const authPage = document.getElementById('authPage');
  const mainPage = document.getElementById('mainPage');
  
  console.log('🔄 切換到主頁面');
  console.log('authPage:', authPage);
  console.log('mainPage:', mainPage);
  
  if (authPage) {
    authPage.style.display = 'none';
    console.log('✅ 隱藏認證頁面');
  }
  if (mainPage) {
    mainPage.classList.remove('hidden');
    mainPage.style.display = 'flex';
    console.log('✅ 顯示主頁面');
  }
}

function showAuthPage() {
  const authPage = document.getElementById('authPage');
  const mainPage = document.getElementById('mainPage');
  
  console.log('🔄 切換到認證頁面');
  
  if (authPage) {
    authPage.style.display = 'flex';
    console.log('✅ 顯示認證頁面');
  }
  if (mainPage) {
    mainPage.classList.add('hidden');
    mainPage.style.display = 'none';
    console.log('✅ 隱藏主頁面');
  }
}

function switchMainPage(page) {
  // 隱藏所有頁面
  const feedPage = document.getElementById('feedPage');
  const postPage = document.getElementById('postPage');
  const chatPage = document.getElementById('chatPage');
  const profilePage = document.getElementById('profilePage');
  const adminPage = document.getElementById('adminPage');
  
  if (!feedPage || !postPage || !chatPage || !profilePage || !adminPage) {
    console.error('某些頁面元素未找到');
    return;
  }
  
  // 移除所有 active 狀態
  feedPage.classList.remove('active');
  postPage.classList.remove('active');
  chatPage.classList.remove('active');
  profilePage.classList.remove('active');
  adminPage.classList.remove('active');
  
  // 移除所有導航按鈕的 active 狀態
  document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => btn.classList.remove('active'));
  
  // 顯示對應頁面並設定導航按鈕
  if (page === 'feed') {
    feedPage.classList.add('active');
    const navBtns = document.querySelectorAll('.bottom-nav .nav-btn');
    if (navBtns[0]) navBtns[0].classList.add('active');
    loadFeed();
  } else if (page === 'post') {
    postPage.classList.add('active');
    const navBtns = document.querySelectorAll('.bottom-nav .nav-btn');
    if (navBtns[1]) navBtns[1].classList.add('active');
    loadPosts();
  } else if (page === 'chat') {
    chatPage.classList.add('active');
    const navBtns = document.querySelectorAll('.bottom-nav .nav-btn');
    if (navBtns[2]) navBtns[2].classList.add('active');
    loadConversations();
  } else if (page === 'profile') {
    profilePage.classList.add('active');
    const navBtns = document.querySelectorAll('.bottom-nav .nav-btn');
    if (navBtns[3]) navBtns[3].classList.add('active');
    loadUserProfile(currentUser.id);
  } else if (page === 'admin') {
    adminPage.classList.add('active');
    loadAdminData();
  }
}

// ==================== 認證 Tab 切換 ====================
function switchAuthTab(tab, event) {
  // 防止默認行為
  if (event) {
    event.preventDefault?.();
  }
  
  console.log('🔄 切換認證標籤:', tab);
  
  document.querySelectorAll('.auth-tab').forEach(btn => btn.classList.remove('active'));
  
  // 設置正確的標籤為 active
  const activeBtn = document.querySelector(`.auth-tab[onclick="switchAuthTab('${tab}'"]`) || 
                   document.querySelector(`.auth-tab:${tab === 'login' ? 'first' : 'last'}-of-type`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
  const activeForm = document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm');
  if (activeForm) {
    activeForm.classList.add('active');
  }
}

// ==================== 登入/註冊 ====================
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const response = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      showAuthError(data.error);
      return;
    }

    // 儲存登入信息
    currentToken = data.token;
    currentUser = data.user;
    localStorage.setItem('token', currentToken);
    localStorage.setItem('user', JSON.stringify(currentUser));

    // 檢查是否為管理員，顯示管理員按鈕
    if (currentUser && (currentUser.username === 'allen' || currentUser.username === 'ab')) {
      const adminBtn = document.getElementById('adminBtn');
      if (adminBtn) {
        adminBtn.style.display = 'inline-block';
      }
    }
    
    // 更新 UI
    const currentUserEl = document.getElementById('currentUser');
    const userAvatarEl = document.getElementById('userAvatar');
    if (currentUserEl && userAvatarEl) {
      currentUserEl.textContent = currentUser.username;
      userAvatarEl.src = currentUser.avatar;
    }

    // 載入數據
    showMainPage();
    
    // 使用 setTimeout 和錯誤捕捉
    setTimeout(() => {
      try {
        console.log('📡 開始加載數據...');
        connectWebSocket(); // 啟用 WebSocket
        loadConversations().catch(e => console.error('loadConversations 錯誤:', e));
        loadFeed().catch(e => console.error('loadFeed 錯誤:', e));
        loadPosts().catch(e => console.error('loadPosts 錯誤:', e));
        loadAllUsers().catch(e => console.error('loadAllUsers 錯誤:', e));
        loadUserProfile(currentUser.id).catch(e => console.error('loadUserProfile 錯誤:', e));
        switchMainPage('feed'); // 啟用頁面切換
        console.log('✅ 所有功能已啟用');
      } catch (error) {
        console.error('登入後數據加載錯誤:', error);
      }
    }, 100);
  } catch (error) {
    showAuthError('網絡錯誤，請檢查伺服器連接');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value;
  const password = document.getElementById('registerPassword').value;
  const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
  const email = document.getElementById('registerEmail').value;
  const avatarSeed = document.getElementById('registerAvatar').value;

  if (password !== passwordConfirm) {
    showAuthError('密碼不一致');
    return;
  }

  try {
    const response = await fetch(`${baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username, 
        password, 
        email,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      showAuthError(data.error);
      return;
    }

    showAuthError('');
    alert('註冊成功！請登入');
    
    // 清空表單
    document.getElementById('registerForm').reset();
    document.getElementById('avatarPreviewImg').src = '';
    switchAuthTab('login');
  } catch (error) {
    showAuthError('網絡錯誤');
  }
}

function showAuthError(message) {
  const errorDiv = document.getElementById('authError');
  if (message) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
  } else {
    errorDiv.classList.remove('show');
  }
}

async function handleLogout() {
  if (!confirm('確定要登出嗎？')) return;

  try {
    await fetch(`${baseURL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
  } catch (error) {
    console.error('登出出錯:', error);
  }

  // 清空存儲
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentToken = null;
  currentUser = null;
  selectedUserId = null;

  if (ws) {
    ws.close();
  }

  showAuthPage();
  
  // 清空表單
  document.getElementById('loginForm').reset();
}

// ==================== 搜尋用戶 ====================
async function handleSearch() {
  const query = document.getElementById('searchInput').value.trim();
  const resultsDiv = document.getElementById('searchResults');

  if (!query) {
    resultsDiv.classList.remove('show');
    return;
  }

  try {
    const response = await fetch(`${baseURL}/api/users/search/${query}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const results = await response.json();

    if (results.length === 0) {
      resultsDiv.innerHTML = '<div class="search-result-item" style="cursor: default;">找不到用戶</div>';
    } else {
      resultsDiv.innerHTML = results.map(user => `
        <div class="search-result-item">
          <img src="${user.avatar}" alt="${user.username}">
          <div class="search-result-info">
            <div class="search-result-name">${escapeHtml(user.username)}</div>
            <div class="search-result-id">ID: ${escapeHtml(user.id)}</div>
            <div style="font-size: 12px; color: #999; margin-top: 3px;">
              ${user.postsCount} 篇文章 • ${user.followersCount} 粉絲 • 追蹤 ${user.followingCount}
            </div>
          </div>
          <div class="search-result-actions">
            <button onclick="toggleFollowFromSearch('${user.id}', ${user.isFollowing})">${user.isFollowing ? '✓ 已追蹤' : '+ 交朋友'}</button>
            <button onclick="startDM('${user.id}', '${user.username}', '${user.avatar}')">💬 私訊</button>
          </div>
        </div>
      `).join('');
    }

    resultsDiv.classList.add('show');
  } catch (error) {
    console.error('搜尋失敗:', error);
  }
}

function startDM(userId, username, avatar) {
  selectedUserId = userId;
  currentSelectedConversation = userId;
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').classList.remove('show');
  
  console.log('🚀 開始新的私訊:', userId, username);
  
  // 直接顯示聊天界面，不需要等待聊天列表載入
  switchMainPage('chat');
  
  // 立即顯示聊天界面
  selectConversation(userId, username, avatar);
}

function viewProfile(userId) {
  loadUserProfile(userId);
  switchMainPage('profile');
}

function toggleFollowFromSearch(userId, isFollowing) {
  toggleFollow(userId, isFollowing);
}

// ==================== 狀態指示器 ====================
function updateStatus(connected) {
  const indicator = document.getElementById('statusIndicator');
  if (!indicator) return;
  
  if (connected) {
    indicator.classList.remove('disconnected');
  } else {
    indicator.classList.add('disconnected');
  }
}

// ==================== 用戶列表 ====================
async function loadAllUsers() {
  try {
    const response = await fetch(`${baseURL}/api/users`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    allUsers = await response.json();
  } catch (error) {
    console.error('載入用戶列表失敗:', error);
  }
}

async function loadUserProfile(userId) {
  userId = userId || currentUser.id;

  try {
    const response = await fetch(`${baseURL}/api/users/${userId}/profile`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const profile = await response.json();
    renderUserProfile(profile);
    
    // 檢查是否為管理員，顯示管理員按鈕
    if (currentUser && (currentUser.username === 'allen' || currentUser.username === 'ab')) {
      const adminBtn = document.getElementById('adminBtn');
      if (adminBtn) {
        adminBtn.style.display = 'inline-block';
      }
    }
  } catch (error) {
    console.error('載入個人資料失敗:', error);
  }
}

function renderUserProfile(profile) {
  const card = document.getElementById('profileCard');
  if (!card) return;
  const isMyProfile = currentUser && profile.id === currentUser.id;
  
  card.innerHTML = `
    <img src="${profile.avatar}" alt="${profile.username}" class="profile-avatar">
    <div class="profile-name">${escapeHtml(profile.username)}</div>
    <div class="profile-username">@${escapeHtml(profile.username)}</div>
    
    <div class="profile-stats">
      <div class="profile-stat">
        <div class="profile-stat-value" onclick="showFollowers('${profile.id}')" style="cursor: pointer; color: #007bff; text-decoration: underline;">${profile.followers}</div>
        <div class="profile-stat-label">粉絲</div>
      </div>
      <div class="profile-stat">
        <div class="profile-stat-value" onclick="showFollowing('${profile.id}')" style="cursor: pointer; color: #007bff; text-decoration: underline;">${profile.following}</div>
        <div class="profile-stat-label">跟隨</div>
      </div>
    </div>

    ${profile.isFollowing !== null ? `
      <button class="profile-follow-btn ${profile.isFollowing ? 'following' : ''}" 
              onclick="toggleFollow('${profile.id}', ${profile.isFollowing})">
        ${profile.isFollowing ? '✓ 已跟隨' : '+ 跟隨'}
      </button>
    ` : ''}

    <p style="margin-top: 15px; color: #666; font-size: 14px;">${escapeHtml(profile.bio)}</p>

    ${isMyProfile ? `
      <button class="logout-btn" onclick="handleLogout()" style="width: 100%; margin-top: 12px;">登出</button>
    ` : ''}
  `;
}

async function toggleFollow(userId, isFollowing) {
  try {
    const method = isFollowing ? 'DELETE' : 'POST';
    const response = await fetch(`${baseURL}/api/follow/${userId}`, {
      method,
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (response.ok) {
      loadUserProfile(userId);
    }
  } catch (error) {
    console.error('跟隨操作失敗:', error);
  }
}

// ==================== 對話列表 ====================
async function loadConversations() {
  try {
    const response = await fetch(`${baseURL}/api/conversations`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (!response.ok) {
      throw new Error(`API 錯誤: ${response.status}`);
    }
    
    const conversations = await response.json();
    
    // 確保 conversations 是數組
    if (!Array.isArray(conversations)) {
      console.warn('API 返回的 conversations 不是數組:', conversations);
      renderConversations([]);
      return;
    }
    
    renderConversations(conversations);
    updateStatus(true);
  } catch (error) {
    console.error('載入對話列表失敗:', error);
    renderConversations([]);
    updateStatus(false);
  }
}

function renderConversations(conversations) {
  const container = document.getElementById('chatList');
  if (!container) return;
  
  if (conversations.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #999;">
        <div style="font-size: 48px; margin-bottom: 10px;">💬</div>
        <div>還沒有聊天記錄</div>
        <div style="font-size: 12px; margin-top: 5px;">搜尋用戶後點擊"私訊"開始聊天</div>
      </div>
    `;
    return;
  }

  container.innerHTML = conversations.map(conv => `
    <div class="chat-item ${selectedUserId === conv.userId ? 'active' : ''}" 
         data-userId="${conv.userId}"
         onclick="enterChatRoom('${conv.userId}', '${conv.username}', '${conv.avatar}')">
      <img src="${conv.avatar}" alt="${conv.username}" class="chat-avatar">
      <div class="chat-info">
        <div class="chat-name">${escapeHtml(conv.username)}</div>
      </div>
    </div>
  `).join('');
}

function enterChatRoom(userId, username, avatar) {
  selectedUserId = userId;
  currentSelectedConversation = userId;
  console.log('🚀 進入聊天室:', userId, username);
  
  // 隱藏聊天列表，顯示聊天室
  const chatList = document.getElementById('chatList');
  const chatArea = document.getElementById('chatArea');
  const chatContainer = document.querySelector('.chat-container');
  
  if (chatList && chatArea && chatContainer) {
    chatList.style.display = 'none';
    chatContainer.style.gridTemplateColumns = '1fr';
    
    // 添加返回按鈕到聊天頭部
    const chatHTML = `
      <div class="chat-header">
        <button onclick="exitChatRoom()" class="back-btn">← 返回</button>
        <img src="${avatar}" alt="${username}" class="chat-avatar">
        <div class="chat-info">
          <div class="chat-name">${escapeHtml(username)}</div>
        </div>
      </div>
      <div class="messages-container" id="messagesContainer"></div>
      <div class="message-input-container">
        <input type="text" id="messageInput" placeholder="輸入訊息..." onkeypress="if(event.key==='Enter') sendMessage()">
        <button onclick="sendMessage()">發送</button>
      </div>
    `;
    chatArea.innerHTML = chatHTML;
    
    // 載入訊息
    loadMessages();
  }
}

function exitChatRoom() {
  console.log('🔙 退出聊天室');
  
  // 顯示聊天列表
  const chatList = document.getElementById('chatList');
  const chatArea = document.getElementById('chatArea');
  const chatContainer = document.querySelector('.chat-container');
  
  if (chatList && chatArea && chatContainer) {
    chatList.style.display = 'block';
    chatContainer.style.gridTemplateColumns = '300px 1fr';
    
    // 清空聊天區域
    chatArea.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">選擇一個對話開始聊天</div>';
    
    // 重新載入對話列表
    loadConversations();
  }
}

function selectConversation(userId, username, avatar) {
  selectedUserId = userId;
  currentSelectedConversation = userId; // 設置當前選中的對話
  console.log('💬 選擇對話:', userId, username);
  
  // 顯示聊天區域
  const chatArea = document.getElementById('chatArea');
  if (chatArea) {
    chatArea.innerHTML = `
      <div class="chat-header">
        <img src="${avatar}" alt="${username}" class="chat-avatar">
        <div class="chat-info">
          <div class="chat-name">${escapeHtml(username)}</div>
        </div>
      </div>
      <div class="messages-container" id="messagesContainer"></div>
      <div class="message-input-container">
        <input type="text" id="messageInput" placeholder="輸入訊息..." onkeypress="if(event.key==='Enter') sendMessage()">
        <button onclick="sendMessage()">發送</button>
      </div>
    `;
  }
  
  // 更新聊天列表的 active 狀態
  document.querySelectorAll('.chat-item').forEach(item => {
    if (item.dataset.userId === userId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // 載入訊息歷史
  loadMessages();
}

// ==================== 訊息功能 ====================
async function loadMessages() {
  if (!selectedUserId) return;

  try {
    const response = await fetch(`${baseURL}/api/messages/${selectedUserId}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const messages = await response.json();
    renderMessages(messages);
  } catch (error) {
    console.error('載入訊息失敗:', error);
  }
}

function renderMessages(messages) {
  const container = document.getElementById('messagesContainer');
  if (!container) {
    console.warn('⚠️ messagesContainer 未找到');
    return;
  }
  
  if (!messages || messages.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #868e96; padding: 40px 20px; font-size: 14px;">還沒有訊息，開始聊天吧！</div>';
    return;
  }
  
  container.innerHTML = messages.map(msg => {
    const isMe = msg.senderId === currentUser.id;
    const messageId = msg.id;
    const isLiked = msg.likes && msg.likes.includes(currentUser.id);
    const likesCount = msg.likes ? msg.likes.length : 0;
    
    return `
      <div class="message ${isMe ? 'sent' : 'received'}" data-message-id="${messageId}">
        <div class="message-content">${escapeHtml(msg.content)}</div>
        <div class="message-dots" onclick="toggleMessageOptions('${messageId}')">
          <div class="three-dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
        </div>
        <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString('zh-tw', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="message-options" id="options-${messageId}" style="display: none;">
          <button onclick="likeMessage('${messageId}')" class="option-btn like-btn">
            <svg class="like-icon ${isLiked ? 'liked' : 'not-liked'}" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span class="like-count">${likesCount}</span>
          </button>
          ${isMe ? `<button onclick="deleteMessage('${messageId}')" class="option-btn delete-btn">收回</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  // 滾動到底部
  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 50);
  
  console.log('✅ 訊息已渲染:', messages.length);
}

// 點擊其他地方關閉選項菜單
document.addEventListener('click', function(event) {
  if (!event.target.closest('.message') && !event.target.closest('.message-options')) {
    document.querySelectorAll('.message-options').forEach(options => {
      options.style.display = 'none';
    });
  }
});

function toggleMessageOptions(messageId) {
  // 關閉所有其他選項
  document.querySelectorAll('.message-options').forEach(options => {
    if (options.id !== `options-${messageId}`) {
      options.style.display = 'none';
    }
  });
  
  // 切換當前選項
  const options = document.getElementById(`options-${messageId}`);
  if (options.style.display === 'none' || options.style.display === '') {
    options.style.display = 'flex';
  } else {
    options.style.display = 'none';
  }
}

async function deleteMessage(messageId) {
  if (!confirm('確定要收回這條訊息嗎？')) {
    return;
  }
  
  try {
    const response = await fetch(`${baseURL}/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (response.ok) {
      // 重新載入訊息
      await loadMessages();
    } else {
      alert('收回失敗');
    }
  } catch (error) {
    console.error('收回訊息失敗:', error);
    alert('收回失敗');
  }
}

async function likeMessage(messageId) {
  try {
    const response = await fetch(`${baseURL}/api/messages/${messageId}/like`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      }
    });

    if (response.ok) {
      const result = await response.json();
      
      // 更新按讚狀態
      const likeBtn = document.querySelector(`#options-${messageId} .like-btn`);
      const likeIcon = likeBtn.querySelector('.like-icon');
      const likeCount = likeBtn.querySelector('.like-count');
      
      if (result.liked) {
        // 變成紅色實心
        likeIcon.classList.remove('not-liked');
        likeIcon.classList.add('liked');
      } else {
        // 變成黑色中空
        likeIcon.classList.remove('liked');
        likeIcon.classList.add('not-liked');
      }
      
      // 更新按讚數量
      likeCount.textContent = result.likesCount;
      
      // 關閉選項
      setTimeout(() => {
        document.getElementById(`options-${messageId}`).style.display = 'none';
      }, 500);
    }
  } catch (error) {
    console.error('按讚失敗:', error);
  }
}

async function sendMessage() {
  if (!selectedUserId) {
    alert('請先選擇一個對話');
    return;
  }

  const content = document.getElementById('messageInput').value.trim();
  if (!content) return;

  try {
    const response = await fetch(`${baseURL}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ recipientId: selectedUserId, content })
    });

    if (response.ok) {
      document.getElementById('messageInput').value = '';
      // 立即重新載入訊息
      await loadMessages();
      // 更新對話列表
      await loadConversations();
    }
  } catch (error) {
    console.error('發送訊息出錯:', error);
  }
}

// ==================== Feed 功能 ====================
async function loadFeed() {
  try {
    const response = await fetch(`${baseURL}/api/feed`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (!response.ok) {
      throw new Error(`API 錯誤: ${response.status}`);
    }
    
    const posts = await response.json();
    
    // 確保 posts 是數組
    if (!Array.isArray(posts)) {
      console.warn('API 返回的 posts 不是數組:', posts);
      renderFeed([]);
      return;
    }
    
    renderFeed(posts);
    updateStatus(true);
  } catch (error) {
    console.error('載入 Feed 失敗:', error);
    const container = document.getElementById('feedPosts');
    if (container) {
      container.innerHTML = '<div class="empty-state">❌ 無法載入 Feed</div>';
    }
    updateStatus(false);
  }
}

function renderFeed(posts) {
  const container = document.getElementById('feedPosts');
  if (!container) return;
  
  if (posts.length === 0) {
    container.innerHTML = '<div class="empty-state">暫無貼文，開始跟隨用戶吧</div>';
    return;
  }

  container.innerHTML = posts.map(post => `
    <div class="post-card">
      <div class="post-header">
        <img src="${post.authorAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=user'}" alt="" class="post-author-avatar">
        <div class="post-author-info">
          <div class="post-author-name">${escapeHtml(post.author)}</div>
          <div class="post-time">${new Date(post.createdAt).toLocaleString('zh-tw')}</div>
        </div>
      </div>

      <div class="post-body">
        <div class="post-title">${escapeHtml(post.title)}</div>
        <div class="post-content">${escapeHtml(post.content)}</div>
      </div>

      <div class="post-actions">
        <button class="post-action-btn ${post.isLiked ? 'liked' : ''}" onclick="toggleLike(${post.id}, ${post.isLiked})">
          ${post.isLiked ? '❤️' : '🤍'} ${post.likeCount}
        </button>
        <button class="post-action-btn" onclick="toggleComments(${post.id})">
          💬 留言
        </button>
      </div>

      <div class="post-comments" id="comments-${post.id}" style="display: none;"></div>
      <div class="comment-input-group" id="comment-input-${post.id}" style="display: none;">
        <input type="text" placeholder="新增留言..." class="comment-input">
        <button onclick="addComment(${post.id})">發送</button>
      </div>
    </div>
  `).join('');
}

async function toggleLike(postId, isLiked) {
  try {
    const method = isLiked ? 'DELETE' : 'POST';
    const response = await fetch(`${baseURL}/api/posts/${postId}/like`, {
      method,
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (response.ok) {
      loadFeed();
    }
  } catch (error) {
    console.error('點讚操作失敗:', error);
  }
}

async function toggleComments(postId) {
  const commentsDiv = document.getElementById(`comments-${postId}`);
  const inputDiv = document.getElementById(`comment-input-${postId}`);

  if (commentsDiv.style.display === 'none') {
    try {
      const response = await fetch(`${baseURL}/api/posts/${postId}/comments`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const comments = await response.json();

      const html = comments.map(comment => `
        <div class="comment">
          <div class="comment-author">${escapeHtml(comment.username)}</div>
          <div class="comment-content">${escapeHtml(comment.content)}</div>
          ${comment.userId === currentUser.id ? `<button class="post-action-btn" style="font-size: 11px; padding: 3px 6px;" onclick="deleteComment(${comment.id})">刪除</button>` : ''}
        </div>
      `).join('');

      commentsDiv.innerHTML = html;
    } catch (error) {
      console.error('載入留言失敗:', error);
    }

    commentsDiv.style.display = 'block';
    inputDiv.style.display = 'flex';
  } else {
    commentsDiv.style.display = 'none';
    inputDiv.style.display = 'none';
  }
}

async function addComment(postId) {
  const inputDiv = document.getElementById(`comment-input-${postId}`);
  const input = inputDiv.querySelector('input');
  const content = input.value.trim();

  if (!content) {
    alert('請輸入留言內容');
    return;
  }

  try {
    const response = await fetch(`${baseURL}/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        content,
        username: currentUser.username,
        avatar: currentUser.avatar
      })
    });

    if (response.ok) {
      input.value = '';
      const commentsDiv = document.getElementById(`comments-${postId}`);
      commentsDiv.style.display = 'none';
      await toggleComments(postId);
    }
  } catch (error) {
    console.error('發送留言失敗:', error);
  }
}

async function deleteComment(commentId) {
  if (!confirm('確定要刪除留言嗎？')) return;

  try {
    const response = await fetch(`${baseURL}/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (response.ok) {
      loadFeed();
    }
  } catch (error) {
    console.error('刪除留言失敗:', error);
  }
}

// ==================== 文章功能 ====================
async function loadPosts() {
  try {
    const response = await fetch(`${baseURL}/api/posts`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (!response.ok) {
      throw new Error(`API 錯誤: ${response.status}`);
    }
    
    const posts = await response.json();
    
    // 確保 posts 是數組
    if (!Array.isArray(posts)) {
      console.warn('API 返回的 posts 不是數組:', posts);
      renderPosts([]);
      return;
    }
    
    const myPosts = posts.filter(p => p.authorId === currentUser.id);
    renderPosts(myPosts);
  } catch (error) {
    console.error('載入文章失敗:', error);
    renderPosts([]);
  }
}

function renderPosts(posts) {
  const container = document.getElementById('postsList');
  if (!container) return;
  
  if (posts.length === 0) {
    container.innerHTML = '<div class="empty-state">暫無文章</div>';
    return;
  }

  container.innerHTML = posts.map(post => `
    <div class="item">
      <div class="item-title">${escapeHtml(post.title)}</div>
      <div class="item-content">${escapeHtml(post.content)}</div>
      <div class="item-meta">${new Date(post.updatedAt).toLocaleString('zh-tw')}</div>
      <div class="item-actions">
        <button onclick="editPost(${post.id}, '${escapeHtml(post.title).replace(/'/g, "\\'")}', '${escapeHtml(post.content).replace(/'/g, "\\'")}')">✏️ 編輯</button>
        <button class="danger" onclick="deletePost(${post.id})">🗑️ 刪除</button>
      </div>
    </div>
  `).join('');
}

async function addPost() {
  const title = document.getElementById('postTitle').value;
  const content = document.getElementById('postContent').value;

  if (!title || !content) {
    alert('請輸入標題和內容');
    return;
  }

  try {
    const response = await fetch(`${baseURL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ title, content, author: currentUser.username })
    });

    if (response.ok) {
      document.getElementById('postTitle').value = '';
      document.getElementById('postContent').value = '';
      await loadPosts();
      await loadFeed();
    }
  } catch (error) {
    console.error('發佈文章出錯:', error);
  }
}

async function editPost(id, title, content) {
  const newTitle = prompt('編輯標題:', title);
  if (newTitle === null) return;

  const newContent = prompt('編輯內容:', content);
  if (newContent === null) return;

  try {
    const response = await fetch(`${baseURL}/api/posts/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ title: newTitle, content: newContent })
    });

    if (response.ok) {
      await loadPosts();
      await loadFeed();
    }
  } catch (error) {
    console.error('更新文章出錯:', error);
  }
}

async function deletePost(id) {
  if (!confirm('確定要刪除此文章嗎？')) return;

  try {
    const response = await fetch(`${baseURL}/api/posts/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });

    if (response.ok) {
      await loadPosts();
      await loadFeed();
    }
  } catch (error) {
    console.error('刪除文章出錯:', error);
  }
}

// ==================== WebSocket 連接 ====================
function connectWebSocket() {
  if (!currentUser || !currentToken) {
    console.log('⚠️ 未登入，不連接 WebSocket');
    return;
  }

  // 根據環境決定 WebSocket URL
  const hostname = window.location.hostname || 'localhost';
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const protocol = isLocal ? 'ws' : 'wss';
  const wsHost = isLocal ? `${hostname}:3000` : 'app-lin-git-main-linjunyuans-projects.vercel.app'; // 你的實際 Vercel URL
  const wsURL = `${protocol}://${wsHost}?token=${currentToken}`;
  try {
    ws = new WebSocket(wsURL);

    ws.onopen = () => {
      console.log('✅ WebSocket 已連接');
      wsRetryCount = 0;
      updateStatus(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 收到 WebSocket 消息:', data);

        if (data.type === 'message') {
          // 新的私訊消息
          loadConversations();
          if (currentSelectedConversation && data.from === currentSelectedConversation) {
            loadMessages(currentSelectedConversation);
          }
        } else if (data.type === 'post-update' || data.type === 'comment-update') {
          // 文章或評論更新
          loadFeed();
        }
      } catch (e) {
        console.error('❌ WebSocket 消息解析失敗:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket 錯誤:', error);
      updateStatus(false);
    };

    ws.onclose = () => {
      console.log('⚠️ WebSocket 已斷開');
      updateStatus(false);
      if (wsRetryCount < 5) {
        wsRetryCount++;
        setTimeout(connectWebSocket, 5000);
      }
    };
  } catch (error) {
    console.error('❌ WebSocket 連接失敗:', error);
    updateStatus(false);
    if (wsRetryCount < 5) {
      wsRetryCount++;
      setTimeout(connectWebSocket, 5000);
    }
  }
}

// ==================== 通知功能 ====================
function toggleNotifications() {
  const dropdown = document.getElementById('notificationDropdown');
  if (!dropdown) return;
  
  if (dropdown.style.display === 'block') {
    dropdown.style.display = 'none';
  } else {
    dropdown.style.display = 'block';
    loadNotifications();
  }
}

async function loadNotifications() {
  try {
    const response = await fetch(`${baseURL}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (response.ok) {
      const notifications = await response.json();
      renderNotifications(notifications);
    }
  } catch (error) {
    console.error('載入通知失敗:', error);
  }
}

function renderNotifications(notifications) {
  const list = document.getElementById('notificationList');
  const badge = document.getElementById('notificationBadge');
  
  if (!list || !badge) return;
  
  const unreadCount = notifications.filter(n => !n.isRead).length;
  badge.textContent = unreadCount;
  badge.style.display = unreadCount > 0 ? 'block' : 'none';
  
  if (notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">沒有通知</div>';
    return;
  }
  
  list.innerHTML = notifications.map(notification => `
    <div class="notification-item ${notification.isRead ? 'read' : 'unread'}">
      <div class="notification-content">${escapeHtml(notification.content)}</div>
      <div class="notification-time">${new Date(notification.createdAt).toLocaleString('zh-tw')}</div>
      ${!notification.isRead ? `<button onclick="markNotificationRead('${notification.id}')" style="background: none; border: none; color: #007bff; cursor: pointer; font-size: 12px;">標記已讀</button>` : ''}
    </div>
  `).join('');
}

async function markNotificationRead(notificationId) {
  try {
    const response = await fetch(`${baseURL}/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (response.ok) {
      loadNotifications();
    }
  } catch (error) {
    console.error('標記通知已讀失敗:', error);
  }
}

async function clearAllNotifications() {
  if (!confirm('確定要清除所有通知嗎？')) {
    return;
  }
  
  try {
    const response = await fetch(`${baseURL}/api/notifications`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (response.ok) {
      loadNotifications();
    }
  } catch (error) {
    console.error('清除通知失敗:', error);
  }
}

// ==================== 管理員功能 ====================
function isSuperAdmin() {
  return currentUser && (currentUser.username === 'allen' || currentUser.username === 'ab');
}

function showAdminPage() {
  if (!isSuperAdmin()) {
    alert('需要超級管理員權限');
    return;
  }
  
  switchMainPage('admin');
  loadAdminData();
}

async function loadAdminData() {
  try {
    const response = await fetch(`${baseURL}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (response.ok) {
      const users = await response.json();
      allAdminUsers = users; // 設置全局變數
      renderAdminUsers(users);
      renderAdminStats(users);
    }
  } catch (error) {
    console.error('載入管理員數據失敗:', error);
  }
}

function renderAdminUsers(users) {
  const container = document.getElementById('usersTable');
  if (!container) return;
  
  const isSuperAdminUser = currentUser.username === 'allen';
  
  container.innerHTML = users.map(user => `
    <tr>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${user.isAdmin ? '管理員' : '普通用戶'}</td>
      <td>${user.postsCount || 0}</td>
      <td>
        ${user.id !== currentUser.id ? 
          `<button onclick="deleteUser('${user.id}')" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">刪除</button>` : 
          '<span style="color: #999;">不能刪除自己</span>'
        }
      </td>
    </tr>
  `).join('');
}

function renderAdminStats(users) {
  const container = document.getElementById('statsGrid');
  if (!container) return;
  
  const totalUsers = users.length;
  const adminUsers = users.filter(u => u.isAdmin).length;
  const normalUsers = totalUsers - adminUsers;
  const totalPosts = users.reduce((sum, u) => sum + (u.postsCount || 0), 0);
  
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
        <h4 style="margin: 0 0 10px 0; color: #495057;">👥 總用戶數</h4>
        <div style="font-size: 24px; font-weight: bold; color: #007bff;">${totalUsers}</div>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
        <h4 style="margin: 0 0 10px 0; color: #495057;">👤 管理員數</h4>
        <div style="font-size: 24px; font-weight: bold; color: #28a745;">${adminUsers}</div>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
        <h4 style="margin: 0 0 10px 0; color: #495057;">👤 普通用戶</h4>
        <div style="font-size: 24px; font-weight: bold; color: #17a2b8;">${normalUsers}</div>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
        <h4 style="margin: 0 0 10px 0; color: #495057;">📄 總文章數</h4>
        <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${totalPosts}</div>
      </div>
    </div>
  `;
}

async function deleteUser(userId) {
  if (!confirm('確定要刪除這個用戶嗎？此操作無法撤銷！')) {
    return;
  }
  
  try {
    const response = await fetch(`${baseURL}/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (response.ok) {
      alert('用戶已刪除');
      loadAdminData();
    } else {
      alert('刪除失敗');
    }
  } catch (error) {
    console.error('刪除用戶失敗:', error);
    alert('刪除失敗');
  }
}

function showAllUsers() {
  const container = document.getElementById('adminSpecialContent');
  if (!container) return;
  
  const users = allAdminUsers || [];
  const isSuperAdminUser = currentUser.username === 'allen';
  
  const html = `
    <h4>👥 所有用戶列表 (${users.length} 個用戶）</h4>
    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin-top: 10px; background: #f8f9fa;">
      ${users.map(user => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; margin-bottom: 8px;">
          <div>
            <strong>${escapeHtml(user.username)}</strong>
            <span style="color: #666; font-size: 12px;">${user.isAdmin ? ' (管理員)' : '(普通用戶)'}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <span style="color: #666; font-size: 12px;">文章: ${user.postsCount || 0}</span>
            ${user.id !== currentUser.id ? 
              `<button onclick="deleteUser('${user.id}')" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">刪除</button>` : 
              '<span style="color: #999;">不能刪除自己</span>'
            }
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  container.innerHTML = html;
}

function showSystemStats() {
  const container = document.getElementById('adminSpecialContent');
  if (!container) return;
  
  const users = allAdminUsers || [];
  const totalUsers = users.length;
  const adminUsers = users.filter(u => u.isAdmin).length;
  const normalUsers = totalUsers - adminUsers;
  const totalPosts = users.reduce((sum, u) => sum + (u.postsCount || 0), 0);
  
  const html = `
    <h4>📊 系統統計</h4>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 10px;">
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
        <h5 style="margin: 0 0 10px 0; color: #495057;">👥 總用戶數</h5>
        <div style="font-size: 20px; font-weight: bold; color: #007bff;">${totalUsers}</div>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
        <h5 style="margin: 0 0 10px 0; color: #495057;">👤 管理員數</h5>
        <div style="font-size: 20px; font-weight: bold; color: #28a745;">${adminUsers}</div>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
        <h5 style="margin: 0 0 10px 0; color: #495057;">👤 普通用戶</h5>
        <div style="font-size: 20px; font-weight: bold; color: #17a2b8;">${normalUsers}</div>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
        <h5 style="margin: 0 0 10px 0; color: #495057;">📄 總文章數</h5>
        <div style="font-size: 20px; font-weight: bold; color: #ffc107;">${totalPosts}</div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

function clearAllData() {
  if (!confirm('⚠️ 確定要清除所有數據嗎？\n\n這將會刪除所有普通用戶的：\n- 帳號\n- 文章\n- 訊息\n- 留言\n- 按讚記錄\n\n只保留管理員帳號！\n\n此操作無法撤銷！')) {
    return;
  }
  
  const container = document.getElementById('adminSpecialContent');
  if (!container) return;
  
  container.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <div style="display: inline-block; padding: 20px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; margin-bottom: 15px;">
        <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ 清除中...</h4>
        <div style="font-size: 14px; color: #856404;">正在清除所有普通用戶數據...</div>
      </div>
    </div>
  `;
  
  // 實際執行清除
  setTimeout(async () => {
    try {
      const response = await fetch(`${baseURL}/api/admin/clear-all`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      
      if (response.ok) {
        container.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <div style="display: inline-block; padding: 20px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px;">
              <h4 style="color: #155724; margin: 0 0 10px 0;">✅ 清除完成</h4>
              <div style="font-size: 14px; color: #155724;">所有普通用戶數據已清除</div>
            </div>
          </div>
        `;
        
        // 重新載入數據
        setTimeout(() => {
          loadAdminData();
        }, 2000);
      } else {
        container.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <div style="display: inline-block; padding: 20px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;">
              <h4 style="color: #721c24; margin: 0 0 10px 0;">❌ 清除失敗</h4>
              <div style="font-size: 14px; color: #721c24;">清除失敗，請重試</div>
            </div>
          </div>
        `;
      }
    } catch (error) {
      console.error('清除數據失敗:', error);
      container.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div style="display: inline-block; padding: 20px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;">
            <h4 style="color: #721c24; margin: 0 0 10px 0;">❌ 清除失敗</h4>
            <div style="font-size: 14px; color: #721c24;">清除失敗，請重試</div>
          </div>
        </div>
      `;
    }
  }, 1000);
}

function searchAdminUsers() {
  const input = document.getElementById('adminSearchInput');
  const resultsDiv = document.getElementById('adminSearchResults');
  const users = allAdminUsers || [];
  
  if (!input || !resultsDiv) return;
  
  const searchTerm = input.value.toLowerCase().trim();
  
  if (searchTerm === '') {
    resultsDiv.innerHTML = '';
    return;
  }
  
  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm) || 
    user.email.toLowerCase().includes(searchTerm)
  );
  
  resultsDiv.innerHTML = `找到 ${filteredUsers.length} 個用戶`;
  
  // 更新表格顯示
  const container = document.getElementById('adminSpecialContent');
  if (container && searchTerm !== '') {
    const html = `
      <h4>🔍 搜索結果</h4>
      <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin-top: 10px; background: #f8f9fa;">
        ${filteredUsers.map(user => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; margin-bottom: 8px;">
            <div>
              <strong>${escapeHtml(user.username)}</strong>
              <span style="color: #666; font-size: 12px;">${user.isAdmin ? ' (管理員)' : '(普通用戶)'}</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <span style="color: #666; font-size: 12px;">文章: ${user.postsCount || 0}</span>
              ${user.id !== currentUser.id ? 
                `<button onclick="deleteUser('${user.id}')" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">刪除</button>` : 
                '<span style="color: #999;">不能刪除自己</span>'
              }
            </div>
          </div>
        `).join('')}
      </div>
    `;
    container.innerHTML = html;
  }
}

// ==================== 粉絲/追蹤功能 ====================
async function showFollowers(userId) {
  try {
    const response = await fetch(`${baseURL}/api/users/${userId}/followers`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (response.ok) {
      const followers = await response.json();
      showUserList('粉絲列表', followers);
    }
  } catch (error) {
    console.error('載入粉絲列表失敗:', error);
    alert('載入粉絲列表失敗');
  }
}

async function showFollowing(userId) {
  try {
    const response = await fetch(`${baseURL}/api/users/${userId}/following`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    
    if (response.ok) {
      const following = await response.json();
      showUserList('追蹤列表', following);
    }
  } catch (error) {
    console.error('載入追蹤列表失敗:', error);
    alert('載入追蹤列表失敗');
  }
}

function showUserList(title, users) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 20px;
    max-width: 400px;
    max-height: 500px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  `;
  
  content.innerHTML = `
    <h3 style="margin: 0 0 15px 0; color: #333;">${title}</h3>
    ${users.length === 0 ? 
      '<p style="color: #666; text-align: center;">暫無用戶</p>' :
      users.map(user => `
        <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee;">
          <img src="${user.avatar}" alt="${user.username}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 12px;">
          <div style="flex: 1;">
            <div style="font-weight: bold; color: #333;">${escapeHtml(user.username)}</div>
            <div style="font-size: 12px; color: #666;">${user.bio || '暫無簡介'}</div>
          </div>
        </div>
      `).join('')
    }
    <div style="text-align: center; margin-top: 15px;">
      <button onclick="this.closest('div[style*=position]').remove()" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">關閉</button>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // 點擊背景關閉
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// ==================== 工具函數 ====================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== 頭像功能 ====================
function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // 檢查文件類型
  if (!file.type.startsWith('image/')) {
    alert('請選擇圖片文件');
    return;
  }
  
  // 檢查文件大小 (限制 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('圖片大小不能超過 5MB');
    return;
  }
  
  // 讀取並預覽圖片
  const reader = new FileReader();
  reader.onload = function(e) {
    const preview = document.getElementById('avatarPreview');
    preview.innerHTML = `
      <div style="position: relative; display: inline-block;">
        <img src="${e.target.result}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid #e9ecef;">
        <div style="margin-top: 10px;">
          <button onclick="uploadAvatar('${e.target.result}')" style="background: #0084ff; color: white; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer;">確認上傳</button>
          <button onclick="cancelAvatarUpload()" style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; margin-left: 8px;">取消</button>
        </div>
      </div>
    `;
  };
  reader.readAsDataURL(file);
}

async function uploadAvatar(imageData) {
  try {
    const response = await fetch(`${baseURL}/api/users/${currentUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ avatar: imageData })
    });
    
    if (response.ok) {
      const updatedUser = await response.json();
      
      // 更新本地存儲的用戶信息
      currentUser.avatar = updatedUser.avatar;
      localStorage.setItem('user', JSON.stringify(currentUser));
      
      alert('頭像更新成功！');
      // 清空預覽
      document.getElementById('avatarPreview').innerHTML = '';
      
      // 立即更新所有地方的頭像
      updateAllAvatars(updatedUser.avatar);
      
      // 重新載入用戶資料頁面
      await loadUserProfile();
    } else {
      alert('頭像更新失敗');
    }
  } catch (error) {
    console.error('上傳頭像失敗:', error);
    alert('上傳失敗，請重試');
  }
}

function cancelAvatarUpload() {
  document.getElementById('avatarPreview').innerHTML = '';
  document.getElementById('avatarInput').value = '';
}

function updateAllAvatars(newAvatar) {
  // 更新頭部頭像
  const headerAvatar = document.getElementById('userAvatar');
  if (headerAvatar) {
    headerAvatar.src = newAvatar;
  }
  
  // 更新個人資料頁面的頭像
  const profileAvatar = document.querySelector('#profileCard .profile-avatar');
  if (profileAvatar) {
    profileAvatar.src = newAvatar;
  }
  
  // 更新聊天列表中的頭像
  document.querySelectorAll('.chat-avatar').forEach(avatar => {
    if (avatar.alt === currentUser.username) {
      avatar.src = newAvatar;
    }
  });
  
  // 更新聊天頭部的頭像
  document.querySelectorAll('.chat-header .chat-avatar').forEach(avatar => {
    if (avatar.alt === currentUser.username) {
      avatar.src = newAvatar;
    }
  });
  
  // 更新搜尋結果中的頭像（如果顯示的話）
  document.querySelectorAll('.search-result-avatar').forEach(avatar => {
    if (avatar.alt === currentUser.username) {
      avatar.src = newAvatar;
    }
  });
  
  console.log('✅ 所有頭像已更新');
}

function updateAvatarPreview() {
  const avatarSelect = document.getElementById('registerAvatar');
  const img = document.getElementById('avatarPreviewImg');
  
  if (!avatarSelect || !img) {
    return; // 元素不存在，安全地返回
  }
  
  const avatarSeed = avatarSelect.value;
  img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`;
}

function showAvatarOptions() {
  const avatars = ['seed1', 'seed2', 'seed3', 'seed4', 'seed5', 'seed6', 'seed7', 'seed8'];
  const options = avatars.map((seed, index) => `${index + 1}`).join(', ');
  
  const choice = prompt(`選擇頭像 (1-8):\n${options}`);
  if (choice && avatars[parseInt(choice) - 1]) {
    changeAvatar(avatars[parseInt(choice) - 1]);
  }
}

async function changeAvatar(avatarSeed) {
  const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`;
  
  try {
    const response = await fetch(`${baseURL}/api/users/${currentUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ avatar })
    });

    if (response.ok) {
      const data = await response.json();
      currentUser.avatar = data.avatar;
      localStorage.setItem('user', JSON.stringify(currentUser));
      document.getElementById('userAvatar').src = avatar;
      alert('頭像已更新');
      loadUserProfile(currentUser.id);
    }
  } catch (error) {
    console.error('更新頭像失敗:', error);
  }
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📄 頁面加載開始');
  
  // 添加頭像選擇監聽器
  const avatarSelect = document.getElementById('registerAvatar');
  if (avatarSelect) {
    avatarSelect.addEventListener('change', updateAvatarPreview);
    // 初始化預覽
    updateAvatarPreview();
  }

  // 檢查是否已登入
  const savedToken = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');

  console.log('🔍 檢查 localStorage:', { hasToken: !!savedToken, hasUser: !!savedUser });

  if (savedToken && savedUser) {
    console.log('📌 發現已保存的 token，嘗試恢復會話');
    currentToken = savedToken;
    try {
      currentUser = JSON.parse(savedUser);
    } catch (e) {
      console.error('用戶數據解析失敗:', e);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      showAuthPage();
      return;
    }

    // 驗證 token
    try {
      const res = await fetch(`${baseURL}/api/auth/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        }
      });
      console.log('✅ Token 驗證響應:', res.status);
      if (res.ok) {
        // 用後端回傳的 user 覆蓋本地資料（確保 avatar / isAdmin 同步）
        try {
          const data = await res.json();
          if (data && data.user) {
            currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(currentUser));
          }
        } catch (e) {
          console.warn('⚠️ verify-token 回傳不是 JSON 或解析失敗:', e);
        }

        const currentUserEl = document.getElementById('currentUser');
        const userAvatarEl = document.getElementById('userAvatar');
        
        if (currentUserEl && userAvatarEl) {
          currentUserEl.textContent = currentUser.username;
          userAvatarEl.src = currentUser.avatar;
          
          showMainPage();
          
          // 使用 setTimeout 確保 DOM 準備好
          setTimeout(() => {
            try {
              console.log('📡 開始加載數據...');
              connectWebSocket(); // 延遲連接 WebSocket
              loadConversations().catch(e => console.error('loadConversations 錯誤:', e));
              loadFeed().catch(e => console.error('loadFeed 錯誤:', e));
              loadPosts().catch(e => console.error('loadPosts 錯誤:', e));
              loadAllUsers().catch(e => console.error('loadAllUsers 錯誤:', e));
              loadUserProfile(currentUser.id).catch(e => console.error('loadUserProfile 錯誤:', e));
              switchMainPage('feed');
            } catch (error) {
              console.error('初始化數據加載錯誤:', error);
            }
          }, 100);
        } else {
          console.error('DOM 元素未找到: currentUser 或 userAvatar');
          showAuthPage();
        }
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        showAuthPage();
      }
    } catch (error) {
      console.error('Token 驗證失敗:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      showAuthPage();
    }
  } else {
    console.log('✨ 未登入，顯示登入頁面');
    showAuthPage();
  }
});
