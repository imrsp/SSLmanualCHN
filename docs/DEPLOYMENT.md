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

当前构建产物分三类：

- `index.html`：短缓存或禁止缓存。
- `src/app.<hash>.js`、`src/styles.<hash>.css`：可长缓存。
- `data/*.json`、`themes/*.css`：建议短缓存或协商缓存，因为它们随内容和主题变更而更新。
- `manifest.webmanifest` 和 `sw.js`：应使用短缓存或禁止缓存，保证安装元数据和 SW 更新及时生效。

构建时还会给数据请求附带 `__BUILD_HASH__` 参数，用于浏览器更新时失效旧缓存。

## Nginx

```nginx
server {
    listen 80;
    server_name manual.example.com;
    root /srv/ssl-live-manual;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location = /index.html {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location = /manifest.webmanifest {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location = /sw.js {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /data/ {
        expires -1;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location /themes/ {
        expires -1;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location ~* ^/src/(?:app|styles)\.[a-f0-9]{12}\.(?:js|css)$ {
        expires 300d;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.(?:png|jpg|jpeg|gif|svg|webp|pdf|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

将 `dist/` 内容同步到 `/srv/ssl-live-manual/` 即可。

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
- `sw.js` 会缓存已访问过的页面分片和站点静态资源，以支持离线回访。更新后的 SW 会在下次进入站点时自动接管。
- `file://` 本地打开时，阅读器回退到同内容的 `.js` 数据文件。
