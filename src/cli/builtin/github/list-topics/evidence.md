# Evidence: github/list-topics

This document records the research and validation evidence for the `github/list-topics` command.

## Exploration Path

browser runtime 探索经 `@playwright/cli` attach 用户 Chrome 实测（explore 阶段审计通过，status: passed）。

Library check: `websculpt command list github` — 现有 10 条 github 命令（get-issue/get-pull/get-repo/get-trending/list-commits/list-contributors/list-issues/list-pulls/list-releases/list-repos），无 `list-topics`，无冲突。`github/get-topic` 尚未沉淀，list-topics 的 url 可作为其输入（链式调用预留）。

## Verified URLs

- https://github.com/topics — 一手来源，实测 HTTP 200 / SSR 页 / 浏览器渲染后提取 16 条特色话题卡片（title+description+url）。多次访问（curl + 浏览器 goto）验证，2026-08-09。
- 关联页面（链式目标，非本命令范围）：https://github.com/topics/{slug}（如 https://github.com/topics/rust，供 github/get-topic）。

## Structural Evidence

github.com/topics（浏览器 DOM，hydration 完成后）：

- H1 `.h1` = "Topics"；H2「All featured topics」→ 一个 `<div>` 内 16 行 `div.tmp-py-4.border-bottom.d-flex.flex-justify-between`。每行两个锚点：
  - 图片锚点 `a[href="/topics/{slug}"].no-underline.flex-grow-0 > img`
  - 文本锚点 `a[href="/topics/{slug}"].no-underline.flex-1.d-flex.flex-column`，内含
    - 标题 `p.f3.lh-condensed.mb-0.mt-1.Link--primary`（展示名，如 "Front end"、"Node.js"，非 slug）
    - 描述 `p.f5.color-fg-muted.mb-0.mt-1`
- 顶部另有 3 个 `div.topic-box` 卡片（grid 布局，`a.no-underline.d-flex.flex-column.flex-justify-center` + `img` + `p.f3` + `p.f5`），是前 3 个特色话题的重复展示，提取时按 href 去重排除。
- H2「Popular topics」侧栏：`ul.col-sm-6.col-md-4.col-lg-12.list-style-none.flex-wrap` 内 10 个 `li > a.topic-tag.topic-tag-link.f6`（纯 slug 文本 chip，无描述，每次加载轮换）——不作为主数据源。

固定条数：特色话题 16 条（curl SSR + 浏览器两次独立 goto 均 16 条，全部带 title+desc）。页面无分页，16 行为全集。`limit` 为截断语义：N < 16 返回前 N 条，N ≥ 16（含默认 20）返回全部 16 条。

hydration 中间态：页面加载早期仅渲染 3 个 `div.topic-box`，16 行未出现。**实现必须等待目标锚点出现后再提取**。

Robust 提取逻辑（兼容 topic-box 与 paired-row 两种布局）：遍历 `a[href^="/topics/"]`，取同时含 `p.f3` 与 `p.f5` 者，按 href 去重，title=`p.f3` 文本、description=`p.f5` 文本、url=`https://github.com` + href。实测稳定返回 16 条。

## Failure Signals

- `INVALID_PARAM`：limit 非数字 / 超出 1-100。
- `NETWORK_ERROR`：页面加载失败（goto 异常）。
- `EMPTY_RESULT`：无含 `p.f3`+`p.f5` 的话题卡片（页面结构变化 / 被拦截 / 渲染失败）。消息中提示结构可能已变化。
- `NOT_FOUND`：本命令无资源参数，不产生；保留在统一错误码集合中。
- `BROWSER_ATTACH_REQUIRED`：daemon 侧基础设施错误，命令代码不抛出。
- 访问礼貌规范：全程 HTTP 200，无 429/403/CAPTCHA。命令内置随机等待/滚动/鼠标移动降速；若未来观察到限流信号，需降速。
- hydration 中间态（仅 3 个 topic-box）是已知陷阱，必须 waitForSelector 后再提取。

## Capture Assessment

应沉淀。路径已实测跑通：固定 16 条特色话题，一条命令可复用的「浏览 GitHub 官方话题目录」场景，输出稳定结构化（title/description/url），无登录依赖，单页无分页、单次调用快（目标 ≤10s）。与 `github/get-topic` 构成链式调用。符合 WebSculpt 沉淀标准。
