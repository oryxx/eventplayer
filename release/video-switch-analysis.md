# 视频切换闪烁问题分析与解决方案

## 问题现象
- ✅ **循环播放不闪烁**：待机视频循环播放时（`currentTime = 0` + `play()`）非常流畅
- ❌ **切换视频闪烁**：点击"下一个"切换视频时（改变 `src`）会出现闪烁

## 核心差异分析

### 1. 循环播放（不闪烁）的实现
```javascript
// 待机视频循环播放
videoElement.currentTime = 0;  // 只重置播放位置
videoElement.play();           // 继续播放
```
**特点：**
- ✅ 不改变 `src` 属性
- ✅ 视频元素保持已加载状态
- ✅ 解码器和渲染器保持活跃
- ✅ 只是重置播放位置，没有资源卸载/重载过程
- ✅ **零延迟，零闪烁**

### 2. 切换视频（闪烁）的实现
```javascript
// 切换视频
videoElement.src = newVideoSrc;  // 改变 src 触发重新加载
videoElement.play();
```
**特点：**
- ❌ 改变 `src` 会触发完整的重新加载流程：
  1. 停止当前播放
  2. 卸载当前视频资源（解码器、缓冲区）
  3. 清除渲染表面（可能显示黑色/透明）
  4. 加载新视频文件
  5. 初始化解码器
  6. 开始解码和渲染
- ❌ 在步骤 3-5 之间，视频元素处于"空白"状态
- ❌ **这就是闪烁的根本原因**

## 闪烁的根本原因

当改变 `video.src` 时，浏览器会：
1. **立即停止**当前视频播放
2. **清空渲染缓冲区**（显示黑色或透明）
3. **卸载解码器资源**
4. **加载新视频文件**
5. **重新初始化解码器**
6. **等待第一帧解码完成**
7. **开始渲染新视频**

在步骤 2-6 之间，视频元素没有有效帧可显示，导致：
- 背景色（黑色）暴露
- 或者视频元素短暂消失
- 或者出现"空白帧"

这就是**闪烁**的视觉表现。

## 解决方案设计

### 方案 1：双缓冲无缝切换（推荐）

**核心思想：** 使用两个 video 元素，一个显示当前视频，一个预加载下一个视频。

**实现步骤：**
1. 主 video 元素（`videoRef`）：显示当前播放的视频
2. 预加载 video 元素（`nextVideoRef`）：在后台加载下一个视频
3. 切换时：
   - 等待预加载视频准备好（`readyState >= 4`）
   - 使用 CSS `opacity` 或 `z-index` 切换显示
   - 或者直接交换两个元素的角色

**优点：**
- ✅ 下一个视频已预加载，切换时无需等待加载
- ✅ 可以做到真正的无缝切换
- ✅ 用户体验最佳

**缺点：**
- ⚠️ 需要额外的内存（两个视频元素）
- ⚠️ 需要管理预加载逻辑

### 方案 2：预加载 + 延迟切换

**核心思想：** 在切换前预加载下一个视频，等待加载完成后再切换。

**实现步骤：**
1. 检测到需要切换时，先创建隐藏的 video 元素加载下一个视频
2. 监听 `canplaythrough` 事件
3. 等待加载完成后，再切换主 video 的 `src`
4. 由于下一个视频已经在内存中，切换会更快

**优点：**
- ✅ 实现相对简单
- ✅ 减少切换时的加载时间

**缺点：**
- ⚠️ 仍然会触发 `src` 改变，可能仍有轻微闪烁
- ⚠️ 需要额外的预加载逻辑

### 方案 3：Canvas 渲染（高级方案）

**核心思想：** 使用 Canvas 作为渲染目标，视频作为源，切换时只改变视频源。

**实现步骤：**
1. 创建 Canvas 元素作为显示目标
2. 使用 `drawImage()` 将 video 帧绘制到 Canvas
3. 切换视频时，只改变 video 源，Canvas 保持连续渲染
4. 使用 `requestAnimationFrame` 持续绘制

**优点：**
- ✅ 完全控制渲染流程
- ✅ 可以实现各种过渡效果

**缺点：**
- ⚠️ 实现复杂
- ⚠️ 性能开销较大
- ⚠️ 可能影响视频质量

## 推荐方案：双缓冲无缝切换

### 实现细节

#### 1. 视频元素结构
```jsx
<div className="video-container">
  {/* 主视频：当前显示 */}
  <video ref={videoRef} className="video-element active" />
  
  {/* 预加载视频：隐藏，用于预加载下一个 */}
  <video ref={nextVideoRef} className="video-element preload" />
</div>
```

#### 2. CSS 样式
```css
.video-container {
  position: relative;
}

.video-element {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
}

.video-element.active {
  z-index: 2;
  opacity: 1;
}

.video-element.preload {
  z-index: 1;
  opacity: 0;
  pointer-events: none;
}
```

#### 3. 预加载逻辑
- **动作视频**：播放时立即预加载下一个视频
- **待机视频**：点击"下一个"时开始预加载下一个视频

#### 4. 切换逻辑
```javascript
// 当需要切换到下一个视频时
if (nextVideoRef.current.readyState >= 4) {
  // 预加载视频已准备好
  // 1. 交换两个元素的角色
  const temp = videoRef.current.src;
  videoRef.current.src = nextVideoRef.current.src;
  nextVideoRef.current.src = temp;
  
  // 2. 或者直接切换显示（如果使用 opacity）
  // videoRef.current.style.opacity = 0;
  // nextVideoRef.current.style.opacity = 1;
  // 然后交换 ref
  
  // 3. 重置播放位置并播放
  videoRef.current.currentTime = 0;
  videoRef.current.play();
}
```

#### 5. 关键优化点
- **预加载时机**：在视频播放过程中提前预加载
- **切换时机**：等待预加载完成后再切换
- **无缝过渡**：使用 CSS 过渡或直接交换，避免 `src` 改变导致的重新加载

## 实施计划

1. **阶段 1**：实现双 video 元素结构
2. **阶段 2**：实现预加载逻辑
3. **阶段 3**：实现无缝切换逻辑
4. **阶段 4**：优化和测试

## 预期效果

- ✅ 视频切换时无闪烁
- ✅ 切换延迟最小化（< 50ms）
- ✅ 用户体验接近循环播放的流畅度

