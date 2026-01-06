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
    
    // 创建分屏窗口
    const splitWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      title: `分屏: ${displayName}`,
      backgroundColor: '#000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true
      },
      show: false
    });

    // 在开发模式下，需要通过data URL加载HTML内容
    // 在生产模式下，使用文件路径
    if (isDev) {
      // 开发模式：使用data URL
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
    }
    
    video {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
    }
  </style>
</head>
<body>
  <video id="video" autoplay></video>
  
  <script>
    const video = document.getElementById('video');
    const videoSrc = decodeURIComponent('${encodeURIComponent(videoSrc)}');
    const displayName = decodeURIComponent('${encodeURIComponent(displayName)}');
    
    document.title = '分屏: ' + displayName;
    
    if (videoSrc) {
      video.src = videoSrc;
      
      video.addEventListener('loadedmetadata', () => {
        console.log('Split screen video loaded');
      });
      
      video.addEventListener('error', (e) => {
        console.error('Split screen video error:', e);
      });
    } else {
      console.error('No video source provided');
    }
  </script>
</body>
</html>`;
      
      await splitWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    } else {
      // 生产模式：使用文件路径
      const url = `file://${path.join(__dirname, '../renderer/split-screen.html')}?src=${encodeURIComponent(videoSrc)}&name=${encodeURIComponent(displayName)}`;
      await splitWindow.loadURL(url);
    }

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

    return { success: true };
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
        // 使用executeJavaScript更新视频源
        splitWindow.webContents.executeJavaScript(`
          (function() {
            const video = document.getElementById('video');
            if (video) {
              video.src = decodeURIComponent('${encodeURIComponent(videoSrc)}');
              document.title = '分屏: ' + decodeURIComponent('${encodeURIComponent(displayName)}');
              video.load();
              video.play().catch(err => console.error('播放错误:', err));
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
            const video = document.getElementById('video');
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

