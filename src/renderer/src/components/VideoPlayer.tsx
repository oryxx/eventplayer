import React, { useRef, useEffect, useState } from 'react';
import { Video } from '../App';
import './VideoPlayer.css';

interface VideoPlayerProps {
  videos: Video[];
  currentIndex: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onVideoEnd: () => void;
  onIndexChange: (index: number) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videos,
  currentIndex,
  isPlaying,
  onPlay,
  onPause,
  onVideoEnd,
  onIndexChange,
}) => {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState<'A' | 'B'>('A');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [nextRequested, setNextRequested] = useState(false); // 待机视频是否已请求切换到下一个

  const currentVideo = videos[currentIndex];

  // 转换文件路径为自定义协议 URL
  const getVideoSrc = (filePath: string) => {
    try {
      return `local-video://${encodeURIComponent(filePath)}`;
    } catch (error) {
      console.error('路径转换错误:', error, filePath);
      return `local-video://${filePath}`;
    }
  };

  const getActiveVideoEl = () =>
    active === 'A' ? videoARef.current : videoBRef.current;
  const getInactiveVideoEl = () =>
    active === 'A' ? videoBRef.current : videoARef.current;

  // 当视频索引变化时，预加载到隐藏播放器并无缝切换
  useEffect(() => {
    if (!currentVideo) return;
    const inactiveEl = getInactiveVideoEl();
    const activeEl = getActiveVideoEl();
    if (!inactiveEl || !activeEl) return;
    const videoSrc = getVideoSrc(currentVideo.file_path);
    inactiveEl.src = videoSrc;
    const onReady = () => {
      setActive(active === 'A' ? 'B' : 'A');
      if (isPlaying) {
        inactiveEl.play().catch(console.error);
      } else {
        inactiveEl.pause();
      }
      activeEl.pause();
      setDuration(inactiveEl.duration || 0);
      setCurrentTime(inactiveEl.currentTime || 0);
      inactiveEl.removeEventListener('loadeddata', onReady);
      inactiveEl.removeEventListener('canplay', onReady);
    };
    inactiveEl.addEventListener('loadeddata', onReady);
    inactiveEl.addEventListener('canplay', onReady);
    setNextRequested(false);
    if (!isPlaying) inactiveEl.load();
    // 通知主进程更新分屏窗口
    if (window.electronAPI && window.electronAPI.video) {
      const displayName = currentVideo.display_name || currentVideo.file_name;
      window.electronAPI.video
        .updateSplitScreen(videoSrc, displayName)
        .catch(() => {
        // 忽略错误，可能没有分屏窗口
        });
    }
  }, [currentIndex, currentVideo, isPlaying]);

  // 播放/暂停控制
  useEffect(() => {
    if (!currentVideo) return;
    const videoElement = getActiveVideoEl();
    if (!videoElement) return;
    if (isPlaying) {
      videoElement.play().catch(console.error);
      // 同步分屏窗口播放
      if (window.electronAPI && window.electronAPI.video) {
        window.electronAPI.video.syncSplitScreenPlayback('play').catch(() => {
          // 忽略错误，可能没有分屏窗口
        });
      }
    } else {
      videoElement.pause();
      // 同步分屏窗口暂停
      if (window.electronAPI && window.electronAPI.video) {
        window.electronAPI.video.syncSplitScreenPlayback('pause').catch(() => {
          // 忽略错误，可能没有分屏窗口
        });
      }
    }
  }, [isPlaying, currentVideo, active]);

  // 视频结束处理
  const handleVideoEnd = () => {
    if (!currentVideo) return;

    if (currentVideo.label === 'action') {
      // 动作视频：播放完后自动播放下一个
      if (currentIndex < videos.length - 1) {
        onIndexChange(currentIndex + 1);
      } else {
        // 已经是最后一个视频，停止播放
        onPause();
      }
    } else if (currentVideo.label === 'standby') {
      // 待机视频
      if (nextRequested) {
        // 如果已请求下一个，则切换到下一个视频
        if (currentIndex < videos.length - 1) {
          setNextRequested(false);
          onIndexChange(currentIndex + 1);
        } else {
          // 已经是最后一个视频，停止播放
          setNextRequested(false);
          onPause();
        }
      } else {
        // 否则循环播放
        const el = getActiveVideoEl();
        if (el) {
          el.currentTime = 0;
          el.play().catch(console.error);
        }
        // 同步分屏窗口循环播放
        if (window.electronAPI && window.electronAPI.video) {
          window.electronAPI.video.syncSplitScreenPlayback('loop').catch(() => {
            // 忽略错误，可能没有分屏窗口
          });
        }
      }
    }
    
    onVideoEnd();
  };

  // 处理下一个按钮点击
  const handleNextClick = () => {
    if (!currentVideo) return;

    if (currentVideo.label === 'action') {
      // 动作视频：立即切换到下一个
      if (currentIndex < videos.length - 1) {
        onIndexChange(currentIndex + 1);
      }
    } else {
      // 待机视频：标记为需要跳转，等待视频播完后切换
      if (currentIndex < videos.length - 1) {
        setNextRequested(true);
      }
    }
  };

  // 处理播放/暂停按钮
  const handlePlayPause = () => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  // 处理分屏按钮
  const handleSplitScreen = () => {
    if (!currentVideo || !window.electronAPI) return;
    
    // 获取视频URL
    const videoSrc = getVideoSrc(currentVideo.file_path);
    const displayName = currentVideo.display_name || currentVideo.file_name;
    
    // 调用主进程创建分屏窗口
    window.electronAPI.video.openSplitScreen(videoSrc, displayName).catch((error) => {
      console.error('打开分屏窗口失败:', error);
    });
  };

  // 进度更新
  const handleTimeUpdate = () => {
    const el = getActiveVideoEl();
    if (el) setCurrentTime(el.currentTime);
  };

  // 视频加载完成
  const handleLoadedMetadata = () => {
    const el = getActiveVideoEl();
    if (el) setDuration(el.duration);
  };

  // 进度条点击
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = getActiveVideoEl();
    if (el && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      el.currentTime = percent * duration;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentVideo) {
    return (
      <div className="video-player">
        <div className="video-player-placeholder">
          <p>请添加视频到播放列表</p>
        </div>
      </div>
    );
  }

  return (
    <div className="video-player">
      <div className="video-container">
        <video
          ref={videoARef}
          onEnded={handleVideoEnd}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={(e) => {
            console.error('视频加载错误:', e);
          }}
          className="video-element"
          style={{ opacity: active === 'A' ? 1 : 0 }}
          playsInline
        />
        <video
          ref={videoBRef}
          onEnded={handleVideoEnd}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={(e) => {
            console.error('视频加载错误:', e);
          }}
          className="video-element"
          style={{ opacity: active === 'B' ? 1 : 0 }}
          playsInline
        />
      </div>

      <div className="video-controls">
        <div className="video-info">
          <div className="video-title">
            {currentVideo.display_name || currentVideo.file_name} ({currentVideo.label === 'action' ? '动作' : '待机'})
          </div>
          <div className="video-progress-container" onClick={handleProgressClick}>
            <div
              className="video-progress-bar"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <div className="video-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <div className="video-controls-buttons">
          <button className="control-btn" onClick={handlePlayPause}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="control-btn"
            onClick={handleNextClick}
            disabled={currentIndex >= videos.length - 1 && !nextRequested}
          >
            下一个
          </button>
          <button
            className="control-btn"
            onClick={handleSplitScreen}
            title="分屏显示"
          >
            分屏
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
