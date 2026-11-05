# 将研究播放器接到 B2 / R2

Checked: 2026-11-05, America/New_York (EST).

当前播放器已在 [Netlify 公网运行](https://fern-forecast-player.netlify.app/compare/)，六份展示 JSON 合计 4,034,345 字节。目前由网站直接服务这些文件，接对象存储不是浏览的前提。B2 与 R2 选一个即可。

## 先分清三件事

| 层次     | 作用                             | 本次状态                                                           |
| -------- | -------------------------------- | ------------------------------------------------------------------ |
| 账号密钥 | 程序列文件、读取私有文件、上传   | B2 已实测鉴权、列文件和范围读取；R2 未接入本项目                   |
| 公开下载 | 访客无需登录就能读取已选展示文件 | B2 创建独立公有桶曾被 `no_payment_history` 拒绝；R2 需启用公开入口 |
| CORS     | 允许播放器网页跨域读取数据       | 直连另一域名时配置；同源代理路线可不需要浏览器跨域                 |

CORS 不会把私有桶变公开，也不是限制谁可以下载公开文件的权限系统。密钥只在上传端或服务端使用。已有 checkpoint 归档与公开展示数据分别放桶。

## B2：复用已有账号

1. 登录 [Backblaze 控制台](https://secure.backblaze.com/)，进入左侧 **B2 Cloud Storage → Buckets**。
2. 点 **Create a Bucket**，新建展示桶，例如 `fern-public-visualization-qilinwang`；名称需全局唯一。隐私选 **Public**。
3. 如果提示首次创建公有桶的资格要求，完成邮箱验证，并按账号页面要求补齐付款记录。官方说明允许已有付款记录，或通过信用卡表单支付计入账号余额的小额费用。本项目此前 API 返回 `no_payment_history`，不是私有读取密钥失效。涉及付款由账号持有人在控制台完成。
4. 桶创建成功后，只上传本仓库 `public/release.json` 所列的六份展示数据，保留目录路径。不要把整个实验归档复制进去。例如对象路径可以是 `compare/data.json`。
5. 在文件详情复制 **Friendly URL / 下载链接**，用未登录的隐私窗口测试能够打开。以文件实际下载地址为准，不把 S3 管理 endpoint 当成无需鉴权的公共文件链接。
6. 若网页直接跨域 fetch B2，进入展示桶的 **CORS Rules**（新版控制台可能在 **Settings** 中），仅允许读取，并允许来源 `https://fern-forecast-player.netlify.app`。页面如提供“exactly one origin”选项，填写这个来源；没有对应菜单时可通过 API 配置。来源不含 `/compare/` 等路径。
7. 最后才让播放器的数据请求指向该公开入口，或配置 Netlify 同源代理。验收时逐个核对匿名 HTTP 200、JSON 类型、文件 SHA-256，以及从实际网页发起的读取。现有代码尚未切到对象存储。

官方依据：[创建公有桶及付款条件](https://www.backblaze.com/docs/cloud-storage-create-and-manage-buckets)、[CORS 语义与规则](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules)。

## R2：建立一个公开展示入口

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入 **Storage & databases → R2 → Overview**。如尚未开通，按页面完成 R2 subscription 的 checkout；免费额度不等于账号已经开通。涉及账单由账号持有人完成。
2. 点 **Create bucket**，例如 `fern-visualization`，然后在 **Objects** 上传选定的展示数据，保留相同目录路径。
3. 先连通测试：桶的 **Settings → Public Development URL → Enable**，按提示输入 `allow`。复制 `https://pub-….r2.dev` 形式的 URL，访问 `…/compare/data.json`。它是开发入口，有速率限制。
4. 长期公开：在 **Settings → Custom Domains → Add** 绑定数据域名，例如你所拥有域名下的 `data.…`。域名必须在与 R2 同一 Cloudflare 账号的 zone 中；等待状态 **Active**。正式发布使用这个入口。没有自有域名时，当前 Netlify 快照仍可继续使用。
5. 进入 **Settings → CORS Policy → Add CORS policy → JSON**，填入下面的读取规则并保存。它允许正式播放器发起 GET / HEAD，不开放网页上传。

```json
[
  {
    "AllowedOrigins": ["https://fern-forecast-player.netlify.app"],
    "AllowedMethods": ["GET", "HEAD"],
    "MaxAgeSeconds": 3600
  }
]
```

6. 从实际播放器页面验证请求，检查 `Access-Control-Allow-Origin` 是否匹配来源。只在新标签页打开 JSON 成功，尚不能证明跨域 fetch 成功。若先缓存了无 CORS 的响应，按官方说明刷新相关自定义域名缓存。
7. 自动上传时再配置桶范围的上传凭据，通过本机安全配置或部署平台的 secret 保存。网页下载公开文件不需要上传密钥，密钥也不进入 GitHub 或前端 JS。接入后沿用 release manifest 核对内容。

官方依据：[开通 R2](https://developers.cloudflare.com/r2/get-started/)、[建桶](https://developers.cloudflare.com/r2/buckets/create-buckets/)、[公开 URL / 自定义域名](https://developers.cloudflare.com/r2/buckets/public-buckets/)、[CORS 控制台配置](https://developers.cloudflare.com/r2/buckets/cors/)。

## 静态网站能做什么

Fern 主研究网站使用 Astro；本独立播放器的 `public/` 是 HTML、CSS 与浏览器 JS。原始三维播放器使用 Three.js；双 seed 对照的折线图使用 SVG，三维样本使用可旋转的 Canvas 投影。当前交互不依赖常驻服务器。

```text
网页静态文件（Netlify；也可由 Astro 构建）
  → 浏览器读取指定窗口的已保存数据（当前同源；未来 B2 / R2）
  → 浏览器同步游标、计算既有读数、画图、旋转、播放
```

Astro 的 [client islands](https://docs.astro.build/en/concepts/islands/) 可以承载同样的交互。研究图谱扩大时，按研究 / 模型 / seed / 窗口拆分文件、按需加载和缓存，避免一次下载全部样本。新在线推理、私有访问控制、用户上传或需要保存共享批注时，再接相应服务端能力。对象存储负责保存和分发结果，不能替代 GPU 推理。
