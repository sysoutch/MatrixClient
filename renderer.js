let matrixClient;
let currentRoomId = null;
let currentSpaceId = null;
let activeTab = 'spaces';
let currentUserId = null;

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
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
  });

  const roomsTab = document.querySelector('.tab[data-tab="rooms"]');
  if (roomsTab) {
    roomsTab.dataset.tab = "discover";
    roomsTab.textContent = "Discover";
  }
  
  // Enable/disable message form based on room selection
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
    // Create client and login
    matrixClient = window.matrix.createClient(homeserver);
    const loginResponse = await matrixClient.login(username, password);
    currentUserId = loginResponse.user_id;
    
    // Start client
    await matrixClient.startClient({ initialSyncLimit: 10 });
    
    // Setup event handlers
    matrixClient.onSync((state) => {
      if (state === "PREPARED") {
        console.log("Client prepared");
        document.getElementById('loginForm').style.display = 'none';
        document.querySelector('.app-container').style.display = 'flex';
        
        // Load spaces and public rooms
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
    console.error('Matrix client error:', error);
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
    
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 3000);
  } catch (error) {
    console.error('Room join error:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
};

function toggleSpace(spaceId) {
  const spaceElement = document.querySelector(`.space-header[data-spaceid="${spaceId}"]`);
  const caret = spaceElement.querySelector('.space-caret');
  const childrenContainer = document.querySelector(`.space-children[data-spaceid="${spaceId}"]`);
  
  caret.classList.toggle('collapsed');
  childrenContainer.classList.toggle('expanded');
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
      // Create space header
      const spaceHeader = document.createElement('div');
      spaceHeader.className = 'space-header';
      spaceHeader.dataset.spaceid = space.roomId;
      // ≡
      spaceHeader.innerHTML = `
        <span class="space-caret material-icons">≡</span>
        <div class="space-icon">
          <i class="material-icons">⌂</i>
        </div>
        <div class="space-name">${space.name || space.roomId}</div>
        <div class="space-members">${space.members}</div>
      `;
      
      // Create children container
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'space-children';
      childrenContainer.dataset.spaceid = space.roomId;
      
      // Add click handler to toggle expansion
      spaceHeader.addEventListener('click', () => {
        toggleSpace(space.roomId);
      });
      
      // Create room list for this space
      try {
        const childrenData = await matrixClient.getSpaceChildren(space.roomId);
        const roomsList = document.createElement('ul');
        roomsList.className = 'room-list';
        
        if (childrenData.children.length === 0) {
          roomsList.innerHTML = '<div class="empty-state" style="padding: 8px 0;">No rooms</div>';
        } else {
           // Fetch room details for each child
          const roomDetailsPromises = childrenData.children.map(child => 
            matrixClient.getRoom(child.roomId).catch(() => null)
          );
          
          const roomDetails = await Promise.all(roomDetailsPromises);
          
          // Filter out deleted rooms
          const validRooms = roomDetails.filter(child => child !== null);
          
          if (validRooms.length === 0) {
            roomsList.innerHTML = '<div class="empty-state" style="padding: 8px 0;">No active rooms</div>';
          } else {
            validRooms.forEach(child => {
              const li = document.createElement('li');
              li.className = 'room-item';
              li.dataset.roomid = child.roomId;
              console.log('child', child);
              const displayName = getRoomDisplayName(child);
              li.innerHTML = `
                <div class="room-icon">
                  <i class="material-icons">#</i>
                </div>
                <div class="room-name">${displayName}</div>
              `;
              
              li.addEventListener('click', async (e) => {
                e.stopPropagation();
                await joinRoom(child.roomId);
              });
              
              roomsList.appendChild(li);
            });
          }
        }
        
        childrenContainer.appendChild(roomsList);
      } catch (error) {
        console.error(`Failed to load children for space ${space.roomId}:`, error);
        childrenContainer.innerHTML = '<div class="empty-state" style="padding: 8px 0;">Error loading rooms</div>';
      }
      
      spacesTree.appendChild(spaceHeader);
      spacesTree.appendChild(childrenContainer);
      
      // Expand the first space by default
      if (spaces[0] === space) {
        toggleSpace(space.roomId);
      }
    }
  } catch (error) {
    console.error('Failed to load spaces:', error);
    showStatus(`Failed to load spaces: ${error.message}`, 'error');
  }
}

function getRoomDisplayName(room) {
  if (!room) return 'Unknown Room';
  if (room.canonicalAlias) return room.canonicalAlias;
  if (room.name) return room.name;
  return room.roomId || 'Unknown Room';
}

async function loadSpace(spaceId) {
  try {
    currentSpaceId = spaceId;
    
    const space = await matrixClient.getRoom(spaceId);
    if (!space) throw new Error(`Space ${spaceId} not found`);
    
    const childrenData = await matrixClient.getSpaceChildren(spaceId);
    const roomsList = document.getElementById('spaceRoomsList');
    
    if (!roomsList) return;
    
    roomsList.innerHTML = '';
    
    if (childrenData.children.length === 0) {
      roomsList.innerHTML = '<div class="empty-state"><p>No rooms in this space</p></div>';
      return;
    }
    
    childrenData.children.forEach(child => {
      console.log('child', child);
      
      const li = document.createElement('li');
      li.className = 'room-item';
      li.dataset.roomid = child.roomId;
      
      li.innerHTML = `
        <div class="room-icon">
          <i class="material-icons">#</i>
        </div>
        <div class="room-name">${child.name}</div>
        <div class="room-members">${child.members || '?'}</div>
      `;
      
      li.addEventListener('click', async () => {
        await joinRoom(child.roomId);
      });
      
      roomsList.appendChild(li);
    });
  } catch (error) {
    console.error('Failed to load space:', error);
    showStatus(`Failed to load space: ${error.message}`, 'error');
  }
}
async function loadPublicRooms() {
  try {
    const rooms = await matrixClient.publicRooms();
    const roomsList = document.getElementById('publicRoomsList');
    roomsList.innerHTML = '';
    
    if (rooms.chunk.length === 0) {
      roomsList.innerHTML = '<div class="empty-state"><p>No public rooms found</p></div>';
      return;
    }
    
    // Fetch details for each public room
    const roomDetailsPromises = rooms.chunk.map(room => 
      matrixClient.getRoom(room.room_id).catch(() => null)
    );
    
    const roomDetails = await Promise.all(roomDetailsPromises);
    
    // Filter out invalid rooms
    const validRooms = roomDetails.filter(room => room !== null);
    
    if (validRooms.length === 0) {
      roomsList.innerHTML = '<div class="empty-state"><p>No active rooms found</p></div>';
      return;
    }
    
    validRooms.forEach(room => {
      const li = document.createElement('li');
      li.className = 'room-item';
      li.dataset.roomid = room.roomId;
      
      // Get the best display name
      const displayName = getRoomDisplayName(room);
      
      li.innerHTML = `
        <div class="room-icon">
          <i class="material-icons">#</i>
        </div>
        <div class="room-name">${displayName}</div>
        <div class="room-members">${room.members || '?'}</div>
      `;
      
      li.addEventListener('click', async () => {
        await joinRoom(room.roomId);
      });
      
      roomsList.appendChild(li);
    });
  } catch (error) {
    console.error('Failed to load public rooms:', error);
    showStatus(`Failed to load public rooms: ${error.message}`, 'error');
  }
}

async function joinRoom(roomIdOrAlias) {
  try {
    document.querySelectorAll('.room-item').forEach(item => {
      item.classList.remove('active');
    });

    // Only receive the room ID string from the joinRoom method
    const roomId = await matrixClient.joinRoom(roomIdOrAlias);
    currentRoomId = roomId;
    
    // Now get room details separately
    const room = await matrixClient.getRoom(roomId);
    const displayName = getRoomDisplayName(room);
    document.getElementById('currentRoom').textContent = displayName;
    
    // Enable message form
    document.getElementById('messageInput').disabled = false;
    document.querySelector('#messageForm button').disabled = false;
    
    // Clear messages and show room
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';
    document.querySelector('.empty-state').classList.add('hidden');
    
    // Load initial messages
    if (room && room.timeline) {
      room.timeline.forEach(event => {
        if (event.type === 'm.room.message') {
          let body = event.body || '';
          let msgType = event.msgtype || 'm.text';
          const isSelf = event.sender === currentUserId;
          // Handle different message types
          if (msgType === "m.image") {
            body = `[Image: ${event.body || "Untitled"}]`;
          } else if (msgType === "m.file") {
            body = `[File: ${event.body || "Untitled"}]`;
          } else if (msgType === "m.emote") {
            body = `* ${event.sender} ${event.body}`;
          }
          
          addMessageToUI(event.sender, body, msgType, isSelf);
        }
      });
    }
    
    // Load room members
    loadRoomMembers(roomId);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Add active class to the selected room
    const activeRoomItem = document.querySelector(`.room-item[data-roomid="${roomId}"]`);
    if (activeRoomItem) {
      activeRoomItem.classList.add('active');
    }
  } catch (error) {
    console.error('Failed to join room:', error);
    showStatus(`Failed to join room: ${error.message}`, 'error');
  }
}

function addMessageToUI(sender, message, type = 'm.text', isSelf = false) {
  const displayText = typeof message === 'string' ? message : '[Non-text message]';
  const messagesContainer = document.getElementById('messages');
  
  // Hide empty state if it's visible
  document.querySelector('.empty-state').classList.add('hidden');
  
  // Create message element
  const messageElement = document.createElement('div');
  messageElement.className = `message ${isSelf ? 'self' : 'other'}`;
  
  // Format sender name
  const senderName = isSelf ? 'You' : sender.split(':')[0].substring(1);
  
  // Format time
  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  messageElement.innerHTML = `
    <div class="message-sender">${senderName}</div>
    <div class="message-content">${displayText}</div>
    <div class="message-time">${timeString}</div>
  `;
  
  messagesContainer.appendChild(messageElement);
  
  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function loadRoomMembers(roomId) {
  try {
    const peopleList = document.getElementById('peopleList');
    peopleList.innerHTML = '';
    
    // Get room members
    const room = await matrixClient.getRoom(roomId);
    if (!room || !room.members) {
      peopleList.innerHTML = '<div class="empty-state"><p>No members found</p></div>';
      return;
    }
    
    // Add members to list
    room.members.forEach(member => {
      const li = document.createElement('li');
      li.className = 'person-item';
      
      // Get first letter of username for avatar
      const username = member.split(':')[0].substring(1);
      const firstLetter = username.charAt(0).toUpperCase();
      
      li.innerHTML = `
        <div class="person-avatar">${firstLetter}</div>
        <div class="person-name">${username}</div>
        <div class="person-status"></div>
      `;
      
      peopleList.appendChild(li);
    });
  } catch (error) {
    console.error('Failed to load room members:', error);
  }
}

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('roomJoinStatus');
  statusEl.textContent = message;
  statusEl.className = `status-message status-${type}`;
}

document.getElementById('messageForm').onsubmit = async (e) => {
  e.preventDefault();
  const messageInput = document.getElementById('messageInput');
  const message = messageInput.value.trim();
  
  if (message && currentRoomId) {
    try {
      await matrixClient.sendMessage(currentRoomId, message);
      // Add our own message to UI immediately
      addMessageToUI(matrixClient.getUserId(), message, 'm.text', true);
      messageInput.value = '';
      messageInput.focus();
    } catch (error) {
      console.error('Failed to send message:', error);
      showStatus(`Failed to send message: ${error.message}`, 'error');
    }
  }
};

document.getElementById('createSpaceButton').addEventListener('click', async (e) => {
  e.stopPropagation();
  const spaceName = prompt('Enter space name:');
  if (spaceName) {
    try {
      const spaceId = await matrixClient.createSpace(spaceName);
      showStatus(`Space ${spaceName} created!`, 'success');
      loadSpaces();
    } catch (error) {
      showStatus(`Failed to create space: ${error.message}`, 'error');
    }
  }
});

// Initially hide the app container
document.querySelector('.app-container').style.display = 'none';