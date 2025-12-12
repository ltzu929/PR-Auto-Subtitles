var csInterface = new CSInterface();

/**
 * 辅助函数：加载 Node.js 模块
 * 兼容 Mixed Context 和非 Mixed Context 模式
 * @param {string} module - 模块名称
 */
function requireNode(module) {
    if (typeof window.require === 'function') {
        // Mixed Context 模式下，require 直接挂载在 window 上
        return window.require(module);
    } else if (window.cep && window.cep.node && window.cep.node.require) {
        // 传统模式
        return window.cep.node.require(module);
    } else {
        throw new Error("无法找到 Node.js require 函数");
    }
}

/**
 * 日志输出函数
 * 将信息追加到界面上的日志区域，并自动滚动到底部
 * @param {string} msg - 要显示的日志信息
 */
function log(msg) {
    var logDiv = document.getElementById("logContent");
    logDiv.innerText += "\n" + msg;
    logDiv.scrollTop = logDiv.scrollHeight;
}

/**
 * 页面初始化
 * 绑定按钮事件，加载已保存的配置，并刷新轨道列表
 */
window.onload = function() {
    loadConfig();
    // refreshTracks(); // 不再需要

    document.getElementById("btnSave").addEventListener("click", saveConfig);
    // document.getElementById("btnRefresh").addEventListener("click", refreshTracks); // 不再需要
    document.getElementById("btnStart").addEventListener("click", startProcess);

    // 绑定外部链接点击事件
    var links = document.querySelectorAll(".external-link");
    for (var i = 0; i < links.length; i++) {
        links[i].addEventListener("click", function(e) {
            e.preventDefault();
            var url = this.getAttribute("data-url");
            if (url) {
                csInterface.openURLInDefaultBrowser(url);
            }
        });
    }
};

/**
 * 从 localStorage 加载用户配置
 * 如果存在配置，则填充到输入框中
 */
function loadConfig() {
    var config = JSON.parse(localStorage.getItem("tencentConfig") || "{}");
    document.getElementById("secretId").value = config.secretId || "";
    document.getElementById("secretKey").value = config.secretKey || "";
    document.getElementById("bucket").value = config.bucket || "";
    document.getElementById("region").value = config.region || "";

    // 加载高级设置
    document.getElementById("engineModelType").value = config.engineModelType || "16k_zh";
    document.getElementById("hotwordId").value = config.hotwordId || "";
    document.getElementById("convertNumMode").value = config.convertNumMode || "1";
    document.getElementById("removePunctuation").checked = config.removePunctuation || false;
}

/**
 * 保存用户配置到 localStorage
 * 这样用户下次打开插件时无需重新输入
 */
function saveConfig() {
    var config = {
        secretId: document.getElementById("secretId").value,
        secretKey: document.getElementById("secretKey").value,
        bucket: document.getElementById("bucket").value,
        region: document.getElementById("region").value,
        
        // 保存高级设置
        engineModelType: document.getElementById("engineModelType").value,
        hotwordId: document.getElementById("hotwordId").value,
        convertNumMode: document.getElementById("convertNumMode").value,
        removePunctuation: document.getElementById("removePunctuation").checked
    };
    localStorage.setItem("tencentConfig", JSON.stringify(config));
    log("配置已保存");
}

/**
 * 刷新轨道列表
 * 通过 CSInterface 调用 Host 脚本 (ExtendScript) 中的 getAudioTracks 函数
 */
function refreshTracks() {
    log("正在获取轨道...");
    // evalScript 是异步的，结果通过回调函数返回
    csInterface.evalScript("getAudioTracks()", function(result) {
        if (!result || result === "undefined") {
            log("错误：无法获取轨道信息");
            return;
        }
        
        try {
            // Host 脚本返回的是 JSON 字符串，需要解析
            var tracks = JSON.parse(result);
            var select = document.getElementById("trackSelect");
            select.innerHTML = "";
            
            // 动态生成下拉菜单选项
            tracks.forEach(function(track) {
                var option = document.createElement("option");
                option.value = track.index;
                option.text = track.name;
                select.appendChild(option);
            });
            log("轨道列表已更新");
        } catch (e) {
            log("解析轨道数据失败: " + e.message);
        }
    });
}

/**
 * 开始处理流程
 * 这是插件的核心入口，负责校验配置并启动后端 Node.js 流程
 */
function startProcess() {
    // var trackIndex = document.getElementById("trackSelect").value;
    // if (trackIndex === "-1" || trackIndex === "") {
    //     alert("请先选择一个音频轨道！");
    //     return;
    // }

    var config = JSON.parse(localStorage.getItem("tencentConfig") || "{}");
    if (!config.secretId || !config.secretKey || !config.bucket) {
        alert("请先完善并保存腾讯云配置！");
        return;
    }

    log("=== 开始任务 ===");
    
    // 1. 禁用按钮防止重复点击
    document.getElementById("btnStart").disabled = true;

    try {
        // DEBUG: 打印环境信息
        log("环境检查:");
        log("window.require: " + (typeof window.require));
        log("window.cep.node: " + (window.cep ? typeof window.cep.node : "cep undefined"));
        
        log("正在加载 path 模块...");
        var path = requireNode('path');
        
        var extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
        log("插件根目录: " + extensionRoot);

        var serverScriptPath = path.join(extensionRoot, 'server', 'main-process.js');
        log("后端脚本路径: " + serverScriptPath);
        
        // 检查文件是否存在
        var fs = requireNode('fs');
        if (!fs.existsSync(serverScriptPath)) {
            log("错误: 找不到后端脚本文件！请检查 server 目录。");
            document.getElementById("btnStart").disabled = false;
            return;
        }

        log("正在加载后端模块...");
        
        // 清除 Node.js 模块缓存
        try {
            // 注意：在 Mixed Context 下，require.resolve 可能行为不同
            // 这里简单尝试，如果失败不影响流程
            if (typeof window.require === 'function') {
                 delete require.cache[require.resolve(serverScriptPath)];
            } else {
                 var moduleName = window.cep.node.require.resolve(serverScriptPath);
                 delete window.cep.node.global.require.cache[moduleName];
            }
        } catch(e) {
            // 忽略清除缓存的错误
        }
        
        // 加载主流程模块
        var mainProcess = requireNode(serverScriptPath);
        log("后端模块加载成功，准备执行...");
        
        // 3. 调用后端的 run 方法启动任务
        mainProcess.run(csInterface, config, log)
            .then(function() {
                log("=== 任务完成 ===");
                alert("字幕生成并导入成功！");
            })
            .catch(function(err) {
                log("执行过程出错: " + err.message);
                if (err.stack) log(err.stack);
                alert("任务失败: " + err.message);
            })
            .finally(function() {
                // 无论成功失败，最后都要恢复按钮状态
                document.getElementById("btnStart").disabled = false;
            });

    } catch (e) {
        log("加载脚本阶段发生异常: " + e.message);
        if (e.stack) log(e.stack);
        document.getElementById("btnStart").disabled = false;
    }
}
