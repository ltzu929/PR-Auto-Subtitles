/**
 * SRT Generator
 * 负责将腾讯云 ASR 的识别结果转换为标准的 SRT 字幕格式
 * 并处理时间码偏移，确保字幕与视频画面对齐
 */

/**
 * 格式化时间为 SRT 标准格式 (HH:MM:SS,mmm)
 * 例如: 00:00:05,123
 * 
 * @param {number} seconds - 秒数 (支持小数)
 * @returns {string} SRT 格式的时间字符串
 */
function formatTime(seconds) {
    var date = new Date(0);
    date.setMilliseconds(seconds * 1000); // seconds to ms
    var iso = date.toISOString();
    // ISO format: 1970-01-01T00:00:00.000Z
    // We need: 00:00:00,000
    var timePart = iso.substr(11, 12);
    return timePart.replace('.', ',');
}

/**
 * 生成 SRT 内容
 * 
 * @param {Array} sentenceList - 腾讯云返回的句子列表，每个对象包含 StartTime, EndTime, Text
 * @param {number} offsetSeconds - 序列入点偏移量 (秒)。因为导出的音频是从入点开始的，所以字幕时间需要加上这个偏移。
 * @param {boolean} removePunctuation - 是否去除标点
 * @returns {string} 完整的 SRT 文件内容
 */
function generateSRT(sentenceList, offsetSeconds, removePunctuation) {
    if (!sentenceList || sentenceList.length === 0) {
        return "";
    }

    var srtContent = "";
    var index = 1;

    sentenceList.forEach(function(sentence) {
        // 腾讯云返回的时间单位是毫秒，需要转换为秒
        // 公式：SRT时间 = (识别时间 / 1000) + 序列入点偏移
        var startTime = (sentence.StartTime / 1000) + offsetSeconds;
        var endTime = (sentence.EndTime / 1000) + offsetSeconds;
        var text = sentence.Text;

        if (removePunctuation) {
            // 匹配常见的中英文标点符号
            // 英文: .,\/#!$%\^&\*;:{}=\-_`~()
            // 中文: ？。，、；：‘’“”《》【】
            text = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()？。，、；：‘’“”《》【】]/g, "");
        }

        // SRT 格式块:
        // 序号
        // 开始时间 --> 结束时间
        // 字幕文本
        // (空行)
        srtContent += index + "\n";
        srtContent += formatTime(startTime) + " --> " + formatTime(endTime) + "\n";
        srtContent += text + "\n\n";
        
        index++;
    });

    return srtContent;
}

module.exports = {
    generateSRT: generateSRT
};
