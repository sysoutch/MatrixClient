const emptyState = document.getElementById('emptyState');
let matrixClient;
let currentRoomId = null;
let currentSpaceId = null;
let activeTab = 'spaces';
let currentUserId = null;
let currentMemberInfo = null;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      document.getElementById(`${activeTab}Tab`).classList.remove('hidden');
    });
    const emptyState = document.getElementById('emptyState');
    emptyState.classList.remove('hidden');
  });

  const messageInput = document.getElementById('messageInput');
  const messageSubmit = document.querySelector('#messageForm button');
  
  messageInput.addEventListener('input', () => {
    messageSubmit.disabled = !messageInput.value.trim();
  });
});

document.getElementById('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const homeserver = document.getElementById('homeserver').value;
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    matrixClient = window.matrix.createClient(homeserver);
    const loginResponse = await matrixClient.login(username, password);
    currentUserId = loginResponse.user_id;
    
    await matrixClient.startClient({ initialSyncLimit: 10 });
    
    matrixClient.onSync((state) => {
      if (state === "PREPARED") {
        document.getElementById('loginForm').style.display = 'none';
        document.querySelector('.app-container').style.display = 'flex';
        loadSpaces();
        loadPublicRooms();
      }
    });
    
    matrixClient.onMessage((data) => {
      if (data.roomId === currentRoomId) {
        addMessageToUI(data.sender, data.body, data.type, false);
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
};

document.getElementById('roomAddressForm').onsubmit = async (e) => {
  e.preventDefault();
  const addressInput = document.getElementById('roomAddressInput');
  const statusEl = document.getElementById('roomJoinStatus');
  const roomAddress = addressInput.value.trim();
  
  if (!roomAddress) return;
  
  try {
    showStatus(`Joining ${roomAddress}...`, 'info');
    await joinRoom(roomAddress);
    showStatus(`Successfully joined room!`, 'success');
    addressInput.value = '';
  } catch (error) {
    console.error('Room join error:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
};

function toggleSpace(spaceId) {
  const spaceElement = document.querySelector(`.space-header[data-spaceid="${spaceId}"]`);
  if (!spaceElement) return;
  
  const caret = spaceElement.querySelector('.space-caret');
  const childrenContainer = document.querySelector(`.space-children[data-spaceid="${spaceId}"]`);
  
  if (caret) caret.classList.toggle('collapsed');
  if (childrenContainer) childrenContainer.classList.toggle('expanded');
}

function getRoomDisplayName(room) {
  if (!room) return 'Unknown Room';
  return room.name || room.canonicalAlias || room.roomId;
}

async function loadSpaces() {
  try {
    const rooms = await matrixClient.getStoredRooms();
    const spaces = rooms.filter(room => room.type === 'm.space');
    const spacesTree = document.getElementById('spacesTree');
    spacesTree.innerHTML = '';
    
    if (spaces.length === 0) {
      spacesTree.innerHTML = '<div class="empty-state"><p>No spaces found</p></div>';
      return;
    }
    
    for (const space of spaces) {
      const spaceHeader = document.createElement('div');
      spaceHeader.className = 'space-header';
      spaceHeader.dataset.spaceid = space.roomId;
      spaceHeader.innerHTML = `
        <span class="space-caret material-icons">≡</span>
        <div class="space-icon">
          <i class="material-icons">⌂</i>
        </div>
        <div class="space-name">${space.name || space.roomId}</div>
        <div class="space-members">${space.members}</div>
      `;
      
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'space-children';
      childrenContainer.dataset.spaceid = space.roomId;
      
      spaceHeader.addEventListener('click', () => toggleSpace(space.roomId));
      
      try {
        const childrenData = await matrixClient.getSpaceChildren(space.roomId);
        const roomsList = document.createElement('ul');
        roomsList.className = 'room-list';
        
        if (childrenData.children.length === 0) {
          roomsList.innerHTML = '<div class="empty-state" style="padding: 8px 0;">No rooms</div>';
        } else {
          for (const child of childrenData.children) {
            try {
              const roomDetails = await matrixClient.getRoom(child.roomId);
              if (!roomDetails) continue;
              
              const li = document.createElement('li');
              li.className = 'room-item';
              li.dataset.roomid = child.roomId;
              li.innerHTML = `
                <div class="room-icon">
                  <i class="material-icons">#</i>
                </div>
                <div class="room-name">${getRoomDisplayName(roomDetails)}</div>
              `;
              
              li.addEventListener('click', async (e) => {
                e.stopPropagation();
                await joinRoom(child.roomId);
              });
              
              roomsList.appendChild(li);
            } catch (error) {
              console.error(`Error loading room ${child.roomId}:`, error);
            }
          }
        }
        childrenContainer.appendChild(roomsList);
      } catch (error) {
        console.error(`Space children error:`, error);
        childrenContainer.innerHTML = '<div class="empty-state" style="padding: 8px 0;">Error loading rooms</div>';
      }
      
      spacesTree.appendChild(spaceHeader);
      spacesTree.appendChild(childrenContainer);
      
      if (spaces[0] === space) {
        toggleSpace(space.roomId);
      }
    }
  } catch (error) {
    console.error('Spaces load error:', error);
    showStatus(`Failed to load spaces: ${error.message}`, 'error');
  }
}

async function loadPublicRooms() {
  try {
    const publicRooms = await matrixClient.publicRooms();
    const roomsList = document.getElementById('publicRoomsList');
    roomsList.innerHTML = '';
    
    if (!publicRooms.chunk || publicRooms.chunk.length === 0) {
      roomsList.innerHTML = '<div class="empty-state"><p>No public rooms found</p></div>';
      return;
    }
    
    for (const room of publicRooms.chunk) {
      try {
        const roomDetails = await matrixClient.getRoom(room.room_id);
        if (!roomDetails) continue;
        
        const li = document.createElement('li');
        li.className = 'room-item';
        li.dataset.roomid = room.room_id;
        li.innerHTML = `
          <div class="room-icon">
            <i class="material-icons">#</i>
          </div>
          <div class="room-name">${getRoomDisplayName(roomDetails)}</div>
          <div class="room-members">${room.num_joined_members || '?'}</div>
        `;
        
        li.addEventListener('click', async () => {
          await joinRoom(room.room_id);
        });
        
        roomsList.appendChild(li);
      } catch (error) {
        console.error(`Error loading public room ${room.room_id}:`, error);
      }
    }
  } catch (error) {
    console.error('Public rooms load error:', error);
    showStatus(`Failed to load public rooms: ${error.message}`, 'error');
  }
}

async function joinRoom(roomIdOrAlias) {
  try {
    document.querySelectorAll('.room-item').forEach(item => {
      item.classList.remove('active');
    });

    const roomId = await matrixClient.joinRoom(roomIdOrAlias);
    currentRoomId = roomId;
    
    const room = await matrixClient.getRoom(roomId);
    document.getElementById('currentRoom').textContent = getRoomDisplayName(room);
    
    // Enable messaging
    document.getElementById('messageInput').disabled = false;
    document.querySelector('#messageForm button').disabled = false;
    
    // Clear and load messages
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';
    emptyState.classList.add('hidden');
    
    if (room?.timeline) {
      room.timeline.forEach(event => {
        if (event.type === 'm.room.message') {
          let body = event.body || '';
          const isSelf = event.sender === currentUserId;
          
          if (event.msgtype === "m.image") {
            body = `[Image: ${event.body || "Untitled"}]`;
          } else if (event.msgtype === "m.file") {
            body = `[File: ${event.body || "Untitled"}]`;
          } else if (event.msgtype === "m.emote") {
            body = `* ${event.sender} ${event.body}`;
          }
          
          addMessageToUI(event.sender, body, event.msgtype, isSelf);
        }
      });
    }
    
    // Load members
    loadRoomMembers(roomId);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Highlight active room
    const activeRoomItem = document.querySelector(`.room-item[data-roomid="${roomId}"]`);
    if (activeRoomItem) activeRoomItem.classList.add('active');
  } catch (error) {
    console.error('Join room error:', error);
    showStatus(`Failed to join room: ${error.message}`, 'error');
  }
}

function addMessageToUI(sender, message, type = 'm.text', isSelf = false) {
  const displayText = typeof message === 'string' ? message : '[Non-text message]';
  const messagesContainer = document.getElementById('messages');
  
  emptyState.classList.add('hidden');
  
  const messageElement = document.createElement('div');
  messageElement.className = `message ${isSelf ? 'self' : 'other'}`;
  
  const senderName = isSelf ? 'You' : sender.split(':')[0].substring(1);
  const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageElement.innerHTML = `
    <div class="message-sender">${senderName}</div>
    <div class="message-content">${displayText}</div>
    <div class="message-time">${timeString}</div>
  `;
  
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function loadRoomMembers(roomId) {
  try {
    const peopleList = document.getElementById('peopleList');
    peopleList.innerHTML = '';
    
    const members = await matrixClient.getRoomMembers(roomId);
    
    if (!members || members.length === 0) {
      peopleList.innerHTML = '<div class="empty-state"><p>No members found</p></div>';
      return;
    }
    
    members.forEach(member => {
      const li = document.createElement('li');
      li.className = 'person-item';
      
      const firstLetter = member.displayName.charAt(0).toUpperCase();
      
      li.innerHTML = `
        <div class="person-avatar">${firstLetter}</div>
        <div class="person-name">${member.displayName}</div>
        <div class="person-status"></div>
      `;
      
      li.addEventListener('click', () => {
        showUserInfo(member);
      });
      
      peopleList.appendChild(li);
    });
  } catch (error) {
    console.error('Room members load error:', error);
    peopleList.innerHTML = '<div class="empty-state"><p>Error loading members</p></div>';
  }
}

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('roomJoinStatus');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status-message status-${type}`;
  
  // Clear status after 3 seconds
  if (type !== 'info') {
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 3000);
  }
}

function showUserInfo(member) {
  currentMemberInfo = member;
  
  const popup = document.getElementById('userPopup');
  const avatar = document.getElementById('popupAvatar');
  const username = document.getElementById('popupUsername');
  const userId = document.getElementById('popupUserId');
  
  // Set first letter for avatar
  const firstLetter = member.displayName.charAt(0).toUpperCase();
  avatar.textContent = firstLetter;
  
  // Set user info
  username.textContent = member.displayName;
  userId.textContent = member.userId;
  
  // Show popup
  popup.classList.remove('hidden');
}

// close the popup
document.getElementById('closePopup').addEventListener('click', () => {
  document.getElementById('userPopup').classList.add('hidden');
});

// close when clicking outside popup
document.getElementById('userPopup').addEventListener('click', (e) => {
  if (e.target === document.getElementById('userPopup')) {
    document.getElementById('userPopup').classList.add('hidden');
  }
});

document.getElementById('messageForm').onsubmit = async (e) => {
  e.preventDefault();
  const messageInput = document.getElementById('messageInput');
  const message = messageInput.value.trim();
  
  if (message && currentRoomId) {
    try {
      await matrixClient.sendMessage(currentRoomId, message);
      addMessageToUI(currentUserId, message, 'm.text', true);
      messageInput.value = '';
      messageInput.focus();
    } catch (error) {
      console.error('Message send error:', error);
      showStatus(`Failed to send message: ${error.message}`, 'error');
    }
  }
};

document.getElementById('createSpaceButton').addEventListener('click', async (e) => {
  e.stopPropagation();
  const spaceName = prompt('Enter space name:');
  if (spaceName) {
    try {
      // This requires implementing createSpace in main/preload
      showStatus(`Space creation not implemented yet`, 'warning');
    } catch (error) {
      showStatus(`Failed to create space: ${error.message}`, 'error');
    }
  }
});

// Initially hide app container
document.querySelector('.app-container').style.display = 'none';