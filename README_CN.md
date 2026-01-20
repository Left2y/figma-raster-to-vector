# ⚡️ Figma 位图转矢量 (双引擎 WASM 版)

[🇺🇸 English](README.md) | [🇨🇳 中文文档](README_CN.md)

<div align="center">
  <h3>Figma 极致 "No-Build" 矢量化插件</h3>
  <p>本地运行 • 双引擎 (VTracer + Potrace) • 智能重试 • 零配置</p>
</div>

---

**Figma Raster to Vector** 是一款高性能的 Figma 插件，可直接在 Figma 中将位图（PNG、JPG）转换为可编辑的 SVG 矢量图。它采用独特的 **双引擎架构**，结合了 **VTracer**（擅长彩色扫描）和 **Potrace**（黑白转换的王者），在确保 100% 稳定性的同时提供最佳的转换质量。

## ✨ 核心特性

- **🚀 双 WASM 引擎**：
  - **主力引擎**：`VTracer` (Rust/WASM)，专为高质量彩色堆叠矢量化设计。
  - **兜底引擎**：`Potrace` (C++/WASM)，极其稳健的黑白轮廓追踪引擎，彻底解决崩溃问题。
- **🛡️ 智能重试策略**：自动检测 WASM Panic（如 VTracer 的 "Parallel Lines" 平行线错误），并自动降级参数或无缝切换至 Potrace 引擎，确保必定输出结果。
- **🛠️ No-Build 架构**：无需 Webpack，无需 Vite，也没有复杂的构建步骤。只需一个简单的 Node.js 脚本即可将所有资源打包注入到单一 HTML 文件中。
- **🔒 隐私优先**：所有处理均通过 WebAssembly 在本地浏览器/Figma 中完成。任何图片数据都不会上传到服务器。
- **🎨 现代化 UI**：拥有实时预览、深色模式支持和交互式参数控制的精美界面。

## 📦 安装说明

本插件采用 "No-Build" 理念，源码通过简单的资源打包后即可直接运行。

### 前置要求
- Node.js (用于打包资源)

### 步骤
1. **克隆仓库**：
   ```bash
   git clone https://github.com/Left2y/figma-raster-to-vector.git
   cd figma-raster-to-vector
   ```

2. **安装依赖**：
   ```bash
   npm install
   ```

3. **构建单文件 UI**：
   此步骤会将 WASM 引擎、CSS 和 JS 内联到一个 Figma 所需的 `ui.html` 文件中。
   ```bash
   node build.js
   ```

4. **导入到 Figma**：
   - 打开 Figma 桌面版应用。
   - 菜单选择：**Plugins** > **Development** > **Import plugin from manifest...**
   - 选择本目录下的 `manifest.json` 文件。

## 🎮 使用指南

1. 在 Figma 中选中一张图片。
2. 运行插件 (**Raster to Vector**)。
3. **预览**：即时查看矢量化结果。
4. **调整**：
   - **颜色模式**：选择彩色（堆叠/拼接）或黑白模式。
   - **引擎**：插件会自动调度，但对于复杂的黑白几何 Logo，它会智能切换到 Potrace 以获得更完美的曲线。
   - **参数**：微调 `去噪 (Speckle)`、`角点阈值 (Corner)` 等参数。
5. **转换**：点击 "Place Vector" 将 SVG 放置到画布中。

## 🛠️ 技术架构

### 混合动力引擎逻辑 (Hybrid Engine)
本插件实施了一套精密的 **3级重试机制 (3-Level Retry)** 以确保持续交付：

1.  **Level 0 (标准模式)**：优先尝试 `VTracer` (Spline 样条模式)，追求最平滑的曲线质量。
2.  **Level 1 (扰动修复)**：如果 VTracer 崩溃，尝试对输入图像施加微小的噪点扰动 (`perturbation`) 以避开几何奇异点。
3.  **Level 2 (引擎切换)**：如果 VTracer 依然无法处理，系统将无缝**热切换**至 `Potrace` 引擎。Potrace 专为二值图像设计，能完美处理平行线和复杂几何图形，绝不崩溃。

### 文件结构
```
├── build.js            # 构建脚本 (内联 WASM/CSS/JS)
├── code.js             # Figma Sandbox 逻辑 (主线程)
├── manifest.json       # 插件清单配置
├── ui.html             # 生成的插件 UI (请勿直接编辑)
└── ui/
    ├── ui.js           # UI 逻辑与状态管理
    ├── ui.css          # 样式表
    ├── vtracer-loader.js # VTracer WASM 胶水代码
    └── assets/         # WASM 二进制文件
```

## 📝 许可证

MIT License.

---
*Built with ❤️ for the design community.*
