const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("teleprompter", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  completeSetup: (payload) => ipcRenderer.invoke("settings:completeSetup", payload),
  skipWizard: () => ipcRenderer.invoke("settings:skipWizard"),
  setApiKey: (key) => ipcRenderer.invoke("settings:setApiKey", key),
  clearApiKey: () => ipcRenderer.invoke("settings:clearApiKey"),
  formatScriptAI: (payload) => ipcRenderer.invoke("ai:formatScript", payload),
});
