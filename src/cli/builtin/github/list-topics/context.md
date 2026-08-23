# Context

## Precipitation Background (Why This Command Exists)

GitHub 官方话题目录是常见信息入口。用户浏览 /topics 获取官方策展的话题列表（名称+描述+URL），并可直接进入某个话题查看热门仓库。list-topics 与 get-topic 设计为链式命令。REST API 匿名限流脆弱，故全部走 browser runtime 读渲染后 DOM。

## Value Assessment

- 复用场景：任何需要「GitHub 有哪些官方热门话题」的命令行需求；输出 url 可链式传给 get-topic。
- 复用频率：高（话题目录是 GitHub 核心发现入口之一）。
- 一次沉淀省去每次探索 /topics 的 DOM 结构定位，单页无分页、执行快（实测 ≤10s 目标）。

## Page Structure

- URL: https://github.com/topics（SSR，React 再 hydration）。
- 主列表「All featured topics」：16 行 `div.tmp-py-4.border-bottom.d-flex.flex-justify-between`，每行文本锚点 `a[href="/topics/{slug}"].no-underline.flex-1.d-flex.flex-column` 内含标题 `p.f3` + 描述 `p.f5`。
- 顶部另有 3 个 `div.topic-box`（前 3 个话题的重复展示），按 href 去重排除。
- 侧栏「Popular topics」：10 个 `a.topic-tag-link` 纯 slug chip，无描述、每次加载轮换，排除。
- 提取：遍历 `a[href^="/topics/"]` 中同时含 `p.f3`+`p.f5` 者，按 href 去重，title=`p.f3` 文本、description=`p.f5` 文本、url=`https://github.com`+href。

## Environment Dependencies

- Requires Chrome or Edge running with remote debugging enabled. No login required（公开页面）。
- 访问礼貌规范：内置随机等待/随机滚动/随机鼠标移动（humanize，best-effort）。单页无分页，无并发页面访问。
- 页面固定 16 条为实测事实，但实现不硬编码条数——读取 DOM 实际数量，`limit` 只截断。

## Failure Signals

- 结构漂移：无任何含 `p.f3`+`p.f5` 的 `/topics/` 锚点 → `EMPTY_RESULT`（消息提示结构可能变化）。
- 导航失败 → `NETWORK_ERROR`。
- 参数非法 → `INVALID_PARAM`（limit 非 1-100 整数）。
- hydration 中间态：页面早期可能只渲染 3 个 `div.topic-box`；命令先 `waitForSelector('a[href^="/topics/"]')` 再提取规避。

## Repair Clues

- 备选布局：`div.topic-box` 卡片布局（`a.no-underline.d-flex.flex-column.flex-justify-center` + `p.f3` + `p.f5`）——提取逻辑已兼容。
- 若侧栏 chip 需要纳入（用户要求含无描述话题），可额外采集 `a.topic-tag-link` 的 text/href，description 置 null。
- 若 GitHub 改列表为分页，参考 `github/list-commits` 的 `a[rel="next"]` 分页模式补充分页。
- 页面内嵌 SSR 数据可作兜底：`script[data-target="react-app.embeddedData"]`（当前列表主要依赖 DOM 即可，无需启用）。
