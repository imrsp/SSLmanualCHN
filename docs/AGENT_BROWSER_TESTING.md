# Playwright 浏览器测试流程（针对 SSLmanualCHN 项目）

## 1. 安装

```bash
cd <项目目录>
npm install --no-save playwright
npx playwright install chromium
```

注意: 系统已安装的 Chromium 版本可能与 npm 刚装的 playwright 版本不一致，此时 `launch()` 会报错找不到浏览器。解决方案是在 `launch()` 中指定 `executablePath`。

## 2. 启动开发服务器

```bash
killall node 2>/dev/null
PORT=4174 node scripts/serve.mjs &
sleep 2
```

或者嵌入 Node.js HTTP server 到 JS REPL 里（端口自选，避免冲突）。

## 3. 定位 Chrome/Chromium 可执行文件

先找到 Playwright 缓存的浏览器：

```bash
# 查看缓存目录
ls ~/Library/Caches/ms-playwright/

# 找到真正的可执行文件（macOS 上一般是 .app 包内的）
find ~/Library/Caches/ms-playwright -name "Google Chrome for Testing" -type f 2>/dev/null
find ~/Library/Caches/ms-playwright -name "chrome-headless-shell" -type f 2>/dev/null
```

典型路径:
- 完整浏览器: `~/Library/Caches/ms-playwright/chromium-<修订号>/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
- 无头壳: `~/Library/Caches/ms-playwright/chromium_headless_shell-<修订号>/chrome-headless-shell-mac-arm64/chrome-headless-shell`

## 4. 启动 Playwright 并导航到页面

重点: 在 `mcp__node_repl__js` 中用 `var` 替代 `const`，避免跨调用重复声明报错。

```javascript
var { chromium } = await import("playwright");
var browser = await chromium.launch({
  headless: true,
  executablePath: "上一步找到的完整浏览器路径"
});
var context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
var page = await context.newPage();

await page.goto("http://127.0.0.1:4174/");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1000);
```

## 5. 导航到特定章节

项目是 SPA，通过点击 `.nav-link` 按钮切换页面:

```javascript
await page.evaluate(() => {
  var links = document.querySelectorAll(".nav-link");
  for (var i = 0; i < links.length; i++) {
    if (links[i].textContent.includes("LAN-009")) {
      links[i].click();
      break;
    }
  }
});
await page.waitForTimeout(2000);  // 等渲染
```

## 6. 检查元素渲染样式

```javascript
var h2Styles = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".manual-content h2")).slice(0,3).map(function(h) {
    var cs = window.getComputedStyle(h);
    return {
      text: h.textContent,
      fontFamily: cs.fontFamily.slice(0,40),
      fontSize: cs.fontSize,
      color: cs.color
    };
  });
});
```

常用检查项: `h2`、`h3`、`p`、`table td/th`、`img`、`ol/ul li`、`.lan-document-*` 类元素。

## 7. 截取全页截图

截图路径建议用项目内路径:

```javascript
var screenshotPath = process.cwd() + "/tmp/screenshot.png";
await page.screenshot({ path: screenshotPath, fullPage: true });
```

## 8. 收尾

```javascript
await browser.close();
server.close();  // 如果用嵌入 server
```
