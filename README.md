# MuXue Tech Notes

Personal technical notes about operations research, Python engineering,
machine learning, deep learning, and AI agents.

**Live site:** https://astro-tech-blog-seven.vercel.app

## Highlights

- Markdown-first writing workflow
- Type-safe frontmatter with Astro Content Collections
- GitHub Flavored Markdown
- Shiki code highlighting with light and dark themes
- Code titles, line numbers, line highlighting, and copy buttons
- Static search with Pagefind
- RSS feed, sitemap, and automatic social images
- GitHub Actions for linting, formatting, and production builds
- Automatic deployment with Vercel

## Tech Stack

- Astro
- AstroPaper
- TypeScript / JavaScript
- Tailwind CSS
- Shiki
- Pagefind
- pnpm

## Requirements

- Node.js `22.13.0` or later
- pnpm `11.25.0` or later

## Development

```powershell
pnpm install
pnpm dev
```

The local development server runs at `http://localhost:4321`.

## Production Build

```powershell
pnpm build
```

The generated site is written to `dist/`.

## Content Structure

Posts:

```text
src/content/posts/
```

Images:

```text
public/images/
```

## Post Frontmatter

```yaml
---
title: "Article title"
date: 2026-10-15T00:00:00+08:00
description: "Short article description"
tags:
  - Astro
  - AI Agent
---
```

Use an explicit timezone for `date`, for example `+08:00`, to avoid posts being
treated as scheduled for a future time.

## Quality Checks

```powershell
pnpm format:check
pnpm lint
pnpm build
```

GitHub Actions runs the same checks on every push to `main` and on pull requests.

## Deployment

The repository is connected to Vercel. Pushing to `main` triggers a production
deployment automatically.

Vercel settings:

```text
Framework Preset: Astro
Install Command: pnpm install
Build Command: pnpm build
Output Directory: dist
```

## Scope

This repository is a personal technical blog for notes and experiments. My main
portfolio project is:

https://github.com/MuXue927/supply-chain-optimization-portfolio

## Attribution

This project is based on AstroPaper by Sat Naing.

- AstroPaper: https://github.com/satnaing/astro-paper
- License: MIT

The original MIT license is preserved in the `LICENSE` file. See
`THIRD_PARTY_NOTICES.md` for additional details.

## License and Content

The source code is licensed under the MIT License.

Blog articles and original images are copyright © MuXue927 unless otherwise
stated.
