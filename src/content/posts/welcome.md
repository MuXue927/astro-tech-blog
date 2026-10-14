---
title: "Welcome to My Tech Notes"
date: 2026-10-15T00:00:00+08:00
description: "A launch note for this AstroPaper-powered technical blog."
tags:
  - Astro
  - GitHub
  - Vercel
---

This blog is built with AstroPaper and generated as a fully static site.

## What is ready

- GitHub-flavored Markdown tables and task lists
- Light and dark code themes
- Code block titles, line highlighting, and copy buttons
- Content Collections with typed frontmatter

## Code block example

```ts title="src/content.config.ts" showLineNumbers
const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/posts" }),
  // schema validation lives here
});
```

## GFM example

| Feature    | Status    |
| ---------- | --------- |
| Tables     | Supported |
| Task lists | Supported |
| Footnotes  | Supported |

- [x] Configure the posts collection
- [x] Add Shiki highlighting
- [ ] Publish the first article

Markdown footnotes also work.[^1]

[^1]: This note is rendered by Astro's Markdown pipeline.
