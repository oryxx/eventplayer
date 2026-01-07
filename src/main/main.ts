import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseManager } from './database';
import { FileManager } from './fileManager';

let mainWindow: BrowserWindow | null = null;
let splitScreenWindows: BrowserWindow[] = [];
let dbManager: DatabaseManager;
let fileManager: FileManager;

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  console.log('Creating window, isDev:', isDev);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true, // 立即显示窗口
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // 允许本地文件访问（开发环境）
    }
  });
  
  console.log('Window created, showing window...');
  mainWindow.show();
  mainWindow.focus();

  // 开发环境加载Vite服务器，生产环境加载打包后的文件
  if (isDev) {
    // 先显示窗口，即使URL还没加载
    mainWindow.show();
    mainWindow.focus();
    
    // 尝试多个可能的端口（Vite可能会使用不同的端口）
    const tryLoadURL = (port: number, retryCount = 0) => {
      const url = `http://localhost:${port}`;
      mainWindow?.loadURL(url).then(() => {
        console.log(`Successfully loaded ${url}`);
        mainWindow?.webContents.openDevTools();
      }).catch(() => {
        console.log(`Failed to load ${url}, retry count: ${retryCount}`);
        // 如果重试次数少于20次（约10秒），继续重试
        if (retryCount < 20) {
          setTimeout(() => tryLoadURL(port, retryCount + 1), 500);
        } else {
          // 尝试下一个端口
          if (port < 5180) {
            tryLoadURL(port + 1, 0);
          } else {
            console.error('Failed to load Vite server on any port after multiple retries');
          }
        }
      });
    };
    
    // 从5173开始尝试，延迟1秒开始，给Vite服务器启动时间
    setTimeout(() => {
      tryLoadURL(5173, 0);
    }, 1000);
  } else {
    // 生产环境：打包后的文件路径
    // 在打包后，文件在 resources/app.asar/dist/renderer/index.html
    // __dirname 指向 resources/app.asar/dist/main
    const indexPath = path.join(__dirname, '../renderer/index.html');
    console.log('Production mode - Loading index.html');
    console.log('__dirname:', __dirname);
    console.log('indexPath:', indexPath);
    
    // 检查文件是否存在
    if (fs.existsSync(indexPath)) {
      console.log('Index.html found at:', indexPath);
    } else {
      console.error('Index.html NOT found at:', indexPath);
      // 尝试其他可能的路径
      const altPaths = [
        path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'),
        path.join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html'),
        path.join(__dirname, '..', 'renderer', 'index.html'),
      ];
      for (const altPath of altPaths) {
        if (fs.existsSync(altPath)) {
          console.log('Found index.html at alternate path:', altPath);
          mainWindow.loadFile(altPath);
          return;
        }
      }
      console.error('Could not find index.html in any expected location');
    }
    
    mainWindow.loadFile(indexPath).then(() => {
      console.log('Index.html loaded successfully');
      mainWindow?.show();
      mainWindow?.focus();
    }).catch((error) => {
      console.error('Failed to load index.html:', error);
    });
  }
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // 确保窗口在准备好后显示
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  try {
    // 注册自定义协议用于访问本地文件
    protocol.registerFileProtocol('local-video', (request, callback) => {
      try {
        // 从URL中提取文件路径
        const url = request.url.replace('local-video://', '');
        const filePath = decodeURIComponent(url);
        
        // 验证文件是否存在
        if (fs.existsSync(filePath)) {
          callback({ path: filePath });
        } else {
          console.error('File not found:', filePath);
          callback({ error: -6 }); // FILE_NOT_FOUND
        }
      } catch (error) {
        console.error('Error loading file:', error);
        callback({ error: -6 });
      }
    });
    console.log('Custom protocol registered');
    
    dbManager = new DatabaseManager();
    fileManager = new FileManager();
    
    createWindow();
    console.log('Electron window created successfully');
  } catch (error) {
    console.error('Error initializing app:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (dbManager) {
    dbManager.close();
  }
});

// IPC 处理程序

// 播放列表操作
ipcMain.handle('playlist:create', async (_, name: string) => {
  try {
    const id = dbManager.createPlaylist(name);
    return { success: true, id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('playlist:getAll', async () => {
  try {
    const playlists = dbManager.getAllPlaylists();
    return { success: true, data: playlists };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('playlist:getById', async (_, id: number) => {
  try {
    const playlist = dbManager.getPlaylistById(id);
    return { success: true, data: playlist };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('playlist:update', async (_, id: number, name: string) => {
  try {
    dbManager.updatePlaylist(id, name);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('playlist:delete', async (_, id: number) => {
  try {
    const result = dbManager.deletePlaylist(id);
    // 删除关联的视频文件
    if (result.success) {
      result.videoPaths.forEach(videoPath => {
        fileManager.deleteVideoFile(videoPath);
      });
    }
    return { success: result.success };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// 视频操作
ipcMain.handle('video:selectFile', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: '视频文件', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] }
      ]
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    return { success: true, filePath: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('video:add', async (_, playlistId: number, sourcePath: string, label: string) => {
  try {
    // 复制文件
    const fileInfo = await fileManager.copyVideoFile(sourcePath);
    
    // 添加到数据库
    const id = dbManager.addVideo(
      playlistId,
      fileInfo.filePath,
      fileInfo.fileName,
      fileInfo.displayName,
      fileInfo.fileSize,
      label
    );

    return { success: true, id, fileInfo };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('video:getByPlaylist', async (_, playlistId: number) => {
  try {
    const videos = dbManager.getVideosByPlaylistId(playlistId);
    return { success: true, data: videos };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('video:update', async (_, id: number, updates: { label?: string; sort_order?: number; display_name?: string }) => {
  try {
    dbManager.updateVideo(id, updates);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('video:delete', async (_, id: number) => {
  try {
    const result = dbManager.deleteVideo(id);
    // 删除文件
    if (result.success && result.videoPath) {
      fileManager.deleteVideoFile(result.videoPath);
    }
    return { success: result.success };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('video:updateOrder', async (_, playlistId: number, videoOrders: Array<{ id: number; sort_order: number }>) => {
  try {
    dbManager.updateVideoOrder(playlistId, videoOrders);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle('video:openSplitScreen', async (_, videoSrc: string, displayName: string) => {
  try {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    
    // 创建分屏窗口（无边框，完全去掉顶部）
    const splitWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      title: `分屏: ${displayName}`,
      backgroundColor: '#000000',
      frame: false, // 无边框窗口，去掉整个顶部（包括标题栏）
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'), // 使用相同的 preload 脚本
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true
      },
      show: false
    });

    // 获取窗口 ID（在创建窗口后）
    const windowId = splitWindow.id;

    // 统一使用 data URL 加载 HTML 内容（开发和生产模式都使用）
    // 这样可以避免打包后文件路径的问题
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>分屏播放</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background: #000;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100vw;
      height: 100vh;
      -webkit-app-region: drag; /* 整个窗口可拖动 */
      cursor: default;
    }
    
    video {
      -webkit-app-region: no-drag; /* 视频区域不可拖动 */
    }
    
    #contextMenu {
      position: fixed;
      background: rgba(30, 30, 30, 0.95);
      border: 1px solid #555;
      border-radius: 4px;
      padding: 4px 0;
      display: none;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      min-width: 120px;
    }
    
    #contextMenu.menu-visible {
      display: block;
    }
    
    .menu-item {
      padding: 8px 16px;
      color: #fff;
      cursor: pointer;
      font-size: 13px;
      -webkit-app-region: no-drag;
    }
    
    .menu-item:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    
    .menu-item:active {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .menu-separator {
      height: 1px;
      background: #555;
      margin: 4px 0;
    }
  </style>
</head>
  <body>
  <div style="position: relative; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center;">
    <video id="videoA" autoplay style="position: absolute; max-width: 100%; max-height: 100%; width: auto; height: auto; opacity: 1; transition: opacity 0.3s;"></video>
    <video id="videoB" autoplay style="position: absolute; max-width: 100%; max-height: 100%; width: auto; height: auto; opacity: 0; transition: opacity 0.3s; pointer-events: none;"></video>
  </div>
  <div id="contextMenu">
    <div class="menu-item" data-action="minimize">最小化</div>
    <div class="menu-item" data-action="maximize">最大化/还原</div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-action="close">关闭</div>
  </div>
  
  <script>
    const videoA = document.getElementById('videoA');
    const videoB = document.getElementById('videoB');
    const contextMenu = document.getElementById('contextMenu');
    let activeVideo = 'A';
    let currentVideoSrc = '';
    
    const getActiveVideo = () => activeVideo === 'A' ? videoA : videoB;
    const getInactiveVideo = () => activeVideo === 'A' ? videoB : videoA;
    
    // 初始化视频
    const initialVideoSrc = decodeURIComponent('${encodeURIComponent(videoSrc)}');
    const initialDisplayName = decodeURIComponent('${encodeURIComponent(displayName)}');
    const windowId = ${windowId};
    
    document.title = '分屏: ' + initialDisplayName;
    currentVideoSrc = initialVideoSrc;
    
    // 加载初始视频
    if (initialVideoSrc) {
      videoA.src = initialVideoSrc;
      videoA.addEventListener('loadedmetadata', () => {
        console.log('Split screen video loaded');
      });
      videoA.addEventListener('error', (e) => {
        console.error('Split screen video error:', e);
      });
    } else {
      console.error('No video source provided');
    }
    
    // 更新视频函数（用于无缝切换）
    window.updateSplitScreenVideo = function(newVideoSrc, newDisplayName) {
      const inactiveVideo = getInactiveVideo();
      const activeVideoEl = getActiveVideo();
      
      if (!inactiveVideo || !activeVideoEl) return;
      
      // 如果视频源相同，不需要切换
      if (newVideoSrc === currentVideoSrc) return;
      
      // 将新视频加载到隐藏的播放器
      inactiveVideo.src = newVideoSrc;
      currentVideoSrc = newVideoSrc;
      document.title = '分屏: ' + newDisplayName;
      
      const onReady = () => {
        // 切换显示
        if (activeVideo === 'A') {
          videoA.style.opacity = '0';
          videoA.style.pointerEvents = 'none';
          videoB.style.opacity = '1';
          videoB.style.pointerEvents = 'auto';
          activeVideo = 'B';
          if (activeVideoEl.paused === false) {
            videoB.play().catch(err => console.error('播放错误:', err));
          }
          videoA.pause();
        } else {
          videoB.style.opacity = '0';
          videoB.style.pointerEvents = 'none';
          videoA.style.opacity = '1';
          videoA.style.pointerEvents = 'auto';
          activeVideo = 'A';
          if (activeVideoEl.paused === false) {
            videoA.play().catch(err => console.error('播放错误:', err));
          }
          videoB.pause();
        }
        
        inactiveVideo.removeEventListener('loadeddata', onReady);
        inactiveVideo.removeEventListener('canplay', onReady);
      };
      
      inactiveVideo.addEventListener('loadeddata', onReady);
      inactiveVideo.addEventListener('canplay', onReady);
      
      // 如果当前没有播放，立即加载
      if (activeVideoEl.paused) {
        inactiveVideo.load();
      }
    };
    
    // 获取当前活动的视频元素
    window.getActiveSplitScreenVideo = function() {
      return getActiveVideo();
    };
    
    // 右键菜单
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu.style.left = e.clientX + 'px';
      contextMenu.style.top = e.clientY + 'px';
      contextMenu.classList.add('menu-visible');
    });
    
    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
      if (!contextMenu.contains(e.target)) {
        contextMenu.classList.remove('menu-visible');
      }
    });
    
    // 菜单项点击处理
    contextMenu.addEventListener('click', async (e) => {
      const action = e.target.getAttribute('data-action');
      if (!action) return;
      
      contextMenu.classList.remove('menu-visible');
      
      try {
        if (window.electronAPI && window.electronAPI.splitScreen) {
          switch(action) {
            case 'minimize':
              await window.electronAPI.splitScreen.minimize(windowId);
              break;
            case 'maximize':
              await window.electronAPI.splitScreen.maximize(windowId);
              break;
            case 'close':
              await window.electronAPI.splitScreen.close(windowId);
              break;
          }
        }
      } catch (error) {
        console.error('Window control error:', error);
      }
    });
  </script>
</body>
</html>`;
    
    await splitWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    splitWindow.show();
    splitWindow.focus();

    // 保存窗口引用
    splitScreenWindows.push(splitWindow);

    // 窗口关闭时从数组中移除
    splitWindow.on('closed', () => {
      const index = splitScreenWindows.indexOf(splitWindow);
      if (index > -1) {
        splitScreenWindows.splice(index, 1);
      }
    });

    // 注册窗口控制 IPC 处理器（每个窗口独立）
    ipcMain.handle(`splitScreen:minimize:${windowId}`, () => {
      splitWindow.minimize();
      return { success: true };
    });

    ipcMain.handle(`splitScreen:maximize:${windowId}`, () => {
      if (splitWindow.isMaximized()) {
        splitWindow.unmaximize();
      } else {
        splitWindow.maximize();
      }
      return { success: true };
    });

    ipcMain.handle(`splitScreen:close:${windowId}`, () => {
      splitWindow.close();
      return { success: true };
    });

    ipcMain.handle(`splitScreen:move:${windowId}`, (_, deltaX: number, deltaY: number) => {
      const [x, y] = splitWindow.getPosition();
      splitWindow.setPosition(x + deltaX, y + deltaY);
      return { success: true };
    });

    return { success: true, windowId };
  } catch (error) {
    console.error('Error opening split screen:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('video:updateSplitScreen', async (_, videoSrc: string, displayName: string) => {
  try {
    // 向所有分屏窗口发送视频更新
    splitScreenWindows.forEach(splitWindow => {
      if (!splitWindow.isDestroyed()) {
        // 使用executeJavaScript更新视频源（使用双视频无缝切换）
        splitWindow.webContents.executeJavaScript(`
          (function() {
            if (window.updateSplitScreenVideo) {
              window.updateSplitScreenVideo(
                decodeURIComponent('${encodeURIComponent(videoSrc)}'),
                decodeURIComponent('${encodeURIComponent(displayName)}')
              );
            }
          })();
        `).catch(err => {
          console.error('更新分屏窗口失败:', err);
        });
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating split screen:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('video:syncSplitScreenPlayback', async (_, action: 'play' | 'pause' | 'loop') => {
  try {
    // 向所有分屏窗口同步播放状态
    splitScreenWindows.forEach(splitWindow => {
      if (!splitWindow.isDestroyed()) {
        const script = `
          (function() {
            const video = window.getActiveSplitScreenVideo ? window.getActiveSplitScreenVideo() : document.getElementById('videoA') || document.getElementById('videoB');
            if (video) {
              const action = '${action}';
              if (action === 'play') {
                video.play().catch(err => console.error('播放错误:', err));
              } else if (action === 'pause') {
                video.pause();
              } else if (action === 'loop') {
                video.currentTime = 0;
                video.play().catch(err => console.error('播放错误:', err));
              }
            }
          })();
        `;
        splitWindow.webContents.executeJavaScript(script).catch(err => {
          console.error('同步分屏窗口播放状态失败:', err);
        });
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Error syncing split screen playback:', error);
    return { success: false, error: String(error) };
  }
});

