const welcomeScreen = document.getElementById('welcomeScreen');
const appContainer = document.querySelector('.app-container');
const welcomeLoginForm = document.getElementById('welcomeLoginForm');
const emptyState = document.getElementById('emptyState');
let matrixClient;
let currentRoomId = null;
let currentSpaceId = null;
let activeTab = 'spaces';
let currentUserId = null;
let currentMemberInfo = null;
let currentTheme = localStorage.getItem('theme') || 'light';

//#region Theme Management
const themes = ['light', 'dark', 'bunny', 'dark-bunny'];
const themeIcons = {
  light: 'light_mode',
  dark: 'dark_mode',
  bunny: 'pets',
  'dark-bunny': 'dark_mode'
};
//#endregion

// Add this function
function applyTheme() {
  // Remove all theme classes
  document.body.classList.remove('light-mode', 'dark-mode', 'bunny-mode', 'dark-bunny-mode');
  
  // Add current theme class
  if (currentTheme !== 'light') {
    document.body.classList.add(`${currentTheme}-mode`);
  }
  
  // Update icon
  const icon = document.querySelector('#themeToggle i');
  if (icon) {
    icon.textContent = themeIcons[currentTheme];
    // Special styling for dark-bunny icon
    if (currentTheme === 'dark-bunny') {
      icon.style.color = '#ff69b4';
      icon.style.textShadow = '0 0 5px rgba(255, 105, 180, 0.8)';
    } else {
      icon.style.color = '';
      icon.style.textShadow = '';
    }
  }
  
  // Save to localStorage
  localStorage.setItem('theme', currentTheme);
}

function switchTab(tabName) {
  activeTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    if (content.id === `${tabName}Tab`) {
      content.classList.remove('hidden');
    } else {
      content.classList.add('hidden');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Initially show welcome screen
  welcomeScreen.style.display = 'flex';
  appContainer.style.display = 'none';
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Initialize with spaces tab
  switchTab('spaces');
  
  const messageInput = document.getElementById('messageInput');
  const messageSubmit = document.querySelector('#messageForm button');
  
  messageInput.addEventListener('input', () => {
    messageSubmit.disabled = !messageInput.value.trim();
  });

  // Initialize theme
  applyTheme();
  
  // Add theme toggle listener
  document.getElementById('themeToggle').addEventListener('click', () => {
    // Cycle through themes
    const currentIndex = themes.indexOf(currentTheme);
    currentTheme = themes[(currentIndex + 1) % themes.length];
    applyTheme();
  });
  
  // Also add to welcome screen if needed
  const welcomeThemeToggle = document.getElementById('welcomeThemeToggle');
  if (welcomeThemeToggle) {
    welcomeThemeToggle.addEventListener('click', () => {
      const currentIndex = themes.indexOf(currentTheme);
      currentTheme = themes[(currentIndex + 1) % themes.length];
      applyTheme();
    });
  }
});

welcomeLoginForm.onsubmit = async (e) => {
  e.preventDefault();
  const loginButton = welcomeLoginForm.querySelector('button[type="submit"]');
  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";
  }
  const homeserver = document.getElementById('welcomeHomeserver').value;
  const username = document.getElementById('welcomeUsername').value;
  const password = document.getElementById('welcomePassword').value;
  
  try {
    matrixClient = window.matrix.createClient(homeserver);
    const loginResponse = await matrixClient.login(username, password);
    currentUserId = loginResponse.user_id;
    
    await matrixClient.startClient({ initialSyncLimit: 10 });
    
    matrixClient.onSync((state) => {
      if (state === "PREPARED") {
        // Switch from welcome screen to main app
        welcomeScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        
        document.getElementById('homeserverName').textContent = homeserver.replace('https://', '').replace('http://', '');
        // Initialize the app
        loadSpaces();
        loadPublicRooms();
      }
    });
    
    matrixClient.onMessage((data) => {
      if (data.roomId === currentRoomId) {
        addMessageToUI(data.sender, data.body, data.type, false);
      } else {
        // Show new message icon in sidebar
        const roomItem = document.querySelector(`.room-item[data-roomid="${data.roomId}"]`);
        if (roomItem) {
          const icon = roomItem.querySelector('.new-message-icon');
          if (icon) icon.style.display = '';
        }
      }
    });
  } catch (error) {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = "Login";
    }
    console.error('Login error:', error);
    alert(`Login failed: ${error.message}`);
  }

  // Initialize theme for welcome screen
  applyTheme();
  const welcomeIcon = document.querySelector('#welcomeThemeToggle i');
  if (welcomeIcon) {
    welcomeIcon.textContent = themeIcons[currentTheme];
    if (currentTheme === 'dark-bunny') {
      welcomeIcon.style.color = '#ff69b4';
      welcomeIcon.style.textShadow = '0 0 5px rgba(255, 105, 180, 0.8)';
    }
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

// async function loadSpaces() {
//   try {
//     const rooms = await matrixClient.getStoredRooms();
//     const spaces = rooms.filter(room => room.type === 'm.space');
//     const spacesTree = document.getElementById('spacesTree');
//     spacesTree.innerHTML = '';
    
//     if (spaces.length === 0) {
//       spacesTree.innerHTML = '<div class="empty-state"><p>No spaces found</p></div>';
//       return;
//     }
    
//     for (const space of spaces) {
//       const spaceHeader = document.createElement('div');
//       spaceHeader.className = 'space-header';
//       spaceHeader.dataset.spaceid = space.roomId;
//       spaceHeader.innerHTML = `
//         <span class="space-caret material-icons">≡</span>
//         <div class="space-icon">
//           <i class="material-icons">⌂</i>
//         </div>
//         <div class="space-name">${space.name || space.roomId}</div>
//         <div class="space-members">${space.members}</div>
//       `;
      
//       const childrenContainer = document.createElement('div');
//       childrenContainer.className = 'space-children';
//       childrenContainer.dataset.spaceid = space.roomId;
      
//       spaceHeader.addEventListener('click', () => toggleSpace(space.roomId));
      
//       try {
//         const childrenData = await matrixClient.getSpaceChildren(space.roomId);
//         const roomsList = document.createElement('ul');
//         roomsList.className = 'room-list';
        
//         if (childrenData.children.length === 0) {
//           roomsList.innerHTML = '<div class="empty-state" style="padding: 8px 0;">No rooms</div>';
//         } else {
//           for (const child of childrenData.children) {
//             try {
//               const roomDetails = await matrixClient.getRoom(child.roomId);
//               if (!roomDetails) continue;
              
//               const li = document.createElement('li');
//               li.className = 'room-item';
//               li.dataset.roomid = child.roomId;
//               li.innerHTML = `
//                 <div class="room-icon">
//                   <i class="material-icons">#</i>
//                 </div>
//                 <div class="room-name">${getRoomDisplayName(roomDetails)}</div>
//               `;
              
//               li.addEventListener('click', async (e) => {
//                 e.stopPropagation();
//                 await joinRoom(child.roomId);
//               });
              
//               roomsList.appendChild(li);
//             } catch (error) {
//               console.error(`Error loading room ${child.roomId}:`, error);
//             }
//           }
//         }
//         childrenContainer.appendChild(roomsList);
//       } catch (error) {
//         console.error(`Space children error:`, error);
//         childrenContainer.innerHTML = '<div class="empty-state" style="padding: 8px 0;">Error loading rooms</div>';
//       }
      
//       spacesTree.appendChild(spaceHeader);
//       spacesTree.appendChild(childrenContainer);
      
//       if (spaces[0] === space) {
//         toggleSpace(space.roomId);
//       }
//     }
//   } catch (error) {
//     console.error('Spaces load error:', error);
//     showStatus(`Failed to load spaces: ${error.message}`, 'error');
//   }
// }

function createAvatarElement(avatarUrl, displayName, size = 32, isRoom = false) {
  const container = document.createElement('div');
  container.className = isRoom ? 'room-avatar' : 'person-avatar';
  
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = displayName;
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.onerror = function() {
      // If image fails to load, show fallback
      this.remove();
      const letter = displayName?.charAt(0).toUpperCase() || '?';
      container.textContent = letter;
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
    };
    container.appendChild(img);
  } else {
    const letter = displayName?.charAt(0).toUpperCase() || '?';
    container.textContent = letter;
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
  }
  
  return container;
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
      
      // Create space avatar
      const spaceAvatar = createAvatarElement(space.avatarUrl, space.name || space.roomId, 24, true);
      
      spaceHeader.innerHTML = `
        <span class="space-caret material-icons">≡</span>
      `;
      spaceHeader.appendChild(spaceAvatar);
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'space-name';
      nameDiv.textContent = space.name || space.roomId;
      spaceHeader.appendChild(nameDiv);
      
      const membersDiv = document.createElement('div');
      membersDiv.className = 'space-members';
      membersDiv.textContent = space.members;
      spaceHeader.appendChild(membersDiv);
      
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
              
              // Create room avatar
              const roomAvatar = createAvatarElement(
                roomDetails.avatarUrl, 
                getRoomDisplayName(roomDetails), 
                24, 
                true
              );
              
              li.appendChild(roomAvatar);
              
              const nameDiv = document.createElement('div');
              nameDiv.className = 'room-name';
              nameDiv.textContent = getRoomDisplayName(roomDetails);
              li.appendChild(nameDiv);
              
              const newMsgIcon = document.createElement('span');
              newMsgIcon.className = 'new-message-icon material-icons';
              newMsgIcon.textContent = 'info';
              newMsgIcon.style.display = 'none';
              newMsgIcon.style.color = '#ff69b4';
              newMsgIcon.style.marginLeft = '8px';
              li.appendChild(newMsgIcon);

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
        
        // Create room avatar
        const roomAvatar = createAvatarElement(
          roomDetails.avatarUrl, 
          getRoomDisplayName(roomDetails), 
          24, 
          true
        );
        
        li.appendChild(roomAvatar);
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'room-name';
        nameDiv.textContent = getRoomDisplayName(roomDetails);
        li.appendChild(nameDiv);
        
        const membersDiv = document.createElement('div');
        membersDiv.className = 'room-members';
        membersDiv.textContent = room.num_joined_members || '?';
        li.appendChild(membersDiv);
        
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
    const roomTitle = document.getElementById('currentRoom');
    roomTitle.textContent = getRoomDisplayName(room);

    // Add room avatar to header
    const existingAvatar = roomTitle.querySelector('.room-avatar');
    if (existingAvatar) existingAvatar.remove();
    
    const roomAvatar = createAvatarElement(
      room.avatarUrl, 
      getRoomDisplayName(room), 
      32, 
      true
    );
    roomAvatar.classList.add('room-header-avatar');
    roomTitle.insertBefore(roomAvatar, roomTitle.firstChild);
    
    // Enable messaging
    document.getElementById('messageInput').disabled = false;
    document.querySelector('#messageForm button').disabled = false;
    
    // Clear and load messages
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';
    emptyState.classList.add('hidden');
    
    if (room?.timeline?.length > 0) {
      room.timeline.forEach(event => {
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
      });
    }
    
    // Load members
    loadRoomMembers(roomId);

    // Highlight active room
    const activeRoomItem = document.querySelector(`.room-item[data-roomid="${roomId}"]`);
    if (activeRoomItem) {
      activeRoomItem.classList.add('active');
      const icon = activeRoomItem.querySelector('.new-message-icon');
      if (icon) icon.style.display = 'none';
    }
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
  const peopleList = document.getElementById('peopleList');
  peopleList.innerHTML = '';

  const members = await matrixClient.getRoomMembers(roomId);

  if (!members || members.length === 0) {
    peopleList.innerHTML = '<div class="empty-state"><p>No members found</p></div>';
    return;
  }

  for (const member of members) {
    const li = document.createElement('li');
    li.className = 'person-item';

    // Get first letter for fallback avatar
    const firstLetter = member.displayName?.charAt(0).toUpperCase() || '?';

    // Create avatar container
    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'person-avatar';

    // If avatar URL exists, create image
    if (member.avatarUrl) {
      const img = document.createElement('img');
      img.src = member.avatarUrl;
      img.alt = member.displayName;
      img.onerror = function() {
        // If image fails to load, show fallback
        this.remove();
        avatarContainer.textContent = firstLetter;
      };
      avatarContainer.appendChild(img);
    } else {
      avatarContainer.textContent = firstLetter;
    }

    li.appendChild(avatarContainer);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'person-name';
    nameDiv.textContent = member.displayName;
    li.appendChild(nameDiv);

    // Fetch real presence status
    let status = 'offline';
    try {
      status = await matrixClient.getPresence(matrixClient.baseUrl, member.userId);
    } catch (e) {
      status = 'offline';
    }

    const statusDiv = document.createElement('div');
    statusDiv.className = 'person-status';
    if (status === 'online') {
      statusDiv.classList.remove('offline', 'unavailable');
    } else if (status === 'unavailable') {
      statusDiv.classList.add('unavailable');
      statusDiv.classList.remove('offline');
    } else {
      statusDiv.classList.add('offline');
      statusDiv.classList.remove('unavailable');
    }
    statusDiv.title = status;
    li.appendChild(statusDiv);

    li.addEventListener('click', () => {
      showUserInfo(member);
    });

    peopleList.appendChild(li);
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
  
  // Clear previous content
  avatar.innerHTML = '';
  
  // Create avatar container
  const avatarContainer = document.createElement('div');
  avatarContainer.className = 'user-avatar-large';
  
  // Get first letter for fallback
  const firstLetter = member.displayName?.charAt(0).toUpperCase() || '?';
  
  if (member.avatarUrl) {
    const img = document.createElement('img');
    img.src = member.avatarUrl;
    img.alt = member.displayName;
    img.style.width = '80px';
    img.style.height = '80px';
    img.style.borderRadius = '50%';
    img.style.objectFit = 'cover';
    img.onerror = function() {
      // If image fails to load, show fallback
      this.remove();
      avatarContainer.textContent = firstLetter;
      avatarContainer.style.display = 'flex';
      avatarContainer.style.alignItems = 'center';
      avatarContainer.style.justifyContent = 'center';
      avatarContainer.style.fontSize = '32px';
      avatarContainer.style.fontWeight = 'bold';
    };
    avatarContainer.appendChild(img);
  } else {
    avatarContainer.textContent = firstLetter;
    avatarContainer.style.display = 'flex';
    avatarContainer.style.alignItems = 'center';
    avatarContainer.style.justifyContent = 'center';
    avatarContainer.style.fontSize = '32px';
    avatarContainer.style.fontWeight = 'bold';
  }
  
  avatar.appendChild(avatarContainer);
  
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

document.getElementById('roomInfoButton').addEventListener('click', async () => {
  if (!currentRoomId) return;
  const popup = document.getElementById('roomInfoPopup');
  const avatar = document.getElementById('roomInfoAvatar');
  const name = document.getElementById('roomInfoName');
  const id = document.getElementById('roomInfoId');
  const details = document.getElementById('roomInfoDetails');

  avatar.innerHTML = '';
  name.textContent = '';
  id.textContent = '';
  details.textContent = '';

  try {
    const room = await matrixClient.getRoom(currentRoomId);
    // Avatar
    const avatarEl = createAvatarElement(room.avatarUrl, room.name || room.roomId, 80, true);
    avatar.appendChild(avatarEl);

    // Name and ID
    name.textContent = room.name || room.roomId;
    id.textContent = room.roomId;

    // Details (members, etc.)
    let members = room.members !== undefined ? room.members : '';
    if (!members && room.timeline) {
      // fallback: count unique senders
      members = [...new Set(room.timeline.map(e => e.sender))].length;
    }
    details.innerHTML = `
      <div><b>Members:</b> ${members || '?'}</div>
      <div><b>Type:</b> ${room.type || 'Room'}</div>
      ${room.topic ? `<div><b>Topic:</b> ${room.topic}</div>` : ''}
    `;
  } catch (e) {
    name.textContent = 'Failed to load room info';
    details.textContent = e.message;
  }

  popup.classList.remove('hidden');
});

document.getElementById('closeRoomInfoPopup').addEventListener('click', () => {
  document.getElementById('roomInfoPopup').classList.add('hidden');
});
document.getElementById('roomInfoPopup').addEventListener('click', (e) => {
  if (e.target === document.getElementById('roomInfoPopup')) {
    document.getElementById('roomInfoPopup').classList.add('hidden');
  }
});

document.getElementById('inviteButton').addEventListener('click', () => {
  document.getElementById('inviteUserIdInput').value = '';
  document.getElementById('inviteStatus').textContent = '';
  document.getElementById('invitePopup').classList.remove('hidden');
  document.getElementById('inviteUserIdInput').focus();
});

document.getElementById('closeInvitePopup').addEventListener('click', () => {
  document.getElementById('invitePopup').classList.add('hidden');
});

document.getElementById('invitePopup').addEventListener('click', (e) => {
  if (e.target === document.getElementById('invitePopup')) {
    document.getElementById('invitePopup').classList.add('hidden');
  }
});

document.getElementById('inviteSubmitButton').addEventListener('click', async () => {
  const userId = document.getElementById('inviteUserIdInput').value.trim();
  const status = document.getElementById('inviteStatus');
  if (!userId) {
    status.textContent = 'Please enter a Matrix user ID.';
    return;
  }
  if (!currentRoomId) {
    status.textContent = 'No room selected.';
    return;
  }
  status.textContent = 'Inviting...';
  try {
    await matrixClient.invite(currentRoomId, userId);
    status.textContent = `Invited ${userId} to the room.`;
    setTimeout(() => {
      document.getElementById('invitePopup').classList.add('hidden');
    }, 1000);
    loadRoomMembers(currentRoomId);
  } catch (error) {
    status.textContent = `Failed to invite: ${error.message}`;
  }
});

// Initially hide app container
document.querySelector('.app-container').style.display = 'none';