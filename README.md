# ⚡️ Figma Raster to Vector (Dual Engine WASM)

<div align="center">
  <h3>The Ultimate "No-Build" Image Vectorizer for Figma</h3>
  <p>Local Execution • Dual Engine (VTracer + Potrace) • Smart Retry • Zero Config</p>
</div>

---

**Figma Raster to Vector** is a high-performance Figma plugin that converts raster images (PNG, JPG) into editable SVG vectors directly within Figma. It features a unique **Dual Engine Architecture** that combines the best of **VTracer** (for color scans) and **Potrace** (for precision black & white verification), ensuring 100% stability and optimal quality.

## ✨ Key Features

- **🚀 Dual WASM Engines**:
  - **Primary**: `VTracer` (Rust/WASM) for high-quality stacked color vectorization.
  - **Fallback**: `Potrace` (C++/WASM) for robust, panic-proof black & white tracing.
- **🛡️ Smart Retry Strategy**: Automatically detects WASM panics (e.g., "Parallel Lines" error) and seamlessly switches to the Potrace engine or adjusts parameters to guarantee a result.
- **🛠️ No-Build Architecture**: No Webpack, no Vite, no complex build steps. Just pure HTML/JS injected via a simple Node.js script.
- **🔒 Privacy First**: All processing happens locally in your browser/Figma via WebAssembly. No data is ever uploaded to a server.
- **🎨 Premium UI**: Features a modern, responsive UI with real-time previews, dark mode support, and interactive controls.

## 📦 Installation

This plugin utilizes a "No-Build" approach, meaning the source code is directly runnable after a simple asset bundling step.

### Prerequisites
- Node.js (for bundling assets)

### Steps
1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/figma-raster-to-vector.git
   cd figma-raster-to-vector
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the single-file UI**:
   This step bundles the WASM engines, CSS, and JS into a single `ui.html` file required by Figma.
   ```bash
   node build.js
   ```

4. **Import to Figma**:
   - Open Figma Desktop App.
   - Go to **Plugins** > **Development** > **Import plugin from manifest...**
   - Select the `manifest.json` file in this directory.

## 🎮 How to Use

1. Select an image in Figma.
2. Run the plugin (**Raster to Vector**).
3. **Preview**: Instantly see the vectorized result.
4. **Adjust**:
   - **Color Mode**: Choose between Color (Stacked/Stacked) or Black & White.
   - **Engine**: The plugin handles this automatically, but for complex B&W logos, it utilizes Potrace for superior curves.
   - **Settings**: Fine-tune specific parameters like `Filter Speckle`, `Corner Threshold`, etc.
5. **Convert**: Click "Place Vector" to add the SVG to your canvas.

## 🛠️ Technical Architecture

### Hybrid Engine Logic
The plugin implements a sophisticated 3-Level Retry mechanism to ensure stability:

1.  **Level 0 (Standard)**: Attempts vectorization using `VTracer` (Spline mode) for maximum smoothness.
2.  **Level 1 (Perturbation)**: If VTracer panics, it retries with slight input noise (`perturbation`) to bypass geometric singularities.
3.  **Level 2 (Engine Switch)**: If VTracer fails repeatedly, it seamlessly hot-swaps to the **Potrace** engine to guarantee a valid, high-quality output (especially for B&W logos).

### File Structure
```
├── build.js            # Bundler script (inlines WASM/CSS/JS)
├── code.js             # Figma Sandbox logic (Main thread)
├── manifest.json       # Plugin configuration
├── ui.html             # Generated plugin UI (Do not edit directly)
└── ui/
    ├── ui.js           # UI logic & State management
    ├── ui.css          # Styles
    ├── vtracer-loader.js # VTracer WASM glue code
    └── assets/         # WASM binaries
```

## 📝 License

MIT License.

---
*Built with ❤️ for the design community.*
