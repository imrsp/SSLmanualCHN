# 部署指南

## 构建

部署前先运行：

```bash
npm run check
```

发布目录为 `dist/`。站点使用 Hash 路由和相对资源路径，可部署在域名根目录或任意子目录，不需要服务器重写规则。

无需启动服务器时，也可以直接打开 `dist/index.html`。请保留整个 `dist/` 目录结构，不要只复制单个 HTML。

PWA 安装和 service worker 只在 `https`、`localhost` 或 `127.0.0.1` 上工作；`file://` 只作为本地直开回退，不会进入安装态。

## 缓存模型

当前构建产物按缓存策略分类：

- `index.html`：短缓存或禁止缓存。
- `seo/*.html`：预渲染页面，禁止缓存。
- `src/app.<hash>.js`、`src/styles.<hash>.css`：应用壳，不可变长缓存（365d，`immutable`）。
- `data/*.json`、`themes/*.css`：构建哈希参数使缓存失效，可长缓存（365d）。
- `manifest.webmanifest` 和 `sw.js`：禁止缓存，保证安装元数据和 SW 更新及时生效。
- `robots.txt`、`sitemap.xml`：搜索引擎发现文件，短缓存（1d）。
- `assets/manual/`：手册图片和 PDF，中等缓存（30d）。
- 其他静态资源：通用回退规则，中等缓存（30d）。

构建时还会给数据请求附带 `__BUILD_HASH__` 参数，用于浏览器更新时失效旧缓存。

### 推荐的 SW 分层策略

站点是静态发布形态，默认应尽量保留缓存收益，只对“会直接影响新版本可见性”的资源做主动更新：

- `data/catalog.json`：`networkFirst`，因为它决定目录、章节列表和新页面是否可见。
- `data/themes.json`：`networkFirst`，因为它只影响主题预设列表，体积小且应尽快反映新构建。
- `data/search-index-en.json`、`data/search-index-zh.json`：`cacheFirst`，优先保留搜索体验速度，版本更新由构建哈希和 SW 换代兜底。
- `data/pages/*.json`：`cacheFirst`，正文分片按需加载，优先吃缓存。
- `themes/*.css`：`cacheFirst`，主题样式是典型静态资源，构建哈希已能保证换版。
- `src/*.js`、`src/*.css`：`cacheFirst`，文件名已哈希化，更新依赖新构建产物本身。

应用启动时会读取 `window.__BUILD_HASH__` 并与本地记录的上一次版本比较；只有构建哈希变化时，才主动触发一次 Service Worker `update()` 检查。这个做法适合 iOS PWA 这类对缓存切换较慢的环境，同时不会让同版本页面重复打扰用户。

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

> **部署前替换占位符：** 将 `content/seo.json` 中的 `https://<domain>/` 替换为实际域名，替换 `public/robots.txt` 中的 sitemap 路径。

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
- 搜索索引按需加载，不在首屏下载。
- 主题预设列表单独加载。
- 图片与 PDF 独立缓存，不再内嵌到 HTML。
- `sw.js` 会预缓存应用壳与核心元数据，并在访问过的页面分片和站点静态资源上做运行时缓存，以支持离线回访。更新后的 SW 会在下次进入站点时自动接管。
- `file://` 本地打开时，阅读器回退到同内容的 `.js` 数据文件。
 - `seo/*.html` 预渲染页面供搜索引擎爬虫直接读取正文，附带 SPA 重定向。`sitemap.xml` 和 `robots.txt` 帮助搜索引擎发现所有页面索引。
 
 ## 搜索引擎配置
 
 部署后建议在 Google Search Console 和 Bing Webmaster Tools 中提交 `sitemap.xml` URL，并验证站点所有权。
 
 当前 SEO 规则：
 
 - 所有中文页面允许被索引（`index, follow`）。
 - 英文版内容不单独设 URL，未标记 `hreflang="en"`，不被索引。
 - `robots.txt` 禁止抓取 `data/`、`themes/`、`src/` 目录。
 - `data/`、`themes/` 和 `seo/` 目录建议配置短缓存策略。
