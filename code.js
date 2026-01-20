/**
 * ===================================================
 * Figma Raster to Vector - Sandbox 端代码 (code.js)
 * ===================================================
 * 
 * 这是运行在 Figma 插件沙盒环境中的代码。
 * 它负责：
 *   1. 与 Figma 文档交互（读取选区、创建节点）
 *   2. 导出节点的像素数据
 *   3. 与 UI 进行消息通信
 * 
 * 注意：沙盒环境没有 DOM、Canvas 等浏览器 API！
 */

// ============================================
// 一、全局配置常量
// ============================================

/**
 * 预览时的最大尺寸限制
 * 为什么是 512？因为更大的图片会让预览变慢，
 * 512 是速度和清晰度的平衡点
 */
var PREVIEW_MAX_SIZE = 512;

/**
 * 最终转换时的最大尺寸限制
 * 4096x4096 是 Figma 导出的合理上限
 */
var CONVERT_MAX_SIZE = 4096;

/**
 * 插件版本号
 * 用于 UI 初始化时显示
 */
var PLUGIN_VERSION = "0.1.0";

// ============================================
// 二、插件入口 - 显示 UI 窗口
// ============================================

/**
 * figma.showUI() 是打开插件 UI 窗口的核心函数
 * 
 * 参数说明：
 * - __html__：这是 Figma 的特殊变量，会自动替换为 ui.html 的内容
 * - width/height：UI 窗口的尺寸（像素）
 * - themeColors：是否使用 Figma 的主题颜色（深色/浅色模式适配）
 */
figma.showUI(__html__, {
  width: 360,
  height: 600,
  themeColors: true  // 开启主题色，让插件 UI 自动适配 Figma 的深色/浅色模式
});

// ============================================
// 三、选区变化监听 - 实时感知用户选择
// ============================================

/**
 * figma.on() 用于监听 Figma 中的各种事件
 * 
 * "selectionchange" 事件：当用户选择不同的节点时触发
 * 我们需要在选区变化时通知 UI 更新显示
 */
figma.on("selectionchange", function () {
  // 当用户选择变化时，发送最新的选区信息给 UI
  sendSelectionInfo();
});

// ============================================
// 四、消息处理器 - 接收 UI 发来的指令
// ============================================

/**
 * figma.ui.onmessage 是从 UI 接收消息的入口
 * 
 * UI 使用 parent.postMessage({ pluginMessage: {...} }, '*') 发送消息，
 * 我们在这里接收并处理
 */
figma.ui.onmessage = function (msg) {
  // ===========================================
  // 消息类型：UI_READY
  // 时机：UI 加载完成后发送
  // 作用：告诉 sandbox 可以开始交互了
  // ===========================================
  if (msg.type === "UI_READY") {
    // 发送初始化信息（插件版本、引擎信息等）
    figma.ui.postMessage({
      type: "INIT",
      pluginVersion: PLUGIN_VERSION,
      engine: { primary: "vtracer-wasm", fallback: "none" },
      defaults: { preset: "logo_bw" }
    });

    // 发送当前选区信息
    sendSelectionInfo();
  }

  // ===========================================
  // 消息类型：REQUEST_PREVIEW
  // 时机：用户调整参数后请求预览
  // 作用：导出节点像素并发送给 UI 进行矢量化预览
  // ===========================================
  else if (msg.type === "REQUEST_PREVIEW") {
    handlePreviewRequest(msg.requestId, msg.params);
  }

  // ===========================================
  // 消息类型：REQUEST_CONVERT
  // 时机：用户点击"转换"按钮
  // 作用：导出高质量像素，矢量化后创建 Figma 节点
  // ===========================================
  else if (msg.type === "REQUEST_CONVERT") {
    handleConvertRequest(msg.requestId, msg.params);
  }

  // ===========================================
  // 消息类型：CREATE_VECTOR_NODE
  // 时机：UI 完成矢量化后发送 SVG 结果
  // 作用：用 SVG 创建 Figma 矢量节点并对齐
  // ===========================================
  else if (msg.type === "CREATE_VECTOR_NODE") {
    createVectorFromSvg(msg.requestId, msg.nodeId, msg.svg, msg.isPreview);
  }

  // ===========================================
  // 消息类型：CLOSE_PLUGIN
  // 时机：用户点击关闭按钮
  // 作用：关闭插件
  // ===========================================
  else if (msg.type === "CLOSE_PLUGIN") {
    figma.closePlugin();
  }
};

// ============================================
// 五、选区服务 - 获取和过滤可处理的节点
// ============================================

/**
 * 发送当前选区信息给 UI
 * 
 * 这个函数会检查当前选中的节点，提取它们的基本信息，
 * 然后发送给 UI 显示
 */
function sendSelectionInfo() {
  // figma.currentPage.selection 是当前选中的节点数组
  var selection = figma.currentPage.selection;

  // 如果没有选中任何节点
  if (!selection || selection.length === 0) {
    figma.ui.postMessage({
      type: "SELECTION_UPDATE",
      count: 0,
      nodes: []
    });
    return;
  }

  // 过滤出可以处理的节点（支持 exportAsync 的节点）
  var validNodes = [];

  for (var i = 0; i < selection.length; i++) {
    var node = selection[i];

    // 检查节点是否支持 exportAsync
    // 大多数可见节点都支持，但我们要排除一些特殊类型
    if (canExport(node)) {
      validNodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        width: Math.round(node.width),
        height: Math.round(node.height)
      });
    }
  }

  figma.ui.postMessage({
    type: "SELECTION_UPDATE",
    count: validNodes.length,
    nodes: validNodes
  });
}

/**
 * 检查节点是否可以导出
 * 
 * @param {SceneNode} node - 要检查的节点
 * @return {boolean} - 是否可以导出
 */
function canExport(node) {
  // 这些类型的节点不支持导出或不适合矢量化
  var unsupportedTypes = [
    "SLICE",           // 切片节点
    "CONNECTOR",       // 连接线
    "WIDGET",          // 小部件
    "EMBED",           // 嵌入内容
    "LINK_UNFURL",     // 链接预览
    "STICKY",          // 便签
    "SHAPE_WITH_TEXT", // 带文字的形状（FigJam）
    "STAMP"            // 图章
  ];

  // 检查是否是不支持的类型
  if (unsupportedTypes.indexOf(node.type) !== -1) {
    return false;
  }

  // 检查节点是否可见且有尺寸
  if ("visible" in node && !node.visible) {
    return false;
  }

  if (node.width <= 0 || node.height <= 0) {
    return false;
  }

  return true;
}

// ============================================
// 六、导出服务 - 把节点渲染成像素
// ============================================

/**
 * 处理预览请求
 * 
 * @param {string} requestId - 请求 ID，用于匹配请求和响应
 * @param {object} params - 矢量化参数
 */
function handlePreviewRequest(requestId, params) {
  var selection = figma.currentPage.selection;

  if (!selection || selection.length === 0) {
    figma.ui.postMessage({
      type: "TRACE_ERROR",
      requestId: requestId,
      message: "请先选择一个节点"
    });
    return;
  }

  // 预览只处理第一个选中的节点
  var node = selection[0];

  if (!canExport(node)) {
    figma.ui.postMessage({
      type: "TRACE_ERROR",
      requestId: requestId,
      message: "选中的节点不支持导出"
    });
    return;
  }

  // 异步导出节点像素
  exportNodeForPreview(node, requestId, params);
}

/**
 * 导出节点用于预览（小尺寸，快速）
 * 
 * @param {SceneNode} node - 要导出的节点
 * @param {string} requestId - 请求 ID
 * @param {object} params - 矢量化参数
 */
function exportNodeForPreview(node, requestId, params) {
  // 计算约束尺寸
  // 我们要限制最大边不超过 PREVIEW_MAX_SIZE
  var maxSide = Math.max(node.width, node.height);
  var scale = 1;

  if (maxSide > PREVIEW_MAX_SIZE) {
    scale = PREVIEW_MAX_SIZE / maxSide;
  }

  // exportAsync 是 Figma 提供的导出函数
  // 它会渲染节点的"所见即所得"效果（包含裁切、滤镜、蒙版等）
  var exportSettings = {
    format: "PNG",
    constraint: { type: "SCALE", value: scale }
  };

  // 注意：exportAsync 返回 Promise
  // 在 no-build 环境中，我们用 .then() 而不是 async/await
  node.exportAsync(exportSettings).then(function (bytes) {
    // bytes 是 Uint8Array 格式的 PNG 数据

    // 发送给 UI 进行矢量化
    figma.ui.postMessage({
      type: "TRACE_REQUEST",
      requestId: requestId,
      isPreview: true,
      bytes: Array.from(bytes),  // Uint8Array 转数组，因为 postMessage 不能直接传 TypedArray
      source: {
        nodeId: node.id,
        name: node.name,
        width: Math.round(node.width * scale),
        height: Math.round(node.height * scale),
        originalWidth: Math.round(node.width),
        originalHeight: Math.round(node.height)
      },
      params: params
    });
  }).catch(function (error) {
    figma.ui.postMessage({
      type: "TRACE_ERROR",
      requestId: requestId,
      message: "导出失败: " + (error.message || error)
    });
  });
}

/**
 * 处理转换请求
 * 
 * @param {string} requestId - 请求 ID
 * @param {object} params - 矢量化参数
 */
function handleConvertRequest(requestId, params) {
  var selection = figma.currentPage.selection;

  if (!selection || selection.length === 0) {
    figma.ui.postMessage({
      type: "TRACE_ERROR",
      requestId: requestId,
      message: "请先选择一个或多个节点"
    });
    return;
  }

  // 过滤可导出的节点
  var validNodes = [];
  for (var i = 0; i < selection.length; i++) {
    if (canExport(selection[i])) {
      validNodes.push(selection[i]);
    }
  }

  if (validNodes.length === 0) {
    figma.ui.postMessage({
      type: "TRACE_ERROR",
      requestId: requestId,
      message: "选中的节点都不支持导出"
    });
    return;
  }

  // 通知 UI 开始批处理
  figma.ui.postMessage({
    type: "BATCH_START",
    requestId: requestId,
    total: validNodes.length
  });

  // 逐个处理节点
  processNodesSequentially(validNodes, 0, requestId, params);
}

/**
 * 顺序处理多个节点
 * 
 * 为什么要顺序处理？
 * 因为同时处理太多节点会占用大量内存，可能导致插件崩溃
 * 
 * @param {SceneNode[]} nodes - 节点数组
 * @param {number} index - 当前处理的索引
 * @param {string} requestId - 请求 ID
 * @param {object} params - 矢量化参数
 */
function processNodesSequentially(nodes, index, requestId, params) {
  if (index >= nodes.length) {
    // 所有节点处理完毕
    figma.ui.postMessage({
      type: "BATCH_COMPLETE",
      requestId: requestId
    });
    return;
  }

  var node = nodes[index];

  // 通知 UI 当前进度
  figma.ui.postMessage({
    type: "BATCH_PROGRESS",
    requestId: requestId,
    current: index + 1,
    total: nodes.length,
    nodeName: node.name
  });

  // 导出当前节点
  exportNodeForConvert(node, requestId, params, function () {
    // 回调：处理下一个节点
    // 使用 setTimeout 避免调用栈过深
    setTimeout(function () {
      processNodesSequentially(nodes, index + 1, requestId, params);
    }, 0);
  });
}

/**
 * 导出节点用于最终转换（高质量）
 * 
 * @param {SceneNode} node - 要导出的节点
 * @param {string} requestId - 请求 ID
 * @param {object} params - 矢量化参数
 * @param {function} onComplete - 完成回调
 */
function exportNodeForConvert(node, requestId, params, onComplete) {
  // 计算导出尺寸
  var maxSide = Math.max(node.width, node.height);
  var scale = 1;

  // 如果节点太大，需要降采样
  if (maxSide > CONVERT_MAX_SIZE) {
    scale = CONVERT_MAX_SIZE / maxSide;

    // 通知 UI 已降采样
    figma.ui.postMessage({
      type: "SIZE_WARNING",
      requestId: requestId,
      originalSize: { w: Math.round(node.width), h: Math.round(node.height) },
      scaledSize: { w: Math.round(node.width * scale), h: Math.round(node.height * scale) }
    });
  }

  var exportSettings = {
    format: "PNG",
    constraint: { type: "SCALE", value: scale }
  };

  node.exportAsync(exportSettings).then(function (bytes) {
    figma.ui.postMessage({
      type: "TRACE_REQUEST",
      requestId: requestId,
      isPreview: false,
      bytes: Array.from(bytes),
      source: {
        nodeId: node.id,
        name: node.name,
        width: Math.round(node.width * scale),
        height: Math.round(node.height * scale),
        originalWidth: Math.round(node.width),
        originalHeight: Math.round(node.height)
      },
      params: params
    });

    if (onComplete) onComplete();
  }).catch(function (error) {
    figma.ui.postMessage({
      type: "TRACE_ERROR",
      requestId: requestId,
      message: "导出节点失败: " + (error.message || error),
      nodeId: node.id
    });

    if (onComplete) onComplete();
  });
}

// ============================================
// 七、放置服务 - 创建矢量节点并对齐
// ============================================

/**
 * 从 SVG 创建矢量节点
 * 
 * @param {string} requestId - 请求 ID
 * @param {string} nodeId - 原始节点 ID
 * @param {string} svg - SVG 字符串
 * @param {boolean} isPreview - 是否是预览模式
 */
async function createVectorFromSvg(requestId, nodeId, svg, isPreview) {
  // 预览模式不创建节点，只在 UI 中显示
  if (isPreview) {
    return;
  }

  // 查找原始节点
  var originalNode = await figma.getNodeByIdAsync(nodeId);

  if (!originalNode) {
    figma.ui.postMessage({
      type: "TRACE_ERROR",
      requestId: requestId,
      message: "找不到原始节点，可能已被删除"
    });
    return;
  }

  try {
    // figma.createNodeFromSvg() 是 Figma 核心 API
    // 它把 SVG 字符串转换为 Figma 的矢量节点
    var svgNode = figma.createNodeFromSvg(svg);

    // createNodeFromSvg 通常返回一个 Frame，里面包含实际的矢量图形
    // 我们需要把内容"解包"出来

    if (!svgNode) {
      throw new Error("SVG 创建失败");
    }

    // 获取原始节点的位置和尺寸
    var originalX = originalNode.x;
    var originalY = originalNode.y;
    var originalWidth = originalNode.width;
    var originalHeight = originalNode.height;

    // 如果 SVG 节点是 Frame，并且只有一个子节点，我们解包它
    var resultNode = svgNode;

    if (svgNode.type === "FRAME" && svgNode.children && svgNode.children.length === 1) {
      // 复制子节点到父级
      var child = svgNode.children[0];

      // 先设置位置
      if ("resize" in svgNode) {
        // 调整 SVG Frame 的尺寸以匹配原始节点
        var svgWidth = svgNode.width;
        var svgHeight = svgNode.height;

        // 计算缩放比例
        var scaleX = originalWidth / svgWidth;
        var scaleY = originalHeight / svgHeight;

        // 使用较小的缩放比例以保持比例
        var uniformScale = Math.min(scaleX, scaleY);

        svgNode.resize(svgWidth * uniformScale, svgHeight * uniformScale);
      }

      resultNode = svgNode;
    }

    // 设置位置
    resultNode.x = originalX;
    resultNode.y = originalY;

    // 尝试调整尺寸以匹配原始节点
    if ("resize" in resultNode && resultNode.width > 0 && resultNode.height > 0) {
      // 保持比例地调整尺寸
      var currentWidth = resultNode.width;
      var currentHeight = resultNode.height;

      // 计算需要的缩放
      var targetScale = Math.min(originalWidth / currentWidth, originalHeight / currentHeight);

      resultNode.resize(
        currentWidth * targetScale,
        currentHeight * targetScale
      );
    }

    // 设置名称
    resultNode.name = originalNode.name + " / Vector";

    // 移动到原始节点的父级（如果有的话）
    if (originalNode.parent && originalNode.parent.type !== "PAGE") {
      // 确保父节点可以接受子节点
      var parent = originalNode.parent;
      if ("appendChild" in parent) {
        parent.appendChild(resultNode);
      }
    }

    // 选中新创建的节点
    figma.currentPage.selection = [resultNode];

    // 通知 UI 成功
    figma.ui.postMessage({
      type: "CONVERT_SUCCESS",
      requestId: requestId,
      nodeId: resultNode.id,
      nodeName: resultNode.name
    });

  } catch (error) {
    figma.ui.postMessage({
      type: "TRACE_ERROR",
      requestId: requestId,
      message: "创建矢量节点失败: " + (error.message || error)
    });
  }
}
