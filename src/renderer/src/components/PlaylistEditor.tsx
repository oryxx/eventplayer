import React, { useState } from 'react';
import { Playlist, Video } from '../App';
import './PlaylistEditor.css';

interface PlaylistEditorProps {
  playlist: Playlist | null;
  videos: Video[];
  playlistId: number;
  onVideosChange: (playlistId: number) => void;
  onPlay: () => void;
}

const PlaylistEditor: React.FC<PlaylistEditorProps> = ({
  playlist,
  videos,
  playlistId,
  onVideosChange,
  onPlay,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const handleAddVideo = async () => {
    // 选择文件
    const fileResult = await window.electronAPI.video.selectFile();
    if (!fileResult.success || fileResult.canceled || !fileResult.filePath) {
      return;
    }

    // 添加视频（默认标签为action）
    const result = await window.electronAPI.video.add(
      playlistId,
      fileResult.filePath,
      'action'
    );

    if (result.success) {
      console.log('Video added successfully:', result);
      onVideosChange(playlistId);
    } else {
      alert('添加视频失败: ' + result.error);
    }
  };

  const handleDeleteVideo = async (id: number) => {
    if (confirm('确定要删除这个视频吗？')) {
      const result = await window.electronAPI.video.delete(id);
      if (result.success) {
        onVideosChange(playlistId);
      } else {
        alert('删除失败: ' + result.error);
      }
    }
  };

  const handleToggleLabel = async (video: Video) => {
    const newLabel = video.label === 'action' ? 'standby' : 'action';
    const result = await window.electronAPI.video.update(video.id, { label: newLabel });
    if (result.success) {
      onVideosChange(playlistId);
    } else {
      alert('更新失败: ' + result.error);
    }
  };

  const handleStartRename = (video: Video) => {
    setEditingVideoId(video.id);
    setEditingName(video.display_name || video.file_name);
  };

  const handleSaveRename = async (id: number) => {
    if (!editingName.trim()) {
      setEditingVideoId(null);
      setEditingName('');
      return;
    }

    const result = await window.electronAPI.video.update(id, { display_name: editingName.trim() });
    if (result.success) {
      setEditingVideoId(null);
      setEditingName('');
      onVideosChange(playlistId);
    } else {
      alert('重命名失败: ' + result.error);
    }
  };

  const handleCancelRename = () => {
    setEditingVideoId(null);
    setEditingName('');
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    // 重新排序
    const newVideos = [...videos];
    const [draggedVideo] = newVideos.splice(draggedIndex, 1);
    newVideos.splice(dropIndex, 0, draggedVideo);

    // 更新排序
    const videoOrders = newVideos.map((video, index) => ({
      id: video.id,
      sort_order: index,
    }));

    const result = await window.electronAPI.video.updateOrder(playlistId, videoOrders);
    if (result.success) {
      onVideosChange(playlistId);
    } else {
      alert('排序失败: ' + result.error);
    }

    setDraggedIndex(null);
  };

  return (
    <div className="playlist-editor">
      <div className="playlist-editor-header">
        <h3>{playlist?.name || '播放列表'}</h3>
        <div className="playlist-editor-actions">
          <button className="btn-play-list" onClick={onPlay}>
            播放该列表
          </button>
          <button className="btn-add-video" onClick={handleAddVideo}>
            + 添加视频
          </button>
        </div>
      </div>

      <div className="video-list">
        {videos.length === 0 ? (
          <div className="empty-state">暂无视频，点击"添加视频"开始</div>
        ) : (
          videos.map((video, index) => (
            <div
              key={video.id}
              className="video-item"
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e)}
              onDrop={(e) => handleDrop(e, index)}
            >
              <div className="video-item-number">{index + 1}</div>
              <div className="video-item-drag-handle">⋮⋮</div>
              <div className="video-item-info">
                {editingVideoId === video.id ? (
                  <div className="video-item-edit-name">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(video.id);
                        if (e.key === 'Escape') handleCancelRename();
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="video-item-edit-actions">
                      <button onClick={() => handleSaveRename(video.id)}>✓</button>
                      <button onClick={handleCancelRename}>✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="video-item-name" onClick={() => handleStartRename(video)}>
                      {video.display_name || video.file_name}
                    </div>
                    <div className="video-item-meta">
                      大小: {(video.file_size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </>
                )}
              </div>
              <div className="video-item-actions">
                <button
                  className={`label-btn ${video.label === 'action' ? 'action' : 'standby'}`}
                  onClick={() => handleToggleLabel(video)}
                  title={video.label === 'action' ? '动作视频' : '待机视频'}
                >
                  {video.label === 'action' ? '动作' : '待机'}
                </button>
                <button
                  className="delete-btn"
                  onClick={() => handleDeleteVideo(video.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PlaylistEditor;
