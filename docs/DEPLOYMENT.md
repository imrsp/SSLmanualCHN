# 部署指南

## 构建

部署前先运行：

```bash
npm run check
```

发布目录为 `dist/`。站点使用 Hash 路由和相对资源路径，可部署在域名根目录或任意子目录，不需要服务器重写规则。

无需启动服务器时，也可以直接打开 `dist/index.html`。请保留整个 `dist/` 目录结构，不要只复制单个 HTML。

PWA 安装和 service worker 只在 `https`、`localhost` 或 `127.0.0.1` 上工作；`file://` 只作为本地直开回退，不会进入安装态。

## GitHub Release

合并正式版本改动并更新 `CHANGELOG.md` 后，在 `main` 的发布提交上推送稳定版本标签：

```bash
git switch main
git pull --ff-only
git tag v1.0.1
git push origin v1.0.1
```

`.github/workflows/release.yml` 会确认标签符合 `vX.Y.Z` 格式且标签提交属于远端 `main`，随后运行完整的 `npm run check`。检查通过后，工作流会：

- 将 `dist/` 的内容打包为 `SSLmanualCHN-vX.Y.Z.zip`，并让 `index.html` 位于压缩包根目录
- 从 `CHANGELOG.md` 精确提取同版本的完整段落作为 Release 内容
- 使用同一版本号作为 Git tag 和 Release 标题
- 通过仓库自带的 `GITHUB_TOKEN` 创建 Release，无需额外配置 secret

如果标签没有对应的 changelog 标题、标签格式不正确、标签提交不属于 `main` 或完整检查失败，Release 不会创建。标签应在包含本工作流的提交合并到 `main` 后再推送。

## 缓存模型

当前构建产物按缓存策略分类：

- `index.html`：短缓存或禁止缓存。
- `seo/*.html`：预渲染页面，禁止缓存。
- `src/app.<hash>.js`、`src/styles.<hash>.css`：应用壳，不可变长缓存（365d，`immutable`）。
- `assets/fonts/*.<hash>.woff2`：字体子集，不可变长缓存（365d，`immutable`）；字体内容变化时，文件名和引用它的样式表哈希都会同步变化。
- `data/*.json`、`themes/*.css`：构建哈希参数使缓存失效，可长缓存（365d）。
- `manifest.webmanifest` 和 `sw.js`：禁止缓存，保证安装元数据和 SW 更新及时生效。
- `robots.txt`、`sitemap.xml`：搜索引擎发现文件，短缓存（1d）。
- `assets/manual/`：手册图片和 PDF，中等缓存（30d）。
- 其他静态资源：通用回退规则，中等缓存（30d）。

构建时还会给数据请求和 Service Worker 脚本附带 `__BUILD_HASH__` 参数。该参数保留在数据缓存键中，用于在浏览器更新时失效旧缓存；catalog 生成时间和 sitemap 的 `lastmod` 等非内容字段会在哈希计算时归一化，保证相同内容输入生成相同版本。

### 推荐的 SW 分层策略

站点是静态发布形态，默认应尽量保留缓存收益，只对“会直接影响新版本可见性”的资源做主动更新：

- `data/catalog.json`：`networkFirst`，因为它决定目录、章节列表和新页面是否可见。
- `data/themes.json`：`networkFirst`，因为它只影响主题预设列表，体积小且应尽快反映新构建。
- `data/search-index-en.json`、`data/search-index-zh.json`：`cacheFirst`，优先保留搜索体验速度，版本更新由构建哈希和 SW 换代兜底。
- `data/pages/*.json`：`cacheFirst`，正文分片按需加载，优先吃缓存。
- `themes/*.css`：`cacheFirst`，主题样式是典型静态资源，构建哈希已能保证换版。
- `src/*.js`、`src/*.css`：`cacheFirst`，文件名已哈希化，更新依赖新构建产物本身。

应用启动时会先并行加载 catalog、主题列表和当前章节，完成正文首次绘制后，再在浏览器空闲阶段使用带构建哈希的 `sw.js` URL 注册或更新 Service Worker。已有旧版 Service Worker 接管页面时，新版 controller 的准备过程不再阻塞正文；更新超时或失败不会被记录为成功，下一次进入站点仍会重试。首次访问、版本换代和离线访问都不会为等待 Service Worker 而阻塞正文加载。

缓存命名空间同时包含 Service Worker scope 路径；同一域名下的正式版与 beta 子路径各自清理自己的旧缓存，不会互相删除离线数据。

## Nginx

以下为带 SSL 和 gzip 的完整配置。项目缓存规则集中在 `# === SSL Live Manual Cache Policy START/END ===` 块内。

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name manual.example.com;
    root /srv/ssl-live-manual;
    index index.html;

    # HTTP → HTTPS 强制跳转
    if ($server_port !~ 443){
        rewrite ^(/.*)$ https://$host$1 permanent;
    }

    ssl_certificate    /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+AES128:RSA+AES128:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000";

    # Compression（通用优化）
    gzip on;
    gzip_vary on;
    gzip_disable "msie6";
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_http_version 1.1;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml
        font/ttf
        font/otf
        font/woff
        font/woff2;

    # === SSL Live Manual Cache Policy START ===

    # HTML 入口与预渲染页：禁止缓存
    location = / {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
    }
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
    }
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
    }

    # PWA 安装元数据与 Service Worker：禁止缓存（SW 更新需立即生效）
    location = /manifest.webmanifest {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }
    location = /sw.js {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }

    # SEO 发现文件：短缓存
    location = /robots.txt {
        expires 1d;
        add_header Cache-Control "public, max-age=86400" always;
    }
    location = /sitemap.xml {
        expires 1d;
        add_header Cache-Control "public, max-age=86400" always;
    }

    # SEO 预渲染页面：禁止缓存（内容随构建更新）
    location /seo/ {
        expires -1;
        add_header Cache-Control "no-cache, must-revalidate" always;
    }

    # 数据文件：构建哈希参数使缓存失效，可长缓存
    location ~* ^/data/.*\.(json|js)$ {
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    # 主题 CSS：同上
    location ~* ^/themes/.*\.css$ {
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    # 应用壳（已哈希命名）：不可变长缓存
    location ~* ^/src/.*\.(js|css)$ {
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    # 字体子集（已哈希命名）：不可变长缓存
    location ^~ /assets/fonts/ {
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    # 手册图片与 PDF：中等缓存
    location ~* ^/assets/manual/.*\.(gif|jpg|jpeg|png|bmp|swf|svg|webp|ico|pdf)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000" always;
        access_log off;
    }

    # === SSL Live Manual Cache Policy END ===

    # 通用回退：不被上述规则匹配的静态资源
    location ~ .*\.(gif|jpg|jpeg|png|bmp|swf)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000" always;
        error_log /dev/null;
        access_log off;
    }
    location ~ .*\.(js|css)?$ {
        expires 12h;
        add_header Cache-Control "public, max-age=43200" always;
        error_log /dev/null;
        access_log off;
    }

    # 安全限制
    location ~ ^/(\.user.ini|\.htaccess|\.git|\.svn|\.project|LICENSE|README.md) {
        return 404;
    }
    location ~ \.well-known {
        allow all;
    }

    access_log /var/log/nginx/manual.example.com.log;
    error_log /var/log/nginx/manual.example.com.error.log;
}
```

将 `dist/` 内容同步到 document root（如 `/srv/ssl-live-manual/`）即可。

部署 URL、description、keywords 和 OG 图片统一维护在 `content/seo.json`。构建会将这些字段注入 `dist/index.html`、所有 SEO 预渲染页面，并动态生成 `dist/robots.txt`；部署前不再执行字符串替换。

GitHub Actions 部署会拒绝空路径、根目录、常见系统目录、SSH 用户主目录及包含危险字符的目标，并在远端解析真实路径后再次校验。正式版与 beta 部署共享并发互斥组，避免两个 `rsync --delete-delay` 过程交错。

## Caddy

```caddy
manual.example.com {
    root * /srv/ssl-live-manual
    file_server
}
```

如需更细缓存控制，再单独补 header 规则。

## 对象存储与 Pages

上传 `dist/` 的全部内容并启用静态网站托管即可。建议开启 Brotli 或 gzip。

## 运行特征

- 首次加载请求界面壳、catalog 和当前章节。
- catalog、主题列表和当前章节在启动阶段并行请求；每章首次绘制后的空闲阶段再预取下一章。
- 搜索索引按需加载，不在首屏下载。
- 主题预设列表单独加载。
- 图片与 PDF 独立缓存，不再内嵌到 HTML。
- `sw.js` 会预缓存应用壳与核心元数据，并在访问过的页面分片和站点静态资源上做运行时缓存，以支持离线回访。更新后的 SW 会在下次进入站点时自动接管。
- `file://` 本地打开时，阅读器回退到同内容的 `.js` 数据文件。
 - `seo/*.html` 预渲染页面供搜索引擎爬虫直接读取正文，附带 SPA 重定向。`sitemap.xml` 和 `robots.txt` 帮助搜索引擎发现所有页面索引。
 
 ## 搜索引擎配置
 
 部署后建议在 Google Search Console 和 Bing Webmaster Tools 中提交 `sitemap.xml` URL，并验证站点所有权。
 
 当前 SEO 规则：
 
 - 中文页面默认允许被索引；`content/seo.json` `noindexPageIds` 中的页面使用 `noindex, follow`，并从 sitemap 排除。
 - 英文版内容不单独设 URL，未标记 `hreflang="en"`，不被索引。
 - `robots.txt` 禁止抓取 `data/`、`themes/`、`src/` 目录。
 - `data/`、`themes/` 使用带构建哈希的长缓存；`seo/` 禁止缓存，确保预渲染正文随发布及时更新。
