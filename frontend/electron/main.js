const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let pythonProcess;

function startBackend() {
  const pythonPath = "python";
  const mainPy = path.join(__dirname, "..", "..", "backend", "main.py");
  pythonProcess = spawn(pythonPath, [mainPy], {
    cwd: path.join(__dirname, "..", "..", "backend"),
    stdio: "pipe"
  });
  pythonProcess.stdout.on("data", d => console.log("[backend]", d.toString().trim()));
  pythonProcess.stderr.on("data", d => console.log("[backend]", d.toString().trim()));
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
  startBackend();
  await waitForBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (pythonProcess) pythonProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
