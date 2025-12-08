/**
 * CSInterface - v9.4.0
 * Simplified version for Auto Subtitles Plugin
 */
function CSInterface() {}

CSInterface.prototype.hostEnvironment = window.__adobe_cep__ ? JSON.parse(window.__adobe_cep__.getHostEnvironment()) : null;

CSInterface.prototype.getHostEnvironment = function() {
    this.hostEnvironment = JSON.parse(window.__adobe_cep__.getHostEnvironment());
    return this.hostEnvironment;
};

CSInterface.prototype.closeExtension = function() {
    window.__adobe_cep__.closeExtension();
};

CSInterface.prototype.getSystemPath = function(pathType) {
    var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
    var OSVersion = this.getOSInformation();
    if (OSVersion.indexOf("Windows") >= 0) {
        path = path.replace("file:///", "");
    } else if (OSVersion.indexOf("Mac") >= 0) {
        path = path.replace("file://", "");
    }
    return path;
};

CSInterface.prototype.evalScript = function(script, callback) {
    if(callback === null || callback === undefined) {
        callback = function(result){};
    }
    window.__adobe_cep__.evalScript(script, callback);
};

CSInterface.prototype.getOSInformation = function() {
    var userAgent = navigator.userAgent;
    if ((navigator.platform == "Win32") || (navigator.platform == "Windows")) {
        return "Windows";
    } else if ((navigator.platform == "MacIntel") || (navigator.platform == "Macintosh")) {
        return "Mac OS X";
    }
    return "Unknown Operation System";
};

CSInterface.prototype.openURLInDefaultBrowser = function(url) {
    return cep.util.openURLInDefaultBrowser(url);
};

CSInterface.prototype.addEventListener = function(type, listener, obj) {
    window.__adobe_cep__.addEventListener(type, listener, obj);
};

CSInterface.prototype.removeEventListener = function(type, listener, obj) {
    window.__adobe_cep__.removeEventListener(type, listener, obj);
};

// SystemPath constants
var SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication"
};
