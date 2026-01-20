/**
 * ===================================================
 * VectorTracer WASM 加载器 (ui/vtracer-loader.js)
 * ===================================================
 * 
 * 这个文件负责在 Figma 插件的 UI iframe 中加载 VTracer WASM。
 * 
 * 为什么需要这个文件？
 * 因为标准的 WASM 加载方式使用 ES modules (import)，
 * 但 Figma 插件的 no-build 模式需要普通的 script 标签加载。
 * 这个文件把 ES module 的代码转换成全局变量的方式。
 */

// ============================================
// 全局变量 - 存储 WASM 相关对象
// ============================================

/**
 * VTracer 对象，加载完成后会有以下属性：
 * - BinaryImageConverter: 黑白图像转换器类
 * - ready: 标记是否加载完成
 */
var VTracer = {
    ready: false,
    BinaryImageConverter: null
};

// 内部 WASM 实例变量
var wasm = null;

// ============================================
// WASM 绑定函数（从 vectortracer_bg.js 移植）
// ============================================

// 文本解码器 - 用于把 WASM 内存中的字节转换成字符串
var cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();

// 文本编码器 - 用于把字符串转换成字节
var cachedTextEncoder = new TextEncoder('utf-8');

// 内存视图缓存
var cachedUint8Memory = null;
var cachedInt32Memory = null;
var cachedFloat64Memory = null;
var cachedBigInt64Memory = null;

// 临时变量
var WASM_VECTOR_LEN = 0;

// 堆管理 - 用于在 JS 和 WASM 之间传递对象引用
var heap = new Array(128).fill(undefined);
heap.push(undefined, null, true, false);
var heap_next = heap.length;

/**
 * 获取 Uint8 内存视图
 */
function getUint8Memory() {
    if (cachedUint8Memory === null || cachedUint8Memory.byteLength === 0) {
        cachedUint8Memory = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory;
}

/**
 * 获取 Int32 内存视图
 */
function getInt32Memory() {
    if (cachedInt32Memory === null || cachedInt32Memory.byteLength === 0) {
        cachedInt32Memory = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32Memory;
}

/**
 * 获取 Float64 内存视图
 */
function getFloat64Memory() {
    if (cachedFloat64Memory === null || cachedFloat64Memory.byteLength === 0) {
        cachedFloat64Memory = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64Memory;
}

/**
 * 获取 BigInt64 内存视图
 */
function getBigInt64Memory() {
    if (cachedBigInt64Memory === null || cachedBigInt64Memory.byteLength === 0) {
        cachedBigInt64Memory = new BigInt64Array(wasm.memory.buffer);
    }
    return cachedBigInt64Memory;
}

/**
 * 从 WASM 内存中读取字符串
 */
function getStringFromWasm(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8Memory().subarray(ptr, ptr + len));
}

/**
 * 添加对象到堆
 */
function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    var idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
}

/**
 * 从堆获取对象
 */
function getObject(idx) {
    return heap[idx];
}

/**
 * 从堆删除对象
 */
function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

/**
 * 取出并删除堆对象
 */
function takeObject(idx) {
    var ret = getObject(idx);
    dropObject(idx);
    return ret;
}

/**
 * 检查值是否为 null 或 undefined
 */
function isLikeNone(x) {
    return x === undefined || x === null;
}

/**
 * 字符串编码辅助函数
 */
var encodeString = (typeof cachedTextEncoder.encodeInto === 'function')
    ? function (arg, view) {
        return cachedTextEncoder.encodeInto(arg, view);
    }
    : function (arg, view) {
        var buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return { read: arg.length, written: buf.length };
    };

/**
 * 把字符串写入 WASM 内存
 */
function passStringToWasm(arg, malloc, realloc) {
    if (realloc === undefined) {
        var buf = cachedTextEncoder.encode(arg);
        var ptr = malloc(buf.length, 1) >>> 0;
        getUint8Memory().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    var len = arg.length;
    var ptr = malloc(len, 1) >>> 0;
    var mem = getUint8Memory();
    var offset = 0;

    for (; offset < len; offset++) {
        var code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        var view = getUint8Memory().subarray(ptr + offset, ptr + len);
        var ret = encodeString(arg, view);
        offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

/**
 * 把 Uint8Array 写入 WASM 内存
 */
function passArray8ToWasm(arg, malloc) {
    var ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8Memory().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

/**
 * 调试字符串生成
 */
function debugString(val) {
    var type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return '' + val;
    }
    if (type == 'string') {
        return '"' + val + '"';
    }
    if (type == 'symbol') {
        var description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return 'Symbol(' + description + ')';
        }
    }
    if (type == 'function') {
        var name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return 'Function(' + name + ')';
        } else {
            return 'Function';
        }
    }
    if (Array.isArray(val)) {
        var length = val.length;
        var debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for (var i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    var builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    var className;
    if (builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        return toString.call(val);
    }
    if (className == 'Object') {
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    if (val instanceof Error) {
        return val.name + ': ' + val.message + '\n' + val.stack;
    }
    return className;
}

// ============================================
// BinaryImageConverter 类
// ============================================

/**
 * 二值图像转换器
 * 
 * 这是 VTracer 的核心类，用于把图像数据转换成 SVG
 */
function BinaryImageConverter(imageData, converterOptions, options) {
    this.__wbg_ptr = wasm.binaryimageconverter_new(
        addHeapObject(imageData),
        addHeapObject(converterOptions),
        addHeapObject(options)
    ) >>> 0;
}

/**
 * 包装函数 - 从 WASM 指针创建对象
 */
BinaryImageConverter.__wrap = function (ptr) {
    ptr = ptr >>> 0;
    var obj = Object.create(BinaryImageConverter.prototype);
    obj.__wbg_ptr = ptr;
    return obj;
};

/**
 * 释放内存
 */
BinaryImageConverter.prototype.free = function () {
    var ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    wasm.__wbg_binaryimageconverter_free(ptr);
};

/**
 * 初始化转换器
 */
BinaryImageConverter.prototype.init = function () {
    wasm.binaryimageconverter_init(this.__wbg_ptr);
};

/**
 * 执行一步转换
 * @returns {boolean} 是否完成
 */
BinaryImageConverter.prototype.tick = function () {
    var ret = wasm.binaryimageconverter_tick(this.__wbg_ptr);
    return ret !== 0;
};

/**
 * 获取 SVG 结果
 * @returns {string} SVG 字符串
 */
BinaryImageConverter.prototype.getResult = function () {
    var deferred1_0, deferred1_1;
    try {
        var retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.binaryimageconverter_getResult(retptr, this.__wbg_ptr);
        var r0 = getInt32Memory()[retptr / 4 + 0];
        var r1 = getInt32Memory()[retptr / 4 + 1];
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
};

/**
 * 获取进度
 * @returns {number} 进度百分比
 */
BinaryImageConverter.prototype.progress = function () {
    var ret = wasm.binaryimageconverter_progress(this.__wbg_ptr);
    return ret >>> 0;
};

// ============================================
// WASM 导入对象 - 提供给 WASM 调用的 JS 函数
// ============================================

var wasmImports = {
    __wbindgen_error_new: function (arg0, arg1) {
        var ret = new Error(getStringFromWasm(arg0, arg1));
        return addHeapObject(ret);
    },

    __wbindgen_object_drop_ref: function (arg0) {
        takeObject(arg0);
    },

    __wbindgen_is_undefined: function (arg0) {
        var ret = getObject(arg0) === undefined;
        return ret;
    },

    __wbindgen_in: function (arg0, arg1) {
        var ret = getObject(arg0) in getObject(arg1);
        return ret;
    },

    __wbindgen_number_get: function (arg0, arg1) {
        var obj = getObject(arg1);
        var ret = typeof (obj) === 'number' ? obj : undefined;
        getFloat64Memory()[arg0 / 8 + 1] = isLikeNone(ret) ? 0 : ret;
        getInt32Memory()[arg0 / 4 + 0] = !isLikeNone(ret);
    },

    __wbindgen_is_bigint: function (arg0) {
        var ret = typeof (getObject(arg0)) === 'bigint';
        return ret;
    },

    __wbindgen_bigint_from_u64: function (arg0) {
        var ret = BigInt.asUintN(64, arg0);
        return addHeapObject(ret);
    },

    __wbindgen_jsval_eq: function (arg0, arg1) {
        var ret = getObject(arg0) === getObject(arg1);
        return ret;
    },

    __wbindgen_boolean_get: function (arg0) {
        var v = getObject(arg0);
        var ret = typeof (v) === 'boolean' ? (v ? 1 : 0) : 2;
        return ret;
    },

    __wbindgen_string_get: function (arg0, arg1) {
        var obj = getObject(arg1);
        var ret = typeof (obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getInt32Memory()[arg0 / 4 + 1] = len1;
        getInt32Memory()[arg0 / 4 + 0] = ptr1;
    },

    __wbindgen_is_object: function (arg0) {
        var val = getObject(arg0);
        var ret = typeof (val) === 'object' && val !== null;
        return ret;
    },

    __wbindgen_string_new: function (arg0, arg1) {
        var ret = getStringFromWasm(arg0, arg1);
        return addHeapObject(ret);
    },

    __wbindgen_object_clone_ref: function (arg0) {
        var ret = getObject(arg0);
        return addHeapObject(ret);
    },

    __wbg_new_abda76e883ba8a5f: function () {
        var ret = new Error();
        return addHeapObject(ret);
    },

    __wbg_stack_658279fe44541cf6: function (arg0, arg1) {
        var ret = getObject(arg1).stack;
        var ptr1 = passStringToWasm(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getInt32Memory()[arg0 / 4 + 1] = len1;
        getInt32Memory()[arg0 / 4 + 0] = ptr1;
    },

    __wbg_error_f851667af71bcfc6: function (arg0, arg1) {
        var deferred0_0, deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    },

    __wbindgen_jsval_loose_eq: function (arg0, arg1) {
        var ret = getObject(arg0) == getObject(arg1);
        return ret;
    },

    __wbg_getwithrefkey_5e6d9547403deab8: function (arg0, arg1) {
        var ret = getObject(arg0)[getObject(arg1)];
        return addHeapObject(ret);
    },

    __wbg_String_88810dfeb4021902: function (arg0, arg1) {
        var ret = String(getObject(arg1));
        var ptr1 = passStringToWasm(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getInt32Memory()[arg0 / 4 + 1] = len1;
        getInt32Memory()[arg0 / 4 + 0] = ptr1;
    },

    __wbg_width_c97f89a38a3c1da7: function (arg0) {
        var ret = getObject(arg0).width;
        return ret;
    },

    __wbg_height_c8424a3757db7869: function (arg0) {
        var ret = getObject(arg0).height;
        return ret;
    },

    __wbg_data_eaf4962120932fdc: function (arg0, arg1) {
        var ret = getObject(arg1).data;
        var ptr1 = passArray8ToWasm(ret, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        getInt32Memory()[arg0 / 4 + 1] = len1;
        getInt32Memory()[arg0 / 4 + 0] = ptr1;
    },

    __wbg_debug_9b8701f894da9929: function (arg0, arg1, arg2, arg3) {
        console.debug(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    },

    __wbg_error_d9bce418caafb712: function (arg0, arg1, arg2, arg3) {
        console.error(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    },

    __wbg_info_bb52f40b06f679de: function (arg0, arg1, arg2, arg3) {
        console.info(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    },

    __wbg_log_1d3ae0273d8f4f8a: function (arg0) {
        console.log(getObject(arg0));
    },

    __wbg_log_ea7093e35e3efd07: function (arg0, arg1, arg2, arg3) {
        console.log(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    },

    __wbg_warn_dfc0e0cf544a13bd: function (arg0, arg1, arg2, arg3) {
        console.warn(getObject(arg0), getObject(arg1), getObject(arg2), getObject(arg3));
    },

    __wbg_instanceof_ArrayBuffer_39ac22089b74fddb: function (arg0) {
        var result;
        try {
            result = getObject(arg0) instanceof ArrayBuffer;
        } catch (e) {
            result = false;
        }
        var ret = result;
        return ret;
    },

    __wbg_isSafeInteger_bb8e18dd21c97288: function (arg0) {
        var ret = Number.isSafeInteger(getObject(arg0));
        return ret;
    },

    __wbg_buffer_085ec1f694018c4f: function (arg0) {
        var ret = getObject(arg0).buffer;
        return addHeapObject(ret);
    },

    __wbg_new_8125e318e6245eed: function (arg0) {
        var ret = new Uint8Array(getObject(arg0));
        return addHeapObject(ret);
    },

    __wbg_set_5cf90238115182c3: function (arg0, arg1, arg2) {
        getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    },

    __wbg_length_72e2208bbc0efc61: function (arg0) {
        var ret = getObject(arg0).length;
        return ret;
    },

    __wbg_instanceof_Uint8Array_d8d9cb2b8e8ac1d4: function (arg0) {
        var result;
        try {
            result = getObject(arg0) instanceof Uint8Array;
        } catch (e) {
            result = false;
        }
        var ret = result;
        return ret;
    },

    __wbindgen_bigint_get_as_i64: function (arg0, arg1) {
        var v = getObject(arg1);
        var ret = typeof (v) === 'bigint' ? v : undefined;
        getBigInt64Memory()[arg0 / 8 + 1] = isLikeNone(ret) ? BigInt(0) : ret;
        getInt32Memory()[arg0 / 4 + 0] = !isLikeNone(ret);
    },

    __wbindgen_debug_string: function (arg0, arg1) {
        var ret = debugString(getObject(arg1));
        var ptr1 = passStringToWasm(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getInt32Memory()[arg0 / 4 + 1] = len1;
        getInt32Memory()[arg0 / 4 + 0] = ptr1;
    },

    __wbindgen_throw: function (arg0, arg1) {
        throw new Error(getStringFromWasm(arg0, arg1));
    },

    __wbindgen_memory: function () {
        var ret = wasm.memory;
        return addHeapObject(ret);
    }
};

// ============================================
// WASM 加载函数
// ============================================

/**
 * 从 Base64 字符串加载 WASM
 * 
 * 为什么用 Base64？
 * 因为 Figma 插件的 UI 不能直接引用外部文件，
 * 我们需要把 WASM 内联到 HTML 中
 * 
 * @param {string} wasmBase64 - Base64 编码的 WASM 二进制
 * @returns {Promise} - 加载完成的 Promise
 */
function loadVTracerFromBase64(wasmBase64) {
    return new Promise(function (resolve, reject) {
        try {
            // 把 Base64 转换成二进制数组
            var binaryString = atob(wasmBase64);
            var bytes = new Uint8Array(binaryString.length);
            for (var i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // 实例化 WASM
            WebAssembly.instantiate(bytes.buffer, {
                './vectortracer_bg.js': wasmImports
            }).then(function (result) {
                wasm = result.instance.exports;

                // 调用初始化函数
                if (wasm.__wbindgen_start) {
                    wasm.__wbindgen_start();
                }

                // 导出到全局对象
                VTracer.BinaryImageConverter = BinaryImageConverter;
                VTracer.ready = true;

                console.log('[VTracer] WASM 加载成功!');
                resolve(VTracer);
            }).catch(reject);
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * 从 ArrayBuffer 加载 WASM
 * 
 * @param {ArrayBuffer} wasmBuffer - WASM 二进制数据
 * @returns {Promise} - 加载完成的 Promise
 */
function loadVTracerFromBuffer(wasmBuffer) {
    return new Promise(function (resolve, reject) {
        WebAssembly.instantiate(wasmBuffer, {
            './vectortracer_bg.js': wasmImports
        }).then(function (result) {
            wasm = result.instance.exports;

            if (wasm.__wbindgen_start) {
                wasm.__wbindgen_start();
            }

            VTracer.BinaryImageConverter = BinaryImageConverter;
            VTracer.ready = true;

            console.log('[VTracer] WASM 加载成功!');
            resolve(VTracer);
        }).catch(reject);
    });
}

// 导出到全局
window.VTracer = VTracer;
window.loadVTracerFromBase64 = loadVTracerFromBase64;
window.loadVTracerFromBuffer = loadVTracerFromBuffer;
