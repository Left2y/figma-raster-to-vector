/**
 * ===================================================
 * UI 主逻辑文件 (ui/ui.js)
 * ===================================================
 * 
 * 这个文件负责：
 * 1. 与 Sandbox (code.js) 进行消息通信
 * 2. 处理用户界面交互
 * 3. 调用 VTracer 进行矢量化
 * 4. 显示预览效果
 */

// ============================================
// 一、全局状态
// ============================================

/**
 * 应用状态对象
 * 集中管理所有状态，便于调试和维护
 */
var AppState = {
    // 选区信息
    selection: {
        count: 0,
        nodes: []
    },

    // 当前参数
    params: {
        preset: 'logo_bw',          // 预设模式
        threshold: 128,              // 黑白阈值 (0-255)
        invert: false,               // 是否反转
        filterSpeckle: 4,            // 去噪点 (0-64) - Spline 模式下不需要那么高
        cornerThreshold: 60,         // 角点阈值 (0-180)
        curveFitting: 'spline',      // 曲线拟合方式: pixel, polygon, spline - Spline 最平滑
        pathPrecision: 8             // 路径精度 (1-10)
    },

    // 预览状态
    preview: {
        requestId: null,             // 当前预览请求 ID
        debounceTimer: null,         // 防抖定时器
        isProcessing: false          // 是否正在处理
    },

    // 转换状态
    convert: {
        requestId: null,
        isConverting: false,
        current: 0,
        total: 0
    }
};

/**
 * 预设配置
 * 不同的预设对应不同的参数组合
 */
var PRESETS = {
    logo_bw: {
        name: 'Logo (黑白)',
        description: '适合简洁的标志和图标',
        params: {
            threshold: 128,
            invert: false,
            filterSpeckle: 4,
            cornerThreshold: 60,
            curveFitting: 'spline',
            pathPrecision: 8
        }
    },
    icon_clean: {
        name: 'Icon (干净)',
        description: '适合图标，减少细节',
        params: {
            threshold: 140,
            invert: false,
            filterSpeckle: 10,
            cornerThreshold: 90,
            curveFitting: 'spline',
            pathPrecision: 6
        }
    },
    detailed: {
        name: '详细',
        description: '保留更多细节',
        params: {
            threshold: 128,
            invert: false,
            filterSpeckle: 2,
            cornerThreshold: 30,
            curveFitting: 'spline',
            pathPrecision: 10
        }
    }
};

// ============================================
// 二、消息通信
// ============================================

/**
 * 发送消息给 Sandbox
 * 
 * 在 Figma 插件中，UI 和 Sandbox 通过 postMessage 通信
 * UI 使用 parent.postMessage()，消息会被包装在 pluginMessage 中
 * 
 * @param {object} message - 要发送的消息对象
 */
function sendToSandbox(message) {
    parent.postMessage({ pluginMessage: message }, '*');
}

/**
 * 生成唯一请求 ID
 * 用于匹配请求和响应，处理并发和取消
 */
function generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 监听来自 Sandbox 的消息
 * 所有从 code.js 发来的消息都会在这里处理
 */
window.onmessage = function (event) {
    var msg = event.data.pluginMessage;
    if (!msg) return;

    console.log('[UI] 收到消息:', msg.type);

    switch (msg.type) {
        // ==== 初始化消息 ====
        case 'INIT':
            handleInit(msg);
            break;

        // ==== 选区更新 ====
        case 'SELECTION_UPDATE':
            handleSelectionUpdate(msg);
            break;

        // ==== 矢量化请求（收到像素数据） ====
        case 'TRACE_REQUEST':
            handleTraceRequest(msg);
            break;

        // ==== 错误消息 ====
        case 'TRACE_ERROR':
            handleTraceError(msg);
            break;

        // ==== 批处理消息 ====
        case 'BATCH_START':
            handleBatchStart(msg);
            break;

        case 'BATCH_PROGRESS':
            handleBatchProgress(msg);
            break;

        case 'BATCH_COMPLETE':
            handleBatchComplete(msg);
            break;

        // ==== 转换成功 ====
        case 'CONVERT_SUCCESS':
            handleConvertSuccess(msg);
            break;

        // ==== 尺寸警告 ====
        case 'SIZE_WARNING':
            handleSizeWarning(msg);
            break;
    }
};

// ============================================
// 三、消息处理函数
// ============================================

/**
 * 处理初始化消息
 */
function handleInit(msg) {
    console.log('[UI] 插件版本:', msg.pluginVersion);
    console.log('[UI] 引擎:', msg.engine.primary);

    // 应用默认预设
    if (msg.defaults && msg.defaults.preset) {
        applyPreset(msg.defaults.preset);
    }
}

/**
 * 处理选区更新
 */
function handleSelectionUpdate(msg) {
    AppState.selection.count = msg.count;
    AppState.selection.nodes = msg.nodes || [];

    updateSelectionUI();

    // 如果有选中节点，自动请求预览
    if (msg.count > 0) {
        requestPreviewDebounced();
    } else {
        clearPreview();
    }
}

/**
 * 处理矢量化请求（收到像素数据）
 * 这是核心函数，在这里调用 VTracer 进行矢量化
 */
function handleTraceRequest(msg) {
    // 检查 VTracer 是否已加载
    if (!VTracer.ready) {
        showError('VTracer 引擎未加载');
        return;
    }

    // 检查请求 ID，忽略过期的请求
    if (msg.isPreview && msg.requestId !== AppState.preview.requestId) {
        console.log('[UI] 忽略过期的预览请求');
        return;
    }

    console.log('[UI] 开始矢量化, 尺寸:', msg.source.width, 'x', msg.source.height);

    // 把像素数据转换成 ImageData
    var bytes = new Uint8Array(msg.bytes);

    // 解码 PNG 并矢量化
    decodePngAndTrace(bytes, msg.source, msg.params, msg.isPreview, msg.requestId);
}

/**
 * 处理错误消息
 */
function handleTraceError(msg) {
    showError(msg.message);
    AppState.preview.isProcessing = false;
    AppState.convert.isConverting = false;
    updateUI();
}

/**
 * 处理批处理开始
 */
function handleBatchStart(msg) {
    AppState.convert.isConverting = true;
    AppState.convert.current = 0;
    AppState.convert.total = msg.total;
    updateProgressUI();
}

/**
 * 处理批处理进度
 */
function handleBatchProgress(msg) {
    AppState.convert.current = msg.current;
    AppState.convert.total = msg.total;
    updateProgressUI();
    showStatus('正在处理: ' + msg.nodeName + ' (' + msg.current + '/' + msg.total + ')');
}

/**
 * 处理批处理完成
 */
function handleBatchComplete(msg) {
    AppState.convert.isConverting = false;
    showStatus('✓ 转换完成!');
    updateUI();
}

/**
 * 处理转换成功
 */
function handleConvertSuccess(msg) {
    console.log('[UI] 节点创建成功:', msg.nodeName);
}

/**
 * 处理尺寸警告
 */
function handleSizeWarning(msg) {
    showWarning('图像过大 (' + msg.originalSize.w + 'x' + msg.originalSize.h +
        ')，已降采样到 ' + msg.scaledSize.w + 'x' + msg.scaledSize.h);
}

// ============================================
// 四、矢量化核心逻辑
// ============================================

/**
 * 解码 PNG 并进行矢量化
 * 
 * 流程：
 * 1. 把 PNG 字节创建成 Blob
 * 2. 用 Image 加载 Blob URL
 * 3. 绘制到 Canvas 获取 ImageData
 * 4. 调用 VTracer 进行矢量化
 * 
 * @param {Uint8Array} pngBytes - PNG 图像数据
 * @param {object} source - 源节点信息
 * @param {object} params - 矢量化参数
 * @param {boolean} isPreview - 是否是预览模式
 * @param {string} requestId - 请求 ID
 */
function decodePngAndTrace(pngBytes, source, params, isPreview, requestId) {
    // 创建 Blob 和 URL
    var blob = new Blob([pngBytes], { type: 'image/png' });
    var url = URL.createObjectURL(blob);

    // 创建 Image 对象
    var img = new Image();

    img.onload = function () {
        // 释放 Blob URL
        URL.revokeObjectURL(url);

        // 创建 Canvas
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // 获取 ImageData
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // 调用 VTracer
        // 注意：预处理现在移到了 traceImageData 内部，以便支持重试逻辑
        traceImageData(imageData, source, params, isPreview, requestId);
    };

    img.onerror = function () {
        URL.revokeObjectURL(url);
        showError('图像解码失败');
    };

    img.src = url;
}
/**
 * 预处理图像数据
 * 
 * 在黑白模式下，我们需要根据阈值把图像转换成纯黑白
 * 这会让 VTracer 的输出更干净
 * 
 * 重要：我们还需要添加轻微的边缘扰动，避免 VTracer 的 "parallel lines" panic
 * 这个 bug 发生在图像边缘有完美的平行线时
 * 
 * @param {ImageData} imageData - 图像数据（会被直接修改）
 * @param {object} params - 参数
 * @param {boolean} enablePerturbation - 是否启用边缘扰动 (用于防止 panic)
 */
function preprocessImageData(imageData, params, enablePerturbation) {
    var data = imageData.data;
    var width = imageData.width;
    var height = imageData.height;
    var threshold = params.threshold;
    var invert = params.invert;

    // 第一步：转换为灰度并应用阈值
    // 遍历所有像素
    // ImageData 的 data 是一个 Uint8ClampedArray，每 4 个值代表一个像素 (R, G, B, A)
    for (var i = 0; i < data.length; i += 4) {
        var r = data[i];
        var g = data[i + 1];
        var b = data[i + 2];
        var a = data[i + 3];

        // 计算灰度值（加权平均）
        var gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // 根据透明度处理
        // 如果像素透明，我们把它当作白色（背景）
        if (a < 128) {
            gray = 255;
        }

        // 应用阈值
        var bw = gray < threshold ? 0 : 255;

        // 应用反转
        if (invert) {
            bw = 255 - bw;
        }

        // 写回
        data[i] = bw;
        data[i + 1] = bw;
        data[i + 2] = bw;
        data[i + 3] = 255;  // 完全不透明
    }

    // 第二步：添加轻微的边缘扰动 (可选)
    // 这是为了避免 VTracer 的 "parallel lines" panic bug
    if (enablePerturbation) {
        addEdgePerturbation(data, width, height);
    }
}

/**
 * 添加边缘扰动
 * 
 * VTracer 的曲线拟合算法在遇到完美平行的线时会 panic。
 * 通过在边缘添加轻微的扰动，可以打破这种完美的平行性。
 * 
 * 这个函数会找到黑白交界处的像素，然后随机翻转其中极少数的像素
 * 
 * @param {Uint8ClampedArray} data - 图像数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 */
function addEdgePerturbation(data, width, height) {
    // 找到所有边缘像素（黑白交界处）
    var edgePixels = [];

    for (var y = 1; y < height - 1; y++) {
        for (var x = 1; x < width - 1; x++) {
            var idx = (y * width + x) * 4;
            var current = data[idx];

            // 检查周围是否有不同颜色的像素
            var neighbors = [
                data[((y - 1) * width + x) * 4],     // 上
                data[((y + 1) * width + x) * 4],     // 下
                data[(y * width + (x - 1)) * 4],     // 左
                data[(y * width + (x + 1)) * 4]      // 右
            ];

            var isEdge = false;
            for (var n = 0; n < neighbors.length; n++) {
                if (neighbors[n] !== current) {
                    isEdge = true;
                    break;
                }
            }

            if (isEdge) {
                edgePixels.push(idx);
            }
        }
    }

    // 如果边缘像素太少或太多，跳过扰动
    if (edgePixels.length < 10 || edgePixels.length > width * height * 0.5) {
        return;
    }

    // 随机扰动约 1% 的边缘像素
    var perturbCount = Math.max(1, Math.floor(edgePixels.length * 0.01));

    // 使用简单的伪随机数（基于像素位置）
    for (var p = 0; p < perturbCount; p++) {
        // 选择一个随机的边缘像素
        var randomIdx = Math.floor(Math.random() * edgePixels.length);
        var pixelIdx = edgePixels[randomIdx];

        // 翻转这个像素的颜色
        var newColor = data[pixelIdx] === 0 ? 255 : 0;
        data[pixelIdx] = newColor;
        data[pixelIdx + 1] = newColor;
        data[pixelIdx + 2] = newColor;
    }
}

/**
 * 检查图像是否有足够的内容来矢量化
 * 
 * 这个函数检测图像是否太简单（纯色、几乎纯色等），
 * 这些情况可能导致 VTracer 的平行线 panic 错误
 * 
 * @param {ImageData} imageData - 预处理后的图像数据
 * @returns {object} - { valid: boolean, blackPixels: number, whitePixels: number, ratio: number }
 */
function checkImageContent(imageData) {
    var data = imageData.data;
    var blackPixels = 0;
    var whitePixels = 0;
    var totalPixels = data.length / 4;

    // 统计黑白像素数量
    for (var i = 0; i < data.length; i += 4) {
        if (data[i] === 0) {
            blackPixels++;
        } else {
            whitePixels++;
        }
    }

    // 计算黑色像素占比
    var blackRatio = blackPixels / totalPixels;

    // 如果图像几乎全白或几乎全黑，可能会导致问题
    var valid = blackRatio > 0.001 && blackRatio < 0.999;

    return {
        valid: valid,
        blackPixels: blackPixels,
        whitePixels: whitePixels,
        ratio: blackRatio,
        message: !valid ?
            (blackRatio <= 0.001 ? '图像几乎全白，没有可矢量化的内容' : '图像几乎全黑，尝试调整阈值或反转')
            : null
    };
}

/**
 * 使用 VTracer 进行矢量化
 * 
 * @param {ImageData} imageData - 预处理后的图像数据
 * @param {object} source - 源节点信息
 * @param {object} params - 参数
 * @param {boolean} isPreview - 是否是预览模式
 * @param {string} requestId - 请求 ID
 */
/**
 * 使用 VTracer 进行矢量化 (支持智能重试)
 * 
 * @param {ImageData} originalImageData - 原始图像数据 (未经预处理)
 * @param {object} source - 源节点信息
 * @param {object} params - 参数
 * @param {boolean} isPreview - 是否是预览模式
 * @param {string} requestId - 请求 ID
 */
/**
 * 使用 VTracer 进行矢量化 (支持智能重试)
 * 
 * @param {ImageData} originalImageData - 原始图像数据 (未经预处理)
 * @param {object} source - 源节点信息
 * @param {object} params - 参数
 * @param {boolean} isPreview - 是否是预览模式
 * @param {string} requestId - 请求 ID
 */
function traceImageData(originalImageData, source, params, isPreview, requestId) {
    var startTime = Date.now();
    var isAborted = false;
    var converter = null;

    // 递归函数：尝试矢量化
    // retryCount: 0=首次尝试, 1=微调参数重试(保持Spline), 2=降级重试(Polygon)
    function attemptTrace(retryCount) {
        if (isAborted) return;

        console.log('[UI] 开始矢量化尝试, 重试次数:', retryCount);

        // 确定当前尝试的参数策略
        var effectiveMode = params.curveFitting || 'spline';
        var usePerturbation = false;
        var effectiveCornerThreshold = params.cornerThreshold || 60;

        if (retryCount === 1) {
            // Level 1: 尝试保持 Spline 模式，但开启扰动并微调参数
            // 目的是通过改变输入条件绕过 Panic 触发点，同时保留平滑度
            console.warn('[UI] 重试策略 Level 1: Spline + 边缘扰动 + 阈值微调');
            usePerturbation = true;
            effectiveCornerThreshold = effectiveCornerThreshold + 10; // 这里的微调可能避开特定几何条件
        } else if (retryCount >= 2) {
            // Level 2: 切换到 Potrace 引擎 (专门处理黑白 Logo panic 以及低质量问题)
            console.warn('[UI] 重试策略 Level 2: 切换到 Potrace 引擎');

            // 立即终止当前 VTracer 尝试并切换
            if (converter) { try { converter.free(); } catch (e) { } converter = null; }

            setTimeout(function () {
                traceWithPotrace(originalImageData, source, params, isPreview, requestId, startTime);
            }, 0);
            return;
        }

        // 1. 克隆数据 (因为预处理是 inplace 修改)
        var workingDataArray = new Uint8ClampedArray(originalImageData.data);
        var workingImageData;

        if (typeof ImageData !== 'undefined') {
            workingImageData = new ImageData(workingDataArray, originalImageData.width, originalImageData.height);
        } else {
            // Fallback for environments without ImageData constructor
            workingImageData = {
                width: originalImageData.width,
                height: originalImageData.height,
                data: workingDataArray
            };
        }

        // 2. 预处理 (根据重试状态决定是否扰动)
        preprocessImageData(workingImageData, params, usePerturbation);

        // 3. 检查图像内容 (仅在首次尝试且无扰动时检查，避免不必要的报错)
        if (retryCount === 0) {
            var contentCheck = checkImageContent(workingImageData);
            if (!contentCheck.valid) {
                console.warn('[UI] 图像内容检查失败:', contentCheck.message);
                showError(contentCheck.message);
                AppState.preview.isProcessing = false;
                updateUI();
                return;
            }
        }

        var converterOptions = {
            debug: false,
            mode: effectiveMode,
            cornerThreshold: effectiveCornerThreshold,
            lengthThreshold: 4,
            maxIterations: 10,
            spliceThreshold: 45,
            filterSpeckle: params.filterSpeckle || 4,
            pathPrecision: params.pathPrecision || 8
        };

        var renderOptions = {
            invert: false,
            pathFill: '#000000',
            backgroundColor: undefined,
            attributes: undefined,
            scale: 1
        };

        // 错误处理
        function handleError(error) {
            if (isAborted) return;

            // 清理旧资源
            if (converter) {
                try { converter.free(); } catch (e) { }
                converter = null;
            }

            var errorMsg = error.message || String(error);
            console.error('[UI] VTracer 错误 (Retry ' + retryCount + '):', errorMsg);

            // 智能重试逻辑
            // 如果遇到平行线 Panic 且还没达到最大重试次数
            if ((errorMsg.indexOf('parallel') !== -1 || errorMsg.indexOf('unreachable') !== -1) && retryCount < 2) {
                console.warn('[UI] 捕获 Panic，准备进入下一级重试...');

                // 立即进行下一级重试
                setTimeout(function () {
                    attemptTrace(retryCount + 1);
                }, 0);
                return;
            }

            isAborted = true;
            showError('矢量化失败: ' + errorMsg);

            AppState.preview.isProcessing = false;
            updateUI();
        }

        try {
            converter = new VTracer.BinaryImageConverter(
                workingImageData,
                converterOptions,
                renderOptions
            );

            converter.init();

            function tick() {
                if (isAborted) return;

                try {
                    var done = converter.tick();

                    if (!done) {
                        setTimeout(tick, 0);
                    } else {
                        var svgString = converter.getResult();

                        // 清理
                        if (converter) {
                            try { converter.free(); } catch (e) { }
                            converter = null;
                        }

                        var elapsedMs = Date.now() - startTime;
                        console.log('[UI] 矢量化完成, 耗时:', elapsedMs, 'ms');
                        handleTraceResult(svgString, source, isPreview, requestId, elapsedMs);
                    }
                } catch (error) {
                    handleError(error);
                }
            }

            tick();

        } catch (error) {
            handleError(error);
        }
    }

    // 首次尝试：重试次数 0
    attemptTrace(0);
}

/**
 * 处理矢量化结果
 * 
 * @param {string} svgString - 生成的 SVG 字符串
 * @param {object} source - 源节点信息
 * @param {boolean} isPreview - 是否是预览模式
 * @param {string} requestId - 请求 ID
 * @param {number} elapsedMs - 耗时
 */
function handleTraceResult(svgString, source, isPreview, requestId, elapsedMs) {
    // 验证 SVG
    if (!svgString || svgString.length < 20) {
        showError('生成的 SVG 无效');
        return;
    }

    // 修正 SVG 的 viewBox（确保与原始尺寸匹配）
    svgString = fixSvgViewBox(svgString, source.width, source.height);

    if (isPreview) {
        // 预览模式：在 UI 中显示 SVG
        displayPreview(svgString, source);
        AppState.preview.isProcessing = false;
        showStatus('预览已更新 (' + elapsedMs + 'ms)');
    } else {
        // 转换模式：发送 SVG 给 Sandbox 创建节点
        sendToSandbox({
            type: 'CREATE_VECTOR_NODE',
            requestId: requestId,
            nodeId: source.nodeId,
            svg: svgString,
            isPreview: false
        });
    }

    updateUI();
}

/**
 * 修正 SVG 的 viewBox
 * 
 * VTracer 生成的 SVG 可能没有正确的 viewBox，
 * 我们需要确保 viewBox 匹配原始图像尺寸
 */
function fixSvgViewBox(svgString, width, height) {
    // 检查是否已有 viewBox
    if (svgString.indexOf('viewBox') === -1) {
        // 没有 viewBox，添加一个
        svgString = svgString.replace('<svg', '<svg viewBox="0 0 ' + width + ' ' + height + '"');
    }

    // 确保有 width 和 height 属性
    if (svgString.indexOf('width=') === -1) {
        svgString = svgString.replace('<svg', '<svg width="' + width + '"');
    }
    if (svgString.indexOf('height=') === -1) {
        svgString = svgString.replace('<svg', '<svg height="' + height + '"');
    }

    return svgString;
}

// ============================================
// 五、预览与交互
// ============================================

/**
 * 请求预览（带防抖）
 * 
 * 防抖的作用：
 * 当用户快速拖动滑块时，我们不需要每次都发送请求，
 * 只需要在用户停止操作 200ms 后发送一次
 */
function requestPreviewDebounced() {
    // 清除之前的定时器
    if (AppState.preview.debounceTimer) {
        clearTimeout(AppState.preview.debounceTimer);
    }

    // 设置新的定时器
    AppState.preview.debounceTimer = setTimeout(function () {
        requestPreview();
    }, 200);
}

/**
 * 立即请求预览
 */
function requestPreview() {
    if (AppState.selection.count === 0) {
        return;
    }

    // 生成新的请求 ID
    AppState.preview.requestId = generateRequestId();
    AppState.preview.isProcessing = true;

    showStatus('正在生成预览...');
    updateUI();

    // 发送预览请求给 Sandbox
    sendToSandbox({
        type: 'REQUEST_PREVIEW',
        requestId: AppState.preview.requestId,
        params: AppState.params
    });
}

/**
 * 开始转换
 */
function startConvert() {
    if (AppState.selection.count === 0) {
        showError('请先选择一个或多个节点');
        return;
    }

    if (AppState.convert.isConverting) {
        return;
    }

    AppState.convert.requestId = generateRequestId();
    AppState.convert.isConverting = true;

    showStatus('开始转换...');
    updateUI();

    sendToSandbox({
        type: 'REQUEST_CONVERT',
        requestId: AppState.convert.requestId,
        params: AppState.params
    });
}

/**
 * 应用预设
 */
function applyPreset(presetId) {
    var preset = PRESETS[presetId];
    if (!preset) return;

    AppState.params = Object.assign({}, AppState.params, preset.params);
    AppState.params.preset = presetId;

    // 更新 UI 控件
    updateParamControls();

    // 请求新的预览
    requestPreviewDebounced();
}

/**
 * 更新参数
 */
function updateParam(name, value) {
    AppState.params[name] = value;
    requestPreviewDebounced();
}

// ============================================
// 六、UI 更新函数
// ============================================

/**
 * 更新选区 UI
 */
function updateSelectionUI() {
    var infoEl = document.getElementById('selection-info');
    if (!infoEl) return;

    if (AppState.selection.count === 0) {
        infoEl.innerHTML = '<span class="no-selection">未选中任何节点</span>';
    } else if (AppState.selection.count === 1) {
        var node = AppState.selection.nodes[0];
        infoEl.innerHTML = '<span class="node-name">' + escapeHtml(node.name) + '</span>' +
            '<span class="node-size">' + node.width + ' × ' + node.height + '</span>';
    } else {
        infoEl.innerHTML = '<span class="node-count">已选中 ' + AppState.selection.count + ' 个节点</span>';
    }
}

/**
 * 更新参数控件
 */
function updateParamControls() {
    // 预设下拉框
    var presetSelect = document.getElementById('preset-select');
    if (presetSelect) {
        presetSelect.value = AppState.params.preset;
    }

    // 阈值滑块
    updateSlider('threshold', AppState.params.threshold);

    // 反转开关
    var invertCheck = document.getElementById('invert-check');
    if (invertCheck) {
        invertCheck.checked = AppState.params.invert;
    }

    // 去噪滑块
    updateSlider('filterSpeckle', AppState.params.filterSpeckle);

    // 角点滑块
    updateSlider('cornerThreshold', AppState.params.cornerThreshold);

    // 曲线拟合
    var curveFittingSelect = document.getElementById('curveFitting-select');
    if (curveFittingSelect) {
        curveFittingSelect.value = AppState.params.curveFitting;
    }

    // 精度滑块
    updateSlider('pathPrecision', AppState.params.pathPrecision);
}

/**
 * 更新滑块
 */
function updateSlider(name, value) {
    var slider = document.getElementById(name + '-slider');
    var valueEl = document.getElementById(name + '-value');

    if (slider) {
        slider.value = value;
        // 关键：值变化后更新背景
        updateSliderBackground(slider);
    }
    if (valueEl) {
        valueEl.textContent = value;
    }
}

/**
 * 显示预览
 */
function displayPreview(svgString, source) {
    var previewContainer = document.getElementById('preview-container');
    if (!previewContainer) return;

    // 清空之前的内容
    previewContainer.innerHTML = '';

    // 创建 SVG 预览
    var svgWrapper = document.createElement('div');
    svgWrapper.className = 'svg-preview';

    // 处理 SVG 字符串，确保它能响应式缩放
    // 移除固定的 width/height，确保有 viewBox
    var cleanSvg = svgString
        .replace(/width="[^"]*"/g, '')
        .replace(/height="[^"]*"/g, '');

    // 如果没有 viewBox，尝试添加一个（基于源尺寸）
    if (cleanSvg.indexOf('viewBox') === -1 && source) {
        cleanSvg = cleanSvg.replace('<svg', '<svg viewBox="0 0 ' + source.width + ' ' + source.height + '"');
    }

    // 确保有 preserveAspectRatio 属性，保持比例缩放
    if (cleanSvg.indexOf('preserveAspectRatio') === -1) {
        cleanSvg = cleanSvg.replace('<svg', '<svg preserveAspectRatio="xMidYMid meet"');
    }

    svgWrapper.innerHTML = cleanSvg;

    // 调整 SVG 样式以适应容器
    var svgEl = svgWrapper.querySelector('svg');
    if (svgEl) {
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.style.display = 'block';
    }

    previewContainer.appendChild(svgWrapper);
}

/**
 * 清空预览
 */
function clearPreview() {
    var previewContainer = document.getElementById('preview-container');
    if (previewContainer) {
        previewContainer.innerHTML = '<div class="empty-preview">选择一个节点开始</div>';
    }
}

/**
 * 更新进度 UI
 */
function updateProgressUI() {
    var progressEl = document.getElementById('progress-bar');
    if (!progressEl) return;

    if (AppState.convert.isConverting) {
        var percent = (AppState.convert.current / AppState.convert.total) * 100;
        progressEl.style.width = percent + '%';
        progressEl.parentElement.style.display = 'block';
    } else {
        progressEl.parentElement.style.display = 'none';
    }
}

/**
 * 更新整体 UI
 */
function updateUI() {
    // 更新按钮状态
    var convertBtn = document.getElementById('convert-btn');
    if (convertBtn) {
        convertBtn.disabled = AppState.selection.count === 0 ||
            AppState.convert.isConverting ||
            !VTracer.ready;

        if (AppState.convert.isConverting) {
            convertBtn.textContent = '转换中...';
        } else {
            convertBtn.textContent = '转换为矢量';
        }
    }

    // 更新加载状态
    var loadingEl = document.getElementById('loading-indicator');
    if (loadingEl) {
        loadingEl.style.display = AppState.preview.isProcessing ? 'block' : 'none';
    }
}

/**
 * 显示状态消息
 */
function showStatus(message) {
    var statusEl = document.getElementById('status-message');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'status-message';
    }
}

/**
 * 显示错误消息
 */
function showError(message) {
    var statusEl = document.getElementById('status-message');
    if (statusEl) {
        statusEl.textContent = '⚠️ ' + message;
        statusEl.className = 'status-message error';
    }
    console.error('[UI]', message);
}

/**
 * 显示警告消息
 */
function showWarning(message) {
    var statusEl = document.getElementById('status-message');
    if (statusEl) {
        statusEl.textContent = '⚡ ' + message;
        statusEl.className = 'status-message warning';
    }
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// 七、初始化
// ============================================

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 预设下拉框
    var presetSelect = document.getElementById('preset-select');
    if (presetSelect) {
        presetSelect.addEventListener('change', function () {
            applyPreset(this.value);
        });
    }

    // 阈值滑块
    initSlider('threshold', 0, 255);

    // 反转开关
    var invertCheck = document.getElementById('invert-check');
    if (invertCheck) {
        invertCheck.addEventListener('change', function () {
            updateParam('invert', this.checked);
        });
    }

    // 去噪滑块
    initSlider('filterSpeckle', 0, 64);

    // 角点滑块
    initSlider('cornerThreshold', 0, 180);

    // 曲线拟合下拉框
    var curveFittingSelect = document.getElementById('curveFitting-select');
    if (curveFittingSelect) {
        curveFittingSelect.addEventListener('change', function () {
            updateParam('curveFitting', this.value);
        });
    }

    // 精度滑块
    initSlider('pathPrecision', 1, 10);

    // 转换按钮
    var convertBtn = document.getElementById('convert-btn');
    if (convertBtn) {
        convertBtn.addEventListener('click', function () {
            startConvert();
        });
    }

    // 关闭按钮
    var closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            sendToSandbox({ type: 'CLOSE_PLUGIN' });
        });
    }
}

/**
 * 初始化滑块
 */
function initSlider(name, min, max) {
    var slider = document.getElementById(name + '-slider');
    if (!slider) return;

    slider.min = min;
    slider.max = max;

    slider.addEventListener('input', function () {
        var value = parseInt(this.value, 10);
        updateParam(name, value);

        var valueEl = document.getElementById(name + '-value');
        if (valueEl) {
            valueEl.textContent = value;
        }
    });
}

/**
 * 页面加载完成后初始化
 */
function init() {
    console.log('[UI] 初始化...');

    // 初始化事件监听器
    initEventListeners();

    // 初始化滑块视觉效果 (Pro Max 级)
    initSliderVisuals();

    // 更新参数控件
    updateParamControls();

    // 更新 UI
    updateUI();

    // 通知 Sandbox UI 已就绪
    sendToSandbox({ type: 'UI_READY' });

    // 预加载 Potrace 引擎
    if (window.PotraceWASM && window.PotraceWASM.init) {
        window.PotraceWASM.init().then(function () {
            console.log('[UI] Potrace 引擎预加载完成');
        }).catch(function (err) {
            console.warn('[UI] Potrace 引擎预加载失败:', err);
        });
    }
}

// ============================================
// 八、视觉增强
// ============================================

/**
 * 初始化滑块视觉效果
 * 为所有 range input 添加动态进度条背景
 */
function initSliderVisuals() {
    var sliders = document.querySelectorAll('input[type="range"]');

    sliders.forEach(function (slider) {
        // 初始化一次
        updateSliderBackground(slider);

        // 监听输入变化
        slider.addEventListener('input', function () {
            updateSliderBackground(this);
        });
    });
}

/**
 * 更新滑块背景渐变
 * @param {HTMLInputElement} slider 
 */
function updateSliderBackground(slider) {
    if (!slider) return;

    var min = slider.min ? parseFloat(slider.min) : 0;
    var max = slider.max ? parseFloat(slider.max) : 100;
    var val = parseFloat(slider.value);

    var percentage = (val - min) / (max - min) * 100;

    // Webkit 浏览器专属：利用线性渐变模拟进度条
    // 左边是品牌色 (#0d99ff 接近 Figma 蓝)，右边是轨道色
    var activeColor = '#0d99ff';
    var trackColor = '#e0e0e0';

    // 简单的深色模式检测 (根据 body 背景色)
    // 注意：getComputedStyle 可能会有性能开销，但在这里是可以接受的
    // 为了更稳健，我们直接假设如果背景不是浅色就是深色
    try {
        var bgColor = getComputedStyle(document.body).backgroundColor;
        // 简单的 RGB 解析，如果是深色背景，使用深色轨道
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
            // 这是一个极其简化的判断，但在 Figma 插件环境中通常是 #2c2c2c (dark) 或 #ffffff (light)
            if (bgColor.indexOf('#2') !== -1 || bgColor.indexOf('rgb(44') !== -1) {
                trackColor = '#555555';
            }
        }
    } catch (e) { }

    slider.style.background = 'linear-gradient(to right, ' + activeColor + ' 0%, ' + activeColor + ' ' + percentage + '%, ' + trackColor + ' ' + percentage + '%, ' + trackColor + ' 100%)';
}

/**
 * 使用 Potrace 引擎进行矢量化
 * 这是 Level 2 的兜底策略，专门处理 VTracer 搞不定的黑白图像
 * 
 * @param {ImageData} imageData - 原始图像数据
 */
async function traceWithPotrace(imageData, source, params, isPreview, requestId, startTime) {
    if (!window.PotraceWASM) {
        console.error('Potrace 引擎未加载');
        showError('Potrace 引擎未加载，无法执行降级策略');
        AppState.preview.isProcessing = false;
        updateUI();
        return;
    }

    try {
        console.log('[UI] 正在使用 Potrace 引擎转换...');

        // Potrace 参数映射
        var options = {
            turdsize: params.filterSpeckle || 2,
            turnpolicy: 4, // POTRACE_TURNPOLICY_MINORITY
            alphamax: 1,
            opticurve: 1,
            opttolerance: 0.2,
            pathonly: false,
            extractcolors: false // 强制黑白
        };

        // 确保 Potrace 已初始化 (幂等操作)
        await window.PotraceWASM.init();

        // 执行转换
        var svg = await window.PotraceWASM.potrace(imageData, options);

        var elapsedMs = Date.now() - startTime;
        console.log('[UI] Potrace 转换完成, 耗时:', elapsedMs, 'ms');

        handleTraceResult(svg, source, isPreview, requestId, elapsedMs);

    } catch (e) {
        console.error('Potrace failed:', e);
        showError('Potrace 转换失败: ' + (e.message || e));
        AppState.preview.isProcessing = false;
        updateUI();
    }
}

// 等待 DOM 加载完成
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
