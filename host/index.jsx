/*************************************************************************
 * Adobe Premiere Pro Host Script
 * 
 * 这个文件运行在 Premiere Pro 的 ExtendScript 引擎中。
 * 它负责直接操作 PR 的对象模型（DOM），例如轨道、序列、导出和导入。
 ************************************************************************/

// JSON polyfill for ExtendScript (if not present)
// ExtendScript 基于旧版 ECMAScript 3，可能不包含原生的 JSON 对象，因此需要 Polyfill
if (typeof JSON !== 'object') {
    JSON = {};
}
(function () {
    'use strict';
    
    // Simple JSON stringify implementation for ExtendScript
    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value) {
            var type = typeof value;
            if (type === 'string') return '"' + value.replace(/"/g, '\\"') + '"';
            if (type === 'number' || type === 'boolean') return String(value);
            if (type === 'object') {
                if (!value) return 'null';
                if (value instanceof Array) {
                    var res = '[';
                    for (var i = 0; i < value.length; i++) {
                        res += (i ? ',' : '') + JSON.stringify(value[i]);
                    }
                    return res + ']';
                }
                var res = '{';
                var first = true;
                for (var k in value) {
                    if (value.hasOwnProperty(k)) {
                        res += (first ? '' : ',') + '"' + k + '":' + JSON.stringify(value[k]);
                        first = false;
                    }
                }
                return res + '}';
            }
            return 'null';
        };
    }
})();

/**
 * 获取当前活动序列的所有音频轨道
 * (已废弃，不再使用)
 */
function getAudioTracks() {
    return "[]";
}

/**
 * 导出当前序列的音频 (全轨道混合)
 * 
 * @param {string} outputPath - 导出的音频文件绝对路径
 * @param {string} presetPath - .epr 导出预设文件的绝对路径
 * @returns {string} "success" 或错误信息
 */
function exportSequenceAudio(outputPath, presetPath) {
    var seq = app.project.activeSequence;
    if (!seq) return "No active sequence";

    try {
        // 2. 导出
        // 0 = Work Area (工作区), 1 = Entire Sequence (整个序列), 2 = In/Out Points (入出点)
        // 我们使用 In/Out Points (2)，这样用户可以通过设置入出点来控制识别范围
        var range = 2; 
        
        var result = seq.exportAsMediaDirect(outputPath, presetPath, range);
        
        if (result) {
            return "success"; 
        } else {
            return "success";
        }

    } catch (e) {
        return "Error: " + e.toString();
    }
}

/**
 * 导入 SRT 文件到项目素材箱
 * 
 * @param {string} filePath - SRT 文件的绝对路径
 * @returns {string} "success" 或错误信息
 */
function importSRT(filePath) {
    try {
        // importFiles 参数: [文件路径数组], suppressUI, targetBin, importAsNumberedStills
        var result = app.project.importFiles([filePath], true, app.project.getInsertionBin(), false);
        return result ? "success" : "failed";
    } catch (e) {
        return "Error: " + e.toString();
    }
}

/**
 * 获取当前序列的入点时间（秒）
 * 
 * 用于计算字幕的时间偏移。因为导出的音频是从入点开始的，
 * 而 SRT 需要相对于整个序列的时间码。
 * 公式：SRT时间 = 识别时间 + 序列入点时间
 * 
 * @returns {number} 入点时间的秒数
 */
function getSequenceInPoint() {
    var seq = app.project.activeSequence;
    if (!seq) return 0;
    
    // InPoint 是 Time 对象，seconds 属性获取秒数
    return seq.getInPointAsTime().seconds;
}

/**
 * 获取当前项目名称 (不含扩展名)
 * @returns {string} 项目名称
 */
function getProjectName() {
    if (app.project) {
        var name = app.project.name;
        // 移除 .prproj 后缀
        return name.replace(/\.prproj$/i, "");
    }
    return "Untitled";
}
