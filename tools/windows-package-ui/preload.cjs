const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('packager', {
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  build: options => ipcRenderer.invoke('build', options),
  openOutput: () => ipcRenderer.invoke('open-output'),
  playOutput: () => ipcRenderer.invoke('play-output'),
  onPreviewEnded: callback => ipcRenderer.on('preview-ended', callback),
  onProgress: callback => ipcRenderer.on('progress', (_event, message) => callback(message)),
});
