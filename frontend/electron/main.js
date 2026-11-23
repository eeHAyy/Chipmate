const { app, BrowserWindow, dialog } = require("electron");
const crypto = require("crypto");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let pythonProcess;
let quitting = false;

// 本机访问令牌：每次启动随机生成，注入后端与渲染进程，避免局域网/本机网页盗用接口
const LOCAL_TOKEN = process.env.CHIPMATE_TOKEN || crypto.randomBytes(24).toString("base64url");

function startBackend() {
  let cmd, args, cwd;
  if (app.isPackaged) {
    cwd = path.join(process.resourcesPath, "backend");
    cmd = path.join(cwd, "chipmate-backend.exe");
    args = [];
  } else {
    cwd = path.join(__dirname, "..", "..", "backend");
    cmd = "python";
    args = [path.join(cwd, "main.py")];
  }
  pythonProcess = spawn(cmd, args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, CHIPMATE_TOKEN: LOCAL_TOKEN }
  });
  pythonProcess.stdout.on("data", d => console.log("[backend]", d.toString().trim()));
  pythonProcess.stderr.on("data", d => console.log("[backend]", d.toString().trim()));
  pythonProcess.on("error", err => notifyBackendFailed("后端进程无法启动：" + err.message));
  pythonProcess.on("exit", code => {
    if (!quitting) notifyBackendFailed(`后端进程已退出（code ${code}）。如果端口 8720 被占用，或安装目录被安全软件拦截，会出现这种情况。`);
  });
}

function notifyBackendFailed(detail) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dialog.showMessageBox(mainWindow, {
    type: "error",
    title: "ChipMate 后端未启动",
    message: "界面能打开，但本地服务没起来，AI 对话、串口、烧录都用不了。",
    detail: detail + "\n\n可以这样排查：\n1. 确认没有另一个 ChipMate 实例在运行\n2. 检查 8720 端口是否被占用（netstat -ano | findstr 8720）\n3. 把安装目录加入杀毒软件白名单后重开",
    buttons: ["知道了"]
  }).catch(() => {});
}

function waitForBackend(retries = 30) {
  return new Promise((resolve) => {
    const check = () => {
      const http = require("http");
      http.get("http://127.0.0.1:8720/health", (res) => {
        if (res.statusCode === 200) resolve(true);
        else if (--retries > 0) setTimeout(check, 500);
        else resolve(false);
      }).on("error", () => {
        if (--retries > 0) setTimeout(check, 500);
        else resolve(false);
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: "hiddenInset",
    frame: process.platform !== "win32"
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5174");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  process.env.CHIPMATE_TOKEN = LOCAL_TOKEN;
  createWindow();
  startBackend();
  const ok = await waitForBackend();
  if (!ok) notifyBackendFailed("等待 15 秒仍未连上 127.0.0.1:8720。");
});

app.on("window-all-closed", () => {
  quitting = true;
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  if (pythonProcess) pythonProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
