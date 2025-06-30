const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('matrix', {
  createClient: (baseUrl) => {
    return {
      publicRooms: () => ipcRenderer.invoke('matrix-publicRooms', baseUrl),
      startClient: (opts) => ipcRenderer.invoke('matrix-startClient', baseUrl, opts),
      login: (username, password) => ipcRenderer.invoke('matrix-login', baseUrl, username, password),
      getUserId: () => ipcRenderer.invoke('matrix-getUserId', baseUrl),
      joinRoom: (roomId) => ipcRenderer.invoke('matrix-joinRoom', baseUrl, roomId),
      sendMessage: (roomId, message) => 
        ipcRenderer.invoke('matrix-sendMessage', baseUrl, roomId, message),
      invite: (roomId, userId) => ipcRenderer.invoke('matrix-invite', baseUrl, roomId, userId),
      
      // Event handlers
      onSync: (callback) => {
        ipcRenderer.on('sync-event', (_, state) => callback(state));
      },
      
      onMessage: (callback) => {
        ipcRenderer.on('message-event', (_, data) => {
          callback(data);
        });
      },

      getSpace: (spaceId) => ipcRenderer.invoke('matrix-getSpace', baseUrl, spaceId),
      getSpaceChildren: (spaceId) => ipcRenderer.invoke('matrix-getSpaceChildren', baseUrl, spaceId),

      getStoredRooms: () => ipcRenderer.invoke('matrix-getStoredRooms', baseUrl),
      getRoom: (roomId) => ipcRenderer.invoke('matrix-getRoom', baseUrl, roomId),

      getRoomMembers: (roomId) => ipcRenderer.invoke('matrix-getRoomMembers', baseUrl, roomId),
      getPresence: (baseUrl, userId) => ipcRenderer.invoke('matrix-getPresence', baseUrl, userId)
    };
  }
});