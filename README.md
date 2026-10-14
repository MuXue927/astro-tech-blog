# MuXue Tech Notes

这是一个个人技术笔记与分享博客，用来记录我感兴趣的技术内容、工具使用经验和学习过程。

本站不是求职项目。我的求职项目是：

https://github.com/MuXue927/supply-chain-optimization-portfolio

## 技术栈

- Astro
- AstroPaper
- TypeScript / JavaScript
- Tailwind CSS
- Shiki
- Pagefind

## 本地运行

```powershell
pnpm install
pnpm dev
```

## 构建

```powershell
pnpm build
```

构建结果位于 `dist/`。

## 内容结构

文章放在：

```text
src/content/posts/
```

图片放在：

```text
public/images/
```

## 文章 Frontmatter

```yaml
---
title: "文章标题"
date: 2026-10-15T00:00:00+08:00
description: "文章简介"
tags:
  - 标签
---
```

## 部署

项目可以通过 Vercel 导入 GitHub 仓库并自动部署：

- Install Command: `pnpm install`
- Build Command: `pnpm build`
- Output Directory: `dist`

## 署名

This project is based on AstroPaper by Sat Naing.

- AstroPaper: https://github.com/satnaing/astro-paper
- License: MIT

The original MIT license is preserved in the `LICENSE` file.
