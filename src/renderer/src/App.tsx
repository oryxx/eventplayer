import { useState, useEffect } from 'react';
import PlaylistManager from './components/PlaylistManager';
import VideoPlayer from './components/VideoPlayer';
import PlaylistEditor from './components/PlaylistEditor';
import './App.css';

export interface Playlist {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: number;
  playlist_id: number;
  file_path: string;
  file_name: string;
  display_name: string | null;
  file_size: number;
  duration: number | null;
  label: 'action' | 'standby';
  sort_order: number;
  created_at: string;
}

type ViewMode = 'edit' | 'play';

function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [currentPlaylist, setCurrentPlaylist] = useState<Playlist | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');

  // 加载播放列表
  useEffect(() => {
    loadPlaylists();
  }, []);

  // 加载当前播放列表的视频
  useEffect(() => {
    if (selectedPlaylistId) {
      loadVideos(selectedPlaylistId);
      loadPlaylistInfo(selectedPlaylistId);
    } else {
      setVideos([]);
      setCurrentPlaylist(null);
    }
  }, [selectedPlaylistId]);

  const loadPlaylists = async () => {
    try {
      if (!window.electronAPI) {
        console.warn('Electron API not available - running in browser?');
        return;
      }
      const result = await window.electronAPI.playlist.getAll();
      if (result.success && result.data) {
        setPlaylists(result.data as Playlist[]);
      }
    } catch (error) {
      console.error('Error loading playlists:', error);
    }
  };

  const loadPlaylistInfo = async (id: number) => {
    const result = await window.electronAPI.playlist.getById(id);
    if (result.success && result.data) {
      setCurrentPlaylist(result.data as Playlist);
    }
  };

  const loadVideos = async (playlistId: number) => {
    const result = await window.electronAPI.video.getByPlaylist(playlistId);
    if (result.success && result.data) {
      setVideos(result.data as Video[]);
    }
  };

  const handlePlaylistSelect = (id: number) => {
    if (id === -1) {
      setSelectedPlaylistId(null);
      setViewMode('edit');
    } else {
      setSelectedPlaylistId(id);
      setViewMode('edit'); // 默认进入编辑模式
    }
    setCurrentVideoIndex(0);
    setIsPlaying(false);
  };

  const handlePlayList = () => {
    if (selectedPlaylistId) {
      setViewMode('play'); // 进入播放模式
      setCurrentVideoIndex(0);
      setIsPlaying(false);
    }
  };

  const handlePlay = () => {
    if (videos.length > 0) {
      setIsPlaying(true);
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
  };


  const handleVideoEnd = () => {
    const currentVideo = videos[currentVideoIndex];
    if (!currentVideo) return;

    // 动作视频：自动播放下一个
    if (currentVideo.label === 'action' && isPlaying) {
      if (currentVideoIndex < videos.length - 1) {
        setCurrentVideoIndex(currentVideoIndex + 1);
      }
    }
    // 待机视频：循环播放（在VideoPlayer组件中处理）
  };

  return (
    <div className="app">
      <div className="app-header">
        <h1>EventPlayer</h1>
      </div>
      <div className="app-content">
        <div className="app-sidebar">
          <PlaylistManager
            playlists={playlists}
            selectedPlaylistId={selectedPlaylistId}
            onSelect={handlePlaylistSelect}
            onRefresh={loadPlaylists}
          />
        </div>
        <div className="app-main">
          {selectedPlaylistId ? (
            viewMode === 'edit' ? (
              <PlaylistEditor
                playlist={currentPlaylist}
                videos={videos}
                onVideosChange={loadVideos}
                playlistId={selectedPlaylistId}
                onPlay={handlePlayList}
              />
            ) : (
              <VideoPlayer
                videos={videos}
                currentIndex={currentVideoIndex}
                isPlaying={isPlaying}
                onPlay={handlePlay}
                onPause={handlePause}
                onVideoEnd={handleVideoEnd}
                onIndexChange={setCurrentVideoIndex}
              />
            )
          ) : (
            <div className="app-placeholder">
              <p>请选择一个播放列表或创建新播放列表</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
