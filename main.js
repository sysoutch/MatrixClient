require('@electron/remote/main').initialize();
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sdk = require('matrix-js-sdk');

const clients = new Map();

function getClient(baseUrl) {
  if (!clients.has(baseUrl)) {
    const client = sdk.createClient({ baseUrl });
    clients.set(baseUrl, client);
    
    // Event forwarding
    client.on(sdk.ClientEvent.Sync, (state) => {
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('sync-event', state);
      });
    });
    
    client.on(sdk.RoomEvent.Timeline, (event, room) => {
      if (event.getType() === "m.room.message") {
        const content = event.getContent();
        let body = content.body || '';
        
        // Handle different message types
        if (content.msgtype === "m.image") {
          body = `[Image: ${content.body || "Untitled"}]`;
        } else if (content.msgtype === "m.file") {
          body = `[File: ${content.body || "Untitled"}]`;
        } else if (content.msgtype === "m.emote") {
          body = `* ${event.sender} ${content.body}`;
        } else if (content.msgtype === "m.notice") {
          body = `[Notice] ${content.body}`;
        }
        
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('message-event', {
            body: body,
            roomId: room.roomId,
            sender: event.getSender(),
            type: content.msgtype
          });
        });
      }
    });
  }
  return clients.get(baseUrl);
}

// Improved publicRooms with better error handling
ipcMain.handle('matrix-publicRooms', (_, baseUrl) => {
  return new Promise((resolve, reject) => {
    const client = getClient(baseUrl);
    
    // Timeout to prevent hanging
    const timeout = setTimeout(() => {
      reject(new Error('Failed to fetch public rooms: Request timed out'));
    }, 10000);
    
    client.publicRooms((err, data) => {
      clearTimeout(timeout);
      if (err) {
        reject(new Error(`Failed to fetch public rooms: ${err.message}`));
      } else {
        resolve(data);
      }
    });
  });
});

ipcMain.handle('matrix-startClient', (_, baseUrl, opts) => {
  getClient(baseUrl).startClient(opts);
  return true;
});

ipcMain.handle('matrix-login', (_, baseUrl, username, password) => {
  return getClient(baseUrl).loginWithPassword(username, password);
});

ipcMain.handle('matrix-joinRoom', (_, baseUrl, roomIdOrAlias) => {
  return new Promise((resolve, reject) => {
    const client = getClient(baseUrl);
    
    client.joinRoom(roomIdOrAlias)
      .then(room => {
        resolve(room.roomId);
      })
      .catch(error => {
        reject(new Error(`Failed to join room: ${error.message}`));
      });
  });
});

ipcMain.handle('matrix-sendMessage', (_, baseUrl, roomId, message) => {
  const client = getClient(baseUrl);
  const content = { body: message, msgtype: "m.text" };
  return client.sendEvent(roomId, "m.room.message", content, "");
});

ipcMain.handle('matrix-getSpace', (_, baseUrl, spaceId) => {
  const client = getClient(baseUrl);
  return client.getRoom(spaceId);
});

ipcMain.handle('matrix-getSpaceChildren', (_, baseUrl, spaceId) => {
  const client = getClient(baseUrl);
  const space = client.getRoom(spaceId);
  if (!space) return { children: [] };
  
  return {
    children: space.currentState.getStateEvents('m.space.child')
      .map(event => ({
        roomId: event.getStateKey(),
        name: event.getContent().name || event.getStateKey(),
        type: event.getContent().type || 'm.room'
      }))
  };
});

ipcMain.handle('matrix-getStoredRooms', (_, baseUrl) => {
  const client = getClient(baseUrl);
  return client.getRooms().map(room => ({
    roomId: room.roomId,
    name: room.name,
    type: room.getType(),
    members: room.getJoinedMemberCount(),
    unread: room.getUnreadNotificationCount(),
    lastMessage: room.timeline.length > 0 ? 
      room.timeline[room.timeline.length - 1].getContent().body : ''
  }));
});

ipcMain.handle('matrix-getRoom', (_, baseUrl, roomId) => {
  const client = getClient(baseUrl);
  const room = client.getRoom(roomId);
  if (!room) return null;
  return {
    roomId: room.roomId,
    name: room.name,
    timeline: room.timeline
      .filter(event => event.getType() === 'm.room.message')
      .map(event => ({
        sender: event.getSender(),
        body: event.getContent().body,
        type: event.getType(),
        timestamp: event.getTs()
      }))
  };
});

ipcMain.handle('matrix-getUserId', (_, baseUrl) => {
  const client = getClient(baseUrl);
  return client.getUserId();
});

function createWindow() {
  const win = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  require('@electron/remote/main').enable(win.webContents);
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});