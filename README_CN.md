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

## 📦 快速开始 (下载即用)

本插件已预先构建，无需任何配置即可运行。

1. **获取代码**：
   ```bash
   git clone https://github.com/Left2y/figma-raster-to-vector.git
   ```
   *(或者在 GitHub 页面点击 "Code" -> "Download ZIP" 并解压)*

2. **导入到 Figma**：
   - 打开 Figma 桌面版。
   - 菜单：**Plugins** > **Development** > **Import plugin from manifest...**
   - 选择文件夹中的 `manifest.json`。

🎉 **就这么简单！** 您现在可以使用插件了。

---

## 💻 开发指南 (可选)

如果您想要修改源码或贡献代码，请按以下步骤进行构建：

1. **安装依赖**：
   ```bash
   npm install
   ```

2. **开发与构建**：
   修改 `ui/` 目录下的文件后，运行以下命令重新生成 `ui.html`：
   ```bash
   node build.js
   ```

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

### Potrace 驱动架构 (SVGcode 风格)

本插件采用与 [SVGcode](https://github.com/tomayac/SVGcode) (Google Chrome Labs) 相同的核心设计理念：**以 Potrace 为主引擎**。

#### 核心算法流程

**黑白模式 (Monochrome)**:
1. 图像预处理（阈值二值化）
2. 调用 Potrace WASM 生成 SVG 路径

**彩色模式 (Color)** - SVGcode 风格色彩分离:
1. **色彩量化 (Posterization)**: 将颜色数从数百万降到几十种（由 Color Steps 参数控制）
2. **颜色提取 (Extract Colors)**: 遍历每个像素，按 RGBA 值分组
3. **遮罩生成**: 为每种颜色创建独立的黑白遮罩
4. **批量 Potrace**: 对每个遮罩调用 Potrace 生成路径
5. **颜色填充**: 将路径填充色替换为原始颜色
6. **路径合并**: 合并所有路径生成最终 SVG

#### 引擎选择

| 引擎 | 模式 | 特点 |
|------|------|------|
| **Potrace** (主力) | 黑白/彩色 | 极其稳定，永不崩溃，曲线平滑 |
| **VTracer** (备选) | 黑白 | 支持 Spline 曲线，但可能遇到 "Parallel Lines" 崩溃 |

当选择 VTracer 时，插件会自动检测崩溃并智能降级到 Potrace。

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
