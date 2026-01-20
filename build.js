/**
 * ===================================================
 * 构建脚本 (build.js)
 * ===================================================
 * 
 * 这个脚本用于生成最终的 ui.html 文件。
 * 
 * 为什么需要这个脚本？
 * Figma 插件的 ui.html 需要是一个独立的文件，
 * 不能引用外部资源（.js、.css、.wasm）。
 * 所以我们需要把所有内容内联到一个 HTML 文件中。
 * 
 * 使用方法：
 *   node build.js
 */

var fs = require('fs');
var path = require('path');

// 读取文件
function readFile(filePath) {
  return fs.readFileSync(path.join(__dirname, filePath), 'utf8');
}

function readBinaryFile(filePath) {
  return fs.readFileSync(path.join(__dirname, filePath));
}

// 获取 WASM 的 Base64 编码
console.log('📦 读取 WASM 文件...');
var wasmBase64 = readBinaryFile('ui/assets/vectortracer_bg.wasm').toString('base64');
console.log('   WASM 大小:', Math.round(wasmBase64.length / 1024), 'KB (base64)');

// 读取 Potrace WASM
console.log('📦 读取 Potrace WASM 文件...');
var potraceJsPath = path.join(__dirname, 'node_modules/esm-potrace-wasm/dist/index.js');
var potraceJsContent = '';
if (fs.existsSync(potraceJsPath)) {
  potraceJsContent = fs.readFileSync(potraceJsPath, 'utf8');
  // 去掉 export 语句
  potraceJsContent = potraceJsContent.replace(/export\s*\{[^}]+\};/g, '');
  // 注入全局变量
  potraceJsContent += '\n;window.PotraceWASM = { potrace: iA, init: DA };\n';
  console.log('   Potrace WASM 大小:', Math.round(potraceJsContent.length / 1024), 'KB');
} else {
  console.warn('⚠️ 未找到 Potrace WASM 文件!');
}

// 读取 JS 文件
console.log('📄 读取 JS 文件...');
var vtracerLoaderJs = readFile('ui/vtracer-loader.js');
var uiJs = readFile('ui/ui.js');

// CSS 样式
var cssContent = `
/* ===================================================
   Figma Raster to Vector - UI 样式
   =================================================== */

/* 
 * CSS 变量 - Figma 插件主题色
 * Figma 会自动注入这些变量，让插件适配深色/浅色模式
 */
:root {
  /* 主色调 */
  --figma-color-bg: var(--figma-color-bg, #2c2c2c);
  --figma-color-bg-secondary: var(--figma-color-bg-secondary, #383838);
  --figma-color-bg-tertiary: var(--figma-color-bg-tertiary, #444444);
  
  /* 文字颜色 */
  --figma-color-text: var(--figma-color-text, #ffffff);
  --figma-color-text-secondary: var(--figma-color-text-secondary, #b3b3b3);
  --figma-color-text-tertiary: var(--figma-color-text-tertiary, #808080);
  
  /* 边框颜色 */
  --figma-color-border: var(--figma-color-border, #484848);
  
  /* 强调色 */
  --figma-color-bg-brand: var(--figma-color-bg-brand, #0d99ff);
  --figma-color-bg-brand-hover: var(--figma-color-bg-brand-hover, #0a7fd4);
  
  /* 状态色 */
  --color-success: #1bc47d;
  --color-warning: #f5a623;
  --color-error: #f24822;
}

/* 基础重置 */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--figma-color-bg-tertiary);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--figma-color-text-tertiary);
}

/* 页面基础 */
html, body {
  height: 100%;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  line-height: 1.5;
  color: var(--figma-color-text);
  background: var(--figma-color-bg);
  overflow: hidden;
}

/* 主容器：采用 Flex 纵向布局，占满 100% 高度 */
.container {
  display: flex;
  flex-direction: column;
  height: 100vh; /* 关键：占满视口高度 */
  overflow: hidden; /* 防止整体滚动 */
}

/* 1. 头部：固定高度 */
.header {
  flex: 0 0 auto; /* 不缩放 */
  padding: 12px 16px;
  border-bottom: 1px solid var(--figma-color-border);
  background: var(--figma-color-bg-secondary);
  z-index: 10;
}

/* 2. 预览区域：固定高度或弹性 */
.preview-section {
  flex: 0 0 180px; /* 固定高度，避免被压缩 */
  display: flex;
  flex-direction: column;
  background: var(--figma-color-bg-tertiary);
  border-bottom: 1px solid var(--figma-color-border);
  position: relative;
  overflow: hidden;
  
  /* 棋盘格背景 */
  background-image: 
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%), 
    linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%), 
    linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  background-color: #f5f5f5;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .preview-section {
    background-image: 
      linear-gradient(45deg, #444 25%, transparent 25%), 
      linear-gradient(-45deg, #444 25%, transparent 25%), 
      linear-gradient(45deg, transparent 75%, #444 75%), 
      linear-gradient(-45deg, transparent 75%, #444 75%);
    background-color: #333;
  }
}

#preview-container {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
}

.svg-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
}

.svg-preview svg {
  width: 100%;
  height: 100%;
  display: block;
}

.empty-preview {
  color: var(--figma-color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  background: var(--figma-color-bg);
  padding: 12px 24px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

#loading-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 11px;
  display: none;
  z-index: 10;
}

/* 3. 参数面板：占据剩余空间，内部滚动 */
.params-section {
  flex: 1; /* 占据剩余所有空间 */
  overflow-y: auto; /* 内容多了显示滚动条 */
  padding: 16px;
  background: var(--figma-color-bg);
}

.param-group {
  margin-bottom: 20px;
  background: var(--figma-color-bg-secondary);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--figma-color-border);
}

.param-group:last-child {
  margin-bottom: 0;
}

.param-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--figma-color-text-secondary);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.param-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  min-height: 24px;
}

.param-row:last-child {
  margin-bottom: 0;
}

.param-label {
  flex: 0 0 70px;
  font-size: 12px;
  color: var(--figma-color-text);
  font-weight: 500;
}

.param-control {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.param-value {
  width: 36px;
  text-align: right;
  font-size: 11px;
  color: var(--figma-color-text-secondary);
  font-family: 'Roboto Mono', monospace;
}

/* ===== 滑块样式重写 (Pro Max 级) ===== */
input[type="range"] {
  -webkit-appearance: none; /* 清除默认样式 */
  appearance: none;
  width: 100%;
  height: 4px;
  background: transparent; /* 轨道背景由 JS 控制 (linear-gradient) */
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  position: relative;
  margin: 10px 0; /* 增加点击区域 */
}

/* 滑块轨道 (Track) */
input[type="range"]::-webkit-slider-runnable-track {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: transparent; /* 重要：透明，不要遮挡 input 的背景 */
  cursor: pointer;
}

/* 滑块拇指 (Thumb) - 拖动部分 */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #ffffff;
  border: 0.5px solid rgba(0,0,0,0.1); /* 轻微描边 */
  border-radius: 50%;
  cursor: pointer;
  margin-top: -6px; /* (height/2) - (track_height/2) = 16/2 - 4/2 = 6 */
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 深色模式下拇指 */
@media (prefers-color-scheme: dark) {
  input[type="range"]::-webkit-slider-thumb {
    background: #444;
    border-color: #666;
    box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  }
}

input[type="range"]:focus::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px rgba(24, 160, 251, 0.3);
}

input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

/* 选中进度条 (Figma 风格不太好做纯 CSS 进度，用 JS 更新背景更完美，这里先做基础可见性) */

/* 下拉框样式 */
select {
  flex: 1;
  padding: 8px;
  font-size: 12px;
  background: var(--figma-color-bg);
  color: var(--figma-color-text);
  border: 1px solid var(--figma-color-border);
  border-radius: 6px;
  cursor: pointer;
  outline: none;
}

select:hover {
  border-color: var(--figma-color-text-tertiary);
}

select:focus {
  border-color: var(--figma-color-bg-brand);
  box-shadow: 0 0 0 1px var(--figma-color-bg-brand);
}

/* 4. 底部：固定高度 */
.footer {
  flex: 0 0 auto; /* 不缩放 */
  padding: 16px;
  background: var(--figma-color-bg);
  border-top: 1px solid var(--figma-color-border);
  box-shadow: 0 -4px 12px rgba(0,0,0,0.05);
  z-index: 20;
}

.progress-wrapper {
  height: 4px;
  background: var(--figma-color-bg-tertiary);
  border-radius: 2px;
  margin-bottom: 12px;
  overflow: hidden;
  display: none;
}

#progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--figma-color-bg-brand), #06b6d4);
  width: 0%;
  transition: width 0.3s ease;
  border-radius: 2px;
}

.button-row {
  display: flex;
  gap: 12px; /* 增加按钮间距 */
}

button {
  flex: 1;
  padding: 12px 20px; /* 增加内边距 */
  font-size: 13px;    /* 增大字体 */
  font-weight: 600;
  border: none;
  border-radius: 8px; /* 更大的圆角 */
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
}

#convert-btn {
  background: linear-gradient(135deg, #7c3aed, #06b6d4);
  color: white;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
}

#convert-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(124, 58, 237, 0.4);
}

#convert-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(124, 58, 237, 0.2);
}

#convert-btn:disabled {
  background: var(--figma-color-bg-tertiary);
  color: var(--figma-color-text-tertiary);
  box-shadow: none;
  opacity: 0.7;
  cursor: not-allowed;
}

#close-btn {
  background: transparent;
  color: var(--figma-color-text-secondary);
  border: 1px solid var(--figma-color-border);
  flex: 0 0 auto;
  width: auto;
  min-width: 80px;
}

#close-btn:hover {
  border-color: var(--figma-color-text-secondary);
  color: var(--figma-color-text);
  background: var(--figma-color-bg-secondary);
}

/* 状态消息 */
#status-message {
  margin-top: 8px;
  font-size: 10px;
  color: var(--figma-color-text-tertiary);
  text-align: center;
  min-height: 14px;
}

#status-message.error {
  color: var(--color-error);
}

#status-message.warning {
  color: var(--color-warning);
}

/* ===== 加载动画 ===== */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loading {
  animation: pulse 1.5s ease-in-out infinite;
}

/* ===== 响应式 ===== */
@media (max-height: 400px) {
  .preview-section {
    min-height: 80px;
  }
  
  .params-section {
    max-height: 160px;
  }
}
`;

// HTML 模板
var htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raster to Vector</title>
  <style>
${cssContent}
  </style>
</head>
<body>
  <div class="container">
    <!-- 头部：选区信息 -->
    <div class="header">
      <h1>Raster to Vector</h1>
      <div id="selection-info">
        <span class="no-selection">未选中任何节点</span>
      </div>
    </div>
    
    <!-- 预览区域 -->
    <div class="preview-section">
      <div id="preview-container">
        <div class="empty-preview">选择一个节点开始</div>
      </div>
      <div id="loading-indicator">正在处理...</div>
    </div>
    
    <!-- 参数面板 -->
    <div class="params-section">
      <!-- 预设 -->
      <div class="param-group">
        <div class="param-group-title">预设</div>
        <div class="param-row">
          <label class="param-label">模式</label>
          <div class="param-control">
            <select id="preset-select">
              <option value="logo_bw">Logo (黑白)</option>
              <option value="icon_clean">Icon (干净)</option>
              <option value="detailed">详细</option>
            </select>
          </div>
        </div>
      </div>
      
      <!-- 黑白参数 -->
      <div class="param-group">
        <div class="param-group-title">黑白转换</div>
        <div class="param-row">
          <label class="param-label">阈值</label>
          <div class="param-control">
            <input type="range" id="threshold-slider" value="128">
            <span class="param-value" id="threshold-value">128</span>
          </div>
        </div>
        <div class="param-row">
          <label class="param-label">反转</label>
          <div class="param-control">
            <label class="checkbox-wrapper">
              <input type="checkbox" id="invert-check">
              <span>反转黑白</span>
            </label>
          </div>
        </div>
      </div>
      
      <!-- 矢量化参数 -->
      <div class="param-group">
        <div class="param-group-title">矢量化</div>
        <div class="param-row">
          <label class="param-label">去噪</label>
          <div class="param-control">
            <input type="range" id="filterSpeckle-slider" value="4">
            <span class="param-value" id="filterSpeckle-value">4</span>
          </div>
        </div>
        <div class="param-row">
          <label class="param-label">角点</label>
          <div class="param-control">
            <input type="range" id="cornerThreshold-slider" value="60">
            <span class="param-value" id="cornerThreshold-value">60</span>
          </div>
        </div>
        <div class="param-row">
          <label class="param-label">曲线拟合</label>
          <div class="param-control">
            <select id="curveFitting-select">
              <option value="spline">样条曲线</option>
              <option value="polygon">多边形</option>
              <option value="none">像素</option>
            </select>
          </div>
        </div>
        <div class="param-row">
          <label class="param-label">精度</label>
          <div class="param-control">
            <input type="range" id="pathPrecision-slider" value="8">
            <span class="param-value" id="pathPrecision-value">8</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 底部：按钮 -->
    <div class="footer">
      <div class="progress-wrapper">
        <div id="progress-bar"></div>
      </div>
      <div class="button-row">
        <button id="convert-btn" disabled>转换为矢量</button>
        <button id="close-btn">关闭</button>
      </div>
      <div id="status-message"></div>
    </div>
  </div>
  
  <!-- VTracer WASM 加载器 -->
  <script>
${vtracerLoaderJs}
  </script>

  <!-- Potrace WASM -->
  <script>
${potraceJsContent}
  </script>
  
  <!-- WASM Base64 数据 -->
  <script>
    var WASM_BASE64 = "${wasmBase64}";
  </script>
  
  <!-- UI 主逻辑 -->
  <script>
${uiJs}
  </script>
  
  <!-- 初始化 WASM -->
  <script>
    // 加载 VTracer WASM
    console.log('[UI] 开始加载 VTracer WASM...');
    
    loadVTracerFromBase64(WASM_BASE64).then(function() {
      console.log('[UI] VTracer 加载成功!');
      
      // 启用转换按钮
      var convertBtn = document.getElementById('convert-btn');
      if (convertBtn && AppState && AppState.selection.count > 0) {
        convertBtn.disabled = false;
      }
      
      // 显示状态
      var statusEl = document.getElementById('status-message');
      if (statusEl) {
        statusEl.textContent = '✓ 引擎已就绪';
      }
    }).catch(function(error) {
      console.error('[UI] VTracer 加载失败:', error);
      
      var statusEl = document.getElementById('status-message');
      if (statusEl) {
        statusEl.textContent = '⚠️ 引擎加载失败: ' + (error.message || error);
        statusEl.className = 'status-message error';
      }
    });
  </script>
</body>
</html>
`;

// 写入文件
console.log('💾 生成 ui.html...');
fs.writeFileSync(path.join(__dirname, 'ui.html'), htmlContent, 'utf8');

console.log('');
console.log('✅ 构建完成!');
console.log('');
console.log('生成的文件:');
console.log('  - ui.html (' + Math.round(htmlContent.length / 1024) + ' KB)');
console.log('');
console.log('📁 项目结构:');
console.log('  figma-raster-to-vector/');
console.log('  ├── manifest.json');
console.log('  ├── code.js');
console.log('  └── ui.html');
console.log('');
console.log('🚀 在 Figma 中导入插件:');
console.log('  1. 打开 Figma Desktop');
console.log('  2. 菜单: Plugins → Development → Import plugin from manifest...');
console.log('  3. 选择 manifest.json 文件');
