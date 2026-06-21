# 部署指南

## 构建

```bash
npm run check
```

部署目录为 `dist/`。站点使用 Hash 路由和相对资源路径，可部署在域名根目录或任意子目录，不需要服务器重写规则。

无需启动服务器时，也可以直接打开 `dist/index.html`。请保留整个 `dist/`
目录结构，不要只复制 `index.html`。

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

    # index.html: always fetch fresh, never cache
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Data files (catalog, pages, search index): no-cache
    location /data/ {
        expires -1;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    # Hashed JS/CSS (app.<hash>.js, styles.<hash>.css): immutable per build
    location ~* \.(?:js|css)$ {
        expires 300d;
        add_header Cache-Control "public, immutable";
    }

    # Static assets: fonts, images, favicons
    location ~* \.(?:png|jpg|jpeg|gif|svg|webp|pdf|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

将 `dist/` 内的文件同步到 `/srv/ssl-live-manual/`。

## Caddy

```caddy
manual.example.com {
    root * /srv/ssl-live-manual
    file_server
}
```

## 对象存储与 Pages

上传 `dist/` 的内容并启用静态网站托管即可。建议开启 Brotli 或 gzip；HTML 使用短缓存，带版本发布的静态资源可使用较长缓存。

## 性能特征

- 首次加载只请求界面、目录和当前章节。
- 下一章节会在空闲网络请求中预取。
- 全文索引仅在首次搜索时加载。
- 图片与 PDF 独立缓存，不再以 Base64 嵌入 HTML。
