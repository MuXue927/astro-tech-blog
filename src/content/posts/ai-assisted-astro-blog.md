---
title: "用 AI 搭建一套可长期维护的技术博客：AstroPaper + GitHub Actions + Vercel 实战"
date: 2026-10-15T03:30:00+08:00
description: "记录一次从环境冲突、内容集合、代码高亮、Git 规范化到 GitHub Actions 和 Vercel 部署的完整实践。"
tags:
  - AI 协作
  - Astro
  - GitHub
  - Vercel
---

这篇文章记录的是我如何借助 AI，从零搭建一套可以长期维护的个人技术博客。

重点不在于“让 AI 一键生成网站”。真正值得复用的，是一套工程流程：先检查环境，再选技术栈，定义内容结构，建立验证命令，接入版本控制和持续集成，最后部署到公网。AI 负责加速执行和定位问题，人负责判断边界、确认结果和决定哪些内容可以发布。

最终使用的技术栈是：

```text
Astro + AstroPaper
Markdown + Content Collections
Shiki + Pagefind
GitHub + GitHub Actions
Vercel
pnpm
```

整体数据流如下：

```text
Markdown 文章
    ↓
Astro Content Collections 校验
    ↓
pnpm build 生成静态网站
    ↓
git push 到 GitHub
    ↓
GitHub Actions 执行 lint、格式检查和构建
    ↓
Vercel 自动部署生产环境
```

## 阅读前：先替换占位符

本文的命令示例使用通用占位符，不能直接原样执行。阅读时先把它们替换成你自己的值：

| 占位符                 | 需要替换成                 |
| ---------------------- | -------------------------- |
| `YOUR_GITHUB_USERNAME` | 你的 GitHub 用户名         |
| `YOUR_REPO_NAME`       | 你的博客仓库名             |
| `YOUR_PROJECT_NAME`    | Vercel 项目名              |
| `YOUR_DOMAIN`          | 博客最终域名               |
| `YOUR_PROXY_PORT`      | 本机代理软件实际监听的端口 |
| `D:/path/to/your-repo` | 你的本地仓库路径           |

例如，下面这条命令中的用户名和仓库名必须换成你自己的：

```powershell
gh repo create YOUR_GITHUB_USERNAME/YOUR_REPO_NAME `
  --public `
  --source=. `
  --remote=origin `
  --push
```

本文中的个人域名和仓库名只用于说明场景，不应作为你的项目配置直接复制。

## 通用框架：一套博客系统分成九层

如果把具体工具名称暂时去掉，这类项目可以抽象成下面这套流程。换用 Hugo、Jekyll 或其他静态站点生成器时，框架仍然成立：

| 阶段        | 目标                              | 需要确认的产物                        |
| ----------- | --------------------------------- | ------------------------------------- |
| 1. 环境     | 保证 Node、包管理器、Git 版本一致 | `.nvmrc`、`engines`、`packageManager` |
| 2. 技术栈   | 选择静态生成器和主题              | 构建命令、输出目录、主题许可证        |
| 3. 内容模型 | 规定文章目录和 Frontmatter        | `content.config.ts`、文章模板         |
| 4. Markdown | 处理 GFM、代码块和图片            | Shiki/插件配置、资源目录              |
| 5. 构建     | 生成可部署的静态文件              | `pnpm build`、`dist/`                 |
| 6. Git      | 规范换行符、忽略文件和提交        | `.gitattributes`、`.gitignore`        |
| 7. 远程仓库 | 创建仓库并绑定 `origin`           | GitHub 仓库、默认分支                 |
| 8. CI/CD    | 自动执行检查和部署                | GitHub Actions、Vercel                |
| 9. 写作循环 | 写文章、验证、提交、发布          | Markdown → commit → push → deploy     |

读完之后，你应该能做到：

- 检查并解释自己的 Node、pnpm、Git 版本；
- 知道文章、图片和配置文件分别放在哪里；
- 能写出一条不会被忽略的 Frontmatter；
- 能在本地执行格式检查、Lint 和构建；
- 能把仓库推送到 GitHub，并在 Vercel 上完成部署；
- 出问题时知道先检查版本、日志、代理、路径和 Git 状态。

## 文章中需要给出多少代码

技术文章不应该把整个第三方主题源码复制一遍，但关键配置必须是完整、可执行的。本文采用下面的边界：

文章提供的完整内容：

- 可以直接执行的命令；
- 单个文件的完整核心配置，例如 `content.config.ts`；
- 完整的跨平台复制脚本和 GitHub Actions 关键步骤；
- 需要由读者替换的占位符和检查清单。

文章不重复提供的内容：

- AstroPaper 的全部组件和样式源码；
- 第三方依赖的完整实现；
- `pnpm-lock.yaml` 的全部内容，锁文件应由包管理器生成；
- 与具体机器绑定的路径、端口和账号信息。

完整项目应链接到公开仓库。文章负责解释最小可复现配置、设计取舍和验证方法；仓库负责提供可长期维护的完整实现。只给半截代码，却不说明文件位置、运行命令和预期结果，不算合格的实战文章。

## 一、先明确目标，再交给 AI 执行

我一开始的目标不是“做一个页面”，而是：

- 纯静态、部署成本低
- Markdown 写作体验好
- 代码高亮接近编辑器体验
- 支持亮暗主题、搜索、RSS 和 sitemap
- 有类型校验，避免 Frontmatter 写错
- Git 仓库可维护，有 CI
- Vercel 可以自动部署

这个目标决定了技术选择。静态博客最适合长期写作和低成本维护，Astro 对 Markdown 和代码高亮的支持也很成熟。

如果直接让 AI “帮我建一个博客”，它可能会做出一套能运行但难以维护的东西。更有效的方式是把需求拆成可验证的约束：

```text
内容必须放在 src/content/posts/
Frontmatter 必须包含 title、date、tags、description
构建命令必须是 pnpm build
GitHub Actions 必须执行 lint、format check 和 build
Vercel 输出目录必须是 dist
```

有了这些约束，AI 的每一步都更容易验证。

## 二、环境检查是第一步，不要跳过

在安装任何依赖之前，先确认本机环境：

```powershell
node --version
pnpm --version
git --version
gh --version
```

我遇到的第一类问题就是版本冲突。最新版 AstroPaper 要求 Node.js 22.12+，而本机当时是 Node.js 20。这里有两个选择：

1. 升级到 Node.js 22.13+。
2. 使用仍然兼容当前 Node 的 AstroPaper 版本。

后来为了统一 GitHub Actions、pnpm 和 Vercel 的运行环境，项目最终固定为：

```text
Node.js 22.13.0
pnpm 11.25.0
```

对应文件包括：

```text
.nvmrc
package.json
.github/workflows/ci.yml
```

`.nvmrc` 负责告诉本地和 Vercel 使用哪个 Node 版本：

```text
22.13.0
```

`package.json` 负责固定包管理器：

```json
{
  "packageManager": "pnpm@11.25.0",
  "engines": {
    "node": ">=22.13.0"
  }
}
```

这一步非常重要。版本不一致会让本地正常、CI 失败，或者本地失败、Vercel 正常。

## 三、安装依赖时要注意构建脚本和国内网络

pnpm 默认会限制依赖执行安装脚本。Astro 依赖 `esbuild` 和 `sharp`，它们需要执行原生二进制安装脚本。

项目中的 `pnpm-workspace.yaml` 可以显式允许：

```yaml
allowBuilds:
  esbuild: true
  sharp: true
```

如果使用国内网络，依赖下载缓慢时可以临时切换镜像：

```powershell
pnpm install --registry https://registry.npmmirror.com
```

这比修改全局 npm 配置更安全，因为不会影响其他项目。

## 四、内容集合和 Frontmatter 类型校验

博客的核心不是页面，而是内容结构。Astro Content Collections 可以在构建时校验 Frontmatter。

项目中把文章目录固定在：

```text
src/content/posts/
```

然后在 `src/content.config.ts` 中定义集合：

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { SITE } from "@/config";

export const POSTS_PATH = "src/content/posts";

const posts = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.md",
    base: `./${POSTS_PATH}`,
  }),
  schema: ({ image }) =>
    z.object({
      author: z.string().default(SITE.author),
      title: z.string().trim().min(1),
      date: z.coerce.date(),
      description: z.string().trim().min(1),
      tags: z.array(z.string().trim().min(1)).min(1),
      updatedDate: z.coerce.date().optional().nullable(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      ogImage: image().or(z.string()).optional(),
      canonicalURL: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      timezone: z.string().optional(),
    }),
});

export const collections = { posts };
```

一篇文章的 Frontmatter 可以这样写：

```yaml
---
title: "文章标题"
date: 2026-10-15T03:30:00+08:00
description: "文章简介"
tags:
  - Astro
  - AI
---
```

这里有一个非常容易被忽略的坑：日期最好带明确时区。

如果写成：

```yaml
date: "2026-10-15"
```

它可能被解析为 UTC 当天零点。在某个时区下，这篇文章会被当成“未来文章”，生产环境不会显示。推荐直接写：

```yaml
date: 2026-10-15T00:00:00+08:00
```

这样构建结果和预期一致。

## 五、Markdown、GFM 和代码高亮

Astro 默认支持 GitHub Flavored Markdown，但显式开启更不容易误解：

```ts
export default defineConfig({
  markdown: {
    gfm: true,
    shikiConfig: {
      themes: {
        light: "min-light",
        dark: "night-owl",
      },
      defaultColor: false,
      wrap: false,
    },
  },
});
```

为了让博客不只是“能显示代码”，还需要处理：

- 代码块标题
- 行号
- 行高亮
- 差异标记
- 复制按钮
- 亮暗主题切换

AstroPaper 已经通过 Shiki transformers 和页面脚本实现了这些能力。代码块可以写成：

````markdown
```ts title="src/content.config.ts" showLineNumbers
const posts = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/posts" }),
});
```
````

其中：

- `title` 显示代码块标题。
- `showLineNumbers` 显示行号。
- `// [!code highlight]` 可以高亮某一行。
- `// [!code ++]` 和 `// [!code --]` 可以标记新增和删除。

复制按钮由页面脚本自动注入，因此不需要手动在每篇文章中添加按钮。

## 六、构建脚本必须考虑 Windows

AstroPaper 模板原本在构建后使用了 Unix 命令：

```text
cp -r dist/pagefind public/
```

这条命令在 macOS 和 Linux 上可用，但在 Windows 上会失败。解决办法不是要求用户安装额外的 Unix 工具，而是改成 Node.js 脚本：

```js
import { cpSync, existsSync, rmSync } from "node:fs";

const source = "dist/pagefind";
const destination = "public/pagefind";

if (!existsSync(source)) {
  throw new Error(`Pagefind output not found at ${source}`);
}

rmSync(destination, { force: true, recursive: true });
cpSync(source, destination, { recursive: true });
```

然后在 `package.json` 中使用：

```json
{
  "scripts": {
    "build": "astro check && astro build && pagefind --site dist && node scripts/copy-pagefind.mjs"
  }
}
```

这样本地 Windows、Linux CI 和 Vercel 都能使用同一套命令。

## 七、Git 规范化：换行符和仓库权限

跨平台项目最常见的 Git 警告之一是：

```text
LF will be replaced by CRLF
```

这不是文件损坏，而是 Git 在统一换行符。为了避免不同系统反复产生差异，可以增加 `.gitattributes`：

```text
* text=auto eol=lf

*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.webp binary
*.ico binary
*.woff binary
*.woff2 binary
*.ttf binary
*.otf binary
```

还可以增加 `.editorconfig`：

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

如果 Git 出现：

```text
detected dubious ownership in repository
```

说明仓库目录的所有者和当前用户不一致。Git 会出于安全原因拒绝操作。确认目录属于自己后，可以添加例外：

```powershell
git config --global --add safe.directory D:/path/to/repository
```

不要为了让命令通过就直接关闭所有安全检查。只对你确认可信的具体目录添加例外更合适。

## 八、Git 代理不要写死成某一个软件端口

代理软件更换后，本地端口可能变化。例如旧软件监听 `7897`，新软件监听 `7892`。如果 Git 全局配置仍然指向旧端口，就会出现：

```text
Failed to connect to 127.0.0.1 port 7897
```

先检查 Windows 系统代理：

```powershell
Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable, ProxyServer, AutoConfigURL
```

再检查监听端口：

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 7890, 7892, 7897, 10808 } |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

如果只是临时使用代理，可以只对当前命令生效：

```powershell
git -c http.proxy=http://127.0.0.1:7892 `
    -c https.proxy=http://127.0.0.1:7892 `
    push
```

更稳定的做法是让所有代理软件使用同一个固定 Mixed Port，避免每次切换软件都修改 Git 配置。

## 九、用 GitHub CLI 创建远程仓库

创建远程仓库前先确认登录状态：

```powershell
gh auth status
```

如果尚未登录：

```powershell
gh auth login --web --git-protocol https
```

然后用一条命令创建远程仓库、设置描述并推送当前目录：

```powershell
gh repo create YOUR_GITHUB_USERNAME/YOUR_REPO_NAME `
  --public `
  --source=. `
  --remote=origin `
  --description "A minimal, typography-first technical blog built with AstroPaper, Astro, TypeScript, and Shiki." `
  --push
```

这不是把现有仓库覆盖，而是从当前目录创建一个新的远程仓库。为了让仓库更容易被发现，还可以添加 Topics：

```powershell
gh repo edit YOUR_GITHUB_USERNAME/YOUR_REPO_NAME `
  --add-topic astro `
  --add-topic astro-paper `
  --add-topic blog `
  --add-topic typescript `
  --add-topic markdown `
  --add-topic shiki `
  --add-topic vercel `
  --add-topic static-site
```

## 十、GitHub Actions：先统一版本，再谈自动化

CI 的作用不是“让仓库看起来专业”，而是每次推送都自动验证：

```text
安装依赖
运行 lint
检查格式
执行生产构建
```

我遇到过一次典型失败：工作流使用 Node.js 20，但 pnpm 11.25 要求 Node.js 22.13+。执行 `pnpm store path` 时出现：

```text
This version of pnpm requires at least Node.js v22.13
```

修复方式不是绕过检查，而是让所有环境保持一致：

```yaml
strategy:
  matrix:
    node-version: [22.13.0]
```

同时把安装命令固定为：

```yaml
- name: "Install pnpm"
  uses: pnpm/action-setup@v4
  with:
    version: 11.25.0
```

CI 通过后，每次推送都会自动得到一次完整的质量验证。

## 十一、Vercel 部署：项目名和域名是两件事

Vercel 导入 GitHub 仓库后，会自动读取项目配置。对于 Astro 项目，基本设置是：

```text
Framework Preset: Astro
Install Command: pnpm install
Build Command: pnpm build
Output Directory: dist
```

Vercel 项目名会决定默认的 `vercel.app` 域名，而 `vercel.app` 域名是全局唯一的。如果 `YOUR_PROJECT_NAME.vercel.app` 已被占用，不要删除 GitHub 仓库，只需要给 Vercel 项目换一个名称，例如：

```text
YOUR_PROJECT_NAME
```

最终的默认域名可能是：

```text
https://YOUR_PROJECT_NAME.vercel.app
```

更关键的是：部署完成后必须把 `src/config.ts` 中的站点地址改成真实域名：

```ts
export const SITE = {
  website: "https://YOUR_DOMAIN/",
};
```

如果不修改，RSS、sitemap 和 canonical URL 会继续指向错误地址。

以后只需要：

```powershell
git add .
git commit -m "docs: add new article"
git push
```

Vercel 就会自动重新部署，不需要每次手动点击。

## 十二、AI 协作的正确方式

这次实践中，AI 的价值不是“替我写代码”，而是：

- 快速检查环境版本
- 识别 AstroPaper、Node 和 pnpm 的兼容关系
- 把配置文件改到同一个约定上
- 定位 CI 日志和构建失败原因
- 把重复命令变成脚本
- 发现 Windows 与 Unix 命令差异
- 帮助建立 Git、GitHub Actions 和 Vercel 的完整链路

但它不能替代人的判断。每一轮修改后，都应该至少执行：

```powershell
git diff
git status
pnpm format:check
pnpm lint
pnpm build
```

AI 给出的内容也必须经过验证。尤其是：

- 不要盲目删除许可证和第三方声明
- 不要把模板示例内容伪装成自己的原创
- 不要让 AI 删除无法确认用途的文件
- 不要把密钥、Token 和私人配置提交到仓库
- 修改后要检查 Git diff，而不是只看命令是否返回成功

## 十三、最终检查清单

发布新文章前，可以按下面的顺序检查：

```text
1. 文章是否在 src/content/posts/
2. Frontmatter 是否包含 title、date、tags、description
3. date 是否带明确时区
4. 图片是否放在 public/images/ 并使用了正确路径
5. pnpm format:check 是否通过
6. pnpm lint 是否通过
7. pnpm build 是否成功
8. Git diff 是否只包含预期内容
9. push 后 GitHub Actions 是否成功
10. Vercel 最新部署是否 Ready
```

## 总结

用 AI 搭建技术博客，真正有效的路径不是“让 AI 帮我一键完成”，而是把 AI 放进一个可验证的工程流程里。

先把环境、内容结构、构建命令、版本控制和部署目标定清楚，再让 AI 帮你执行和排错。每次修改都用 Git diff、lint、format check 和 build 验证。这样得到的不只是一个能打开的网站，而是一套可以持续写下去、可以追踪问题、可以自动部署的技术资产。

博客的长期价值，最终仍然来自内容本身。AI 可以帮你降低工程门槛，但写什么、为什么写、如何验证结论，仍然需要作者自己负责。
