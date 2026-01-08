import { contextBridge, ipcRenderer } from 'electron';

// 暴露受保护的方法给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 播放列表操作
  playlist: {
    create: (name: string) => ipcRenderer.invoke('playlist:create', name),
    getAll: () => ipcRenderer.invoke('playlist:getAll'),
    getById: (id: number) => ipcRenderer.invoke('playlist:getById', id),
    update: (id: number, name: string) => ipcRenderer.invoke('playlist:update', id, name),
    delete: (id: number) => ipcRenderer.invoke('playlist:delete', id),
  },
  
  // 视频操作
  video: {
    selectFile: () => ipcRenderer.invoke('video:selectFile'),
    add: (playlistId: number, sourcePath: string, label: string) => 
      ipcRenderer.invoke('video:add', playlistId, sourcePath, label),
    getByPlaylist: (playlistId: number) => ipcRenderer.invoke('video:getByPlaylist', playlistId),
    update: (id: number, updates: { label?: string; sort_order?: number; display_name?: string }) => 
      ipcRenderer.invoke('video:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('video:delete', id),
    updateOrder: (playlistId: number, videoOrders: Array<{ id: number; sort_order: number }>) => 
      ipcRenderer.invoke('video:updateOrder', playlistId, videoOrders),
    openSplitScreen: (videoSrc: string, displayName: string, isPlaying?: boolean, currentTime?: number) => 
      ipcRenderer.invoke('video:openSplitScreen', videoSrc, displayName, isPlaying, currentTime),
    updateSplitScreen: (videoSrc: string, displayName: string) => 
      ipcRenderer.invoke('video:updateSplitScreen', videoSrc, displayName),
    syncSplitScreenPlayback: (action: 'play' | 'pause' | 'loop') => 
      ipcRenderer.invoke('video:syncSplitScreenPlayback', action),
  },
  
  // 分屏窗口控制
  splitScreen: {
    minimize: (windowId: number) => ipcRenderer.invoke(`splitScreen:minimize:${windowId}`),
    maximize: (windowId: number) => ipcRenderer.invoke(`splitScreen:maximize:${windowId}`),
    close: (windowId: number) => ipcRenderer.invoke(`splitScreen:close:${windowId}`),
    move: (windowId: number, deltaX: number, deltaY: number) => 
      ipcRenderer.invoke(`splitScreen:move:${windowId}`, deltaX, deltaY),
  },
});

// TypeScript类型声明
declare global {
  interface Window {
    electronAPI: {
      playlist: {
        create: (name: string) => Promise<{ success: boolean; id?: number; error?: string }>;
        getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        getById: (id: number) => Promise<{ success: boolean; data?: any; error?: string }>;
        update: (id: number, name: string) => Promise<{ success: boolean; error?: string }>;
        delete: (id: number) => Promise<{ success: boolean; error?: string }>;
      };
      video: {
        selectFile: () => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
        add: (playlistId: number, sourcePath: string, label: string) => Promise<{ success: boolean; id?: number; fileInfo?: any; error?: string }>;
        getByPlaylist: (playlistId: number) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        update: (id: number, updates: { label?: string; sort_order?: number; display_name?: string }) => Promise<{ success: boolean; error?: string }>;
        delete: (id: number) => Promise<{ success: boolean; error?: string }>;
        updateOrder: (playlistId: number, videoOrders: Array<{ id: number; sort_order: number }>) => Promise<{ success: boolean; error?: string }>;
        openSplitScreen: (videoSrc: string, displayName: string, isPlaying?: boolean, currentTime?: number) => Promise<{ success: boolean; error?: string }>;
        updateSplitScreen: (videoSrc: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
        syncSplitScreenPlayback: (action: 'play' | 'pause' | 'loop') => Promise<{ success: boolean; error?: string }>;
      };
      splitScreen: {
        minimize: (windowId: number) => Promise<{ success: boolean }>;
        maximize: (windowId: number) => Promise<{ success: boolean }>;
        close: (windowId: number) => Promise<{ success: boolean }>;
        move: (windowId: number, deltaX: number, deltaY: number) => Promise<{ success: boolean }>;
      };
    };
  }
}

