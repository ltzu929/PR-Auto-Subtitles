const fs = require('fs');
const path = require('path');
const os = require('os');
const COS = require('cos-nodejs-sdk-v5');
const tencentcloud = require("tencentcloud-sdk-nodejs");
const AsrClient = tencentcloud.asr.v20190614.Client;
const srtGenerator = require('./srt-generator');

/**
 * 辅助函数：将 CSInterface.evalScript 封装为 Promise
 * 方便使用 async/await 进行异步流程控制
 * @param {Object} csInterface - CSInterface 实例
 * @param {string} script - 要执行的 ExtendScript 代码
 * @returns {Promise}
 */
function evalScriptPromised(csInterface, script) {
    return new Promise((resolve, reject) => {
        csInterface.evalScript(script, (result) => {
            // 检查 ExtendScript 是否返回了错误信息
            if (result && result.toString().startsWith("Error")) {
                reject(new Error(result));
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * 延迟函数 (sleep)
 * 用于轮询时的等待
 * @param {number} ms - 毫秒数
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 主流程入口函数
 * 负责串联整个业务逻辑：导出 -> 上传 -> 识别 -> 生成 -> 导入
 * 
 * @param {Object} csInterface - CSInterface 实例，用于与 Host 通信
 * @param {Object} config - 用户配置对象 (SecretId, SecretKey, Bucket, Region)
 * @param {Function} logFn - 用于向前端输出日志的回调函数
 */
async function run(csInterface, config, logFn) {
    // 获取插件根目录路径
    const extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
    // 导出预设文件路径 (必须存在于插件根目录)
    const presetPath = path.join(extensionRoot, 'mp3.epr'); 
    
    // 创建临时目录用于存放导出的音频和生成的 SRT
    // 修改：使用系统临时目录，避免 Program Files 目录的权限问题
    const tempDir = path.join(os.tmpdir(), 'pr-auto-subtitles-temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    
    const audioFilename = `temp_audio_${Date.now()}.mp3`;
    const audioPath = path.join(tempDir, audioFilename);
    const srtPath = path.join(tempDir, 'result.srt');

    try {
        // --- 步骤 1: 导出音频 ---
        logFn("正在导出音频...");
        
        if (!fs.existsSync(presetPath)) {
            throw new Error(`找不到导出预设文件: ${presetPath}`);
        }

        // 调用 Host 脚本导出音频
        // 注意：Windows 路径分隔符 '\' 在 ExtendScript 字符串中需要转义为 '\\'
        const safeAudioPath = audioPath.replace(/\\/g, '\\\\');
        const safePresetPath = presetPath.replace(/\\/g, '\\\\');
        
        await evalScriptPromised(csInterface, `exportSequenceAudio("${safeAudioPath}", "${safePresetPath}")`);
        
        if (!fs.existsSync(audioPath)) {
            throw new Error("音频导出失败，文件未生成。");
        }
        logFn("音频导出成功。");

        // --- 步骤 2: 上传至腾讯云 COS ---
        logFn("正在上传至腾讯云 COS...");
        
        const cos = new COS({
            SecretId: config.secretId,
            SecretKey: config.secretKey
        });

        const cosKey = `pr-plugin/${audioFilename}`;
        
        // 使用 Promise 封装 COS 上传操作
        try {
            await new Promise((resolve, reject) => {
                cos.putObject({
                    Bucket: config.bucket,
                    Region: config.region,
                    Key: cosKey,
                    Body: fs.createReadStream(audioPath),
                }, function(err, data) {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        } catch (cosErr) {
            throw new Error(`COS 上传失败: ${cosErr.message || JSON.stringify(cosErr)}`);
        }
        
        // 获取带签名的文件 URL (有效期 1 小时)
        // 腾讯云 ASR 服务需要通过 URL 访问音频文件
        const signedUrl = cos.getObjectUrl({
            Bucket: config.bucket,
            Region: config.region,
            Key: cosKey,
            Sign: true,
            Expires: 3600
        });

        logFn("上传成功，URL已获取。");

        // --- 步骤 3: 提交 ASR 语音识别任务 ---
        logFn("正在提交语音识别任务...");
        
        const clientConfig = {
            credential: {
                secretId: config.secretId,
                secretKey: config.secretKey,
            },
            region: config.region,
            profile: {
                httpProfile: {
                    endpoint: "asr.tencentcloudapi.com",
                },
            },
        };

        const client = new AsrClient(clientConfig);
        
        // 创建录音文件识别任务
        const createParams = {
            EngineModelType: config.engineModelType || "16k_zh", // 引擎模型类型
            ChannelNum: 1,             // 声道数
            ResTextFormat: 3,          // 识别结果文本格式：3 (包含句子级时间戳详情)
            SourceType: 0,             // 语音数据来源：0 (URL)
            Url: signedUrl,
            // 可选参数
            ConvertNumMode: parseInt(config.convertNumMode || "1"),
        };
        
        if (config.hotwordId) {
            createParams.HotwordId = config.hotwordId;
        }

        let taskId;
        try {
            const createTaskResult = await client.CreateRecTask(createParams);
            taskId = createTaskResult.Data.TaskId;
            logFn(`任务提交成功，TaskId: ${taskId}`);
        } catch (asrErr) {
            throw new Error(`ASR 任务创建失败: ${asrErr.message || JSON.stringify(asrErr)}`);
        }

        // --- 步骤 4: 轮询识别结果 ---
        logFn("正在等待识别结果...");
        let resultData = null;
        
        // 轮询机制：每隔 2 秒查询一次，最多查询 150 次 (5分钟)
        for (let i = 0; i < 150; i++) {
            await delay(2000);
            
            const statusParams = { TaskId: taskId };
            let statusResult;
            try {
                statusResult = await client.DescribeTaskStatus(statusParams);
            } catch (pollErr) {
                logFn(`查询任务状态失败 (重试中): ${pollErr.message}`);
                continue;
            }
            
            // 修正：直接从 Data 中获取状态，不需要两层 Data
            // 之前的错误日志显示 statusResult.Data.Data 是 undefined，说明只有一层 Data
            const statusStr = statusResult.Data.StatusStr;
            
            if (statusStr === "success") {
                // 优先使用 ResultDetail，它通常包含结构化的句子信息
                if (statusResult.Data.ResultDetail && Array.isArray(statusResult.Data.ResultDetail)) {
                    logFn("获取到 ResultDetail 结构化数据");
                    resultData = statusResult.Data.ResultDetail;
                } else {
                    logFn("未找到 ResultDetail，使用 Result 文本数据");
                    resultData = statusResult.Data.Result;
                }
                break;
            } else if (statusStr === "failed") {
                throw new Error(`识别失败: ${statusResult.Data.ErrorMsg}`);
            }
            
            if (i % 5 === 0) logFn(`识别中... (${statusStr})`);
        }

        if (!resultData) {
            throw new Error("识别超时。");
        }
        logFn("识别完成！");

        // --- 步骤 5: 生成 SRT 字幕文件 ---
        logFn("正在生成字幕文件...");
        
        // 强制字幕从 0 开始，不使用序列偏移
        // const offsetStr = await evalScriptPromised(csInterface, "getSequenceInPoint()");
        // const offsetSeconds = parseFloat(offsetStr) || 0;
        const offsetSeconds = 0;
        logFn(`序列入点偏移: ${offsetSeconds} 秒 (强制为0)`);
        
        // 解析 ASR 结果
        let sentenceList = [];
        
        if (Array.isArray(resultData)) {
            // 已经是数组（来自 ResultDetail），需要映射字段名
            // ResTextFormat: 3 返回字段: StartMs, EndMs, FinalSentence
            sentenceList = resultData.map(item => ({
                StartTime: item.StartMs,
                EndTime: item.EndMs,
                Text: item.FinalSentence
            }));
        } else if (typeof resultData === 'string') {
            // 尝试解析自定义文本格式: [0:0.000,1:0.300]  文本内容
            logFn("尝试解析文本格式结果...");
            const lines = resultData.split('\n');
            const timeRegex = /\[(\d+):(\d+\.\d+),(\d+):(\d+\.\d+)\]\s+(.*)/;
            
            for (const line of lines) {
                const match = line.match(timeRegex);
                if (match) {
                    // 解析时间 MM:SS.mmm -> ms
                    const startMin = parseInt(match[1]);
                    const startSec = parseFloat(match[2]);
                    const endMin = parseInt(match[3]);
                    const endSec = parseFloat(match[4]);
                    const text = match[5];
                    
                    const startTime = (startMin * 60 + startSec) * 1000;
                    const endTime = (endMin * 60 + endSec) * 1000;
                    
                    sentenceList.push({
                        StartTime: startTime,
                        EndTime: endTime,
                        Text: text
                    });
                }
            }
            
            if (sentenceList.length === 0) {
                // 如果正则没匹配到，尝试 JSON.parse
                try {
                    const parsed = JSON.parse(resultData);
                    if (Array.isArray(parsed)) sentenceList = parsed;
                    else if (parsed.Sentences) sentenceList = parsed.Sentences;
                } catch(e) {
                    logFn("文本解析失败，无法生成时间轴");
                }
            }
        }

        if (sentenceList.length === 0) {
            logFn("警告: 无法提取有效的字幕数据，生成空字幕");
            logFn("原始数据: " + (typeof resultData === 'string' ? resultData.substring(0, 200) : "Object"));
        }
        
        // 调用生成器生成 SRT 内容
        
        // 调用生成器生成 SRT 内容
        const srtContent = srtGenerator.generateSRT(sentenceList, offsetSeconds);
        
        // 获取项目名称 (增加容错处理)
        let projectName = "Project";
        try {
            const nameResult = await evalScriptPromised(csInterface, "getProjectName()");
            // 如果函数不存在或执行失败，CSInterface 可能会返回 "EvalScript error."
            if (nameResult && nameResult.indexOf("EvalScript error") === -1) {
                projectName = nameResult;
            }
        } catch (e) {
            logFn("获取项目名称失败，使用默认名称");
        }

        // 过滤非法文件名字符
        const safeProjectName = projectName.replace(/[\\/:*?"<>|]/g, "_");
        const srtPath = path.join(path.dirname(audioPath), `${safeProjectName}.srt`);
        
        fs.writeFileSync(srtPath, srtContent, 'utf8');
        logFn(`SRT 文件已保存: ${srtPath}`);

        // --- 步骤 6: 导入 Premiere Pro ---
        logFn("正在导入字幕到 Premiere Pro...");
        const safeSrtPath = srtPath.replace(/\\/g, '\\\\');
        try {
            await evalScriptPromised(csInterface, `importSRT("${safeSrtPath}")`);
        } catch (importErr) {
            throw new Error(`导入 SRT 失败: ${importErr.message}`);
        }

        // --- 清理工作 ---
        // 删除本地临时音频文件
        try { fs.unlinkSync(audioPath); } catch(e) {}
        
        // 删除云端 COS 文件 (节省存储费用)
        try {
             cos.deleteObject({
                 Bucket: config.bucket,
                 Region: config.region,
                 Key: cosKey
             }, function(err, data) {});
         } catch(e) {}

    } catch (err) {
        throw err;
    }
}

module.exports = {
    run: run
};

module.exports = {
    run: run
};