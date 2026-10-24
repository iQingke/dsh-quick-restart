# iQingke/dsh-quick-restart 上架 dsh-market 清单

> dsh-market 的插件目录由 `awesome-dsh-plugin` 提供：要进 dsh-market，就是向该目录提 PR；dsh-market 仓库本身不收插件条目。
> 对照 `awesome-dsh-plugin/contributing.md`，2026-10-24 23:10 检查。
> 仓库：https://github.com/iQingke/dsh-quick-restart
> 当前状态：public，`main` 分支；`size: 0`，`topics: []`，`license: null`；只有一个 19 B 的 README；Release `dsh` 没有资产。

## 结论：现在还不能提 PR

缺 5 项硬条件：

| # | contributing 要求 | 当前 | 要做 |
|---|---|---|---|
| 1 | 仓库根目录有 `package.json`，且含 `dsh.bundle` | 没有 package.json | 上传发布副本全部文件 |
| 2 | 有真实代码 | 只有 README | 上传 client/index/helper/locale 等 |
| 3 | 仓库创建满 1 天 | 创建于 2026-10-24T15:00:04Z | 2026-10-25 23:00（北京时间）后再提 PR |
| 4 | 仓库有 `dsh-plugin` topic | 无 topic | Settings → Topics 添加 |
| 5 | Release 有 `.tgz` 资产（YAML 填 tarball 时） | `dsh` release 无资产 | 新建 `v1.0.4` 并上传 tgz |

## 1. 上传仓库文件

把 `E:\DSH\deliverables\dsh-quick-restart-release\` 里这些上传到仓库根目录：

```text
package.json
cordis.patch.yml
index.js
client.js
restart-helper.cjs
locale/（整个文件夹）
icon.svg
README.md
LICENSE
screenshots/（整个文件夹）
screenshots.json
```

不要上传：`grapt-dsh-quick-restart-1.0.4.tgz`（放 Release）、`PUBLISHING.md`、`SUBMIT-iQingke.md`、`awesome-entry*.yml`。

网页操作：仓库首页 → **Add file** → **Upload files** → 拖入上述内容 → Commit。
如果文件夹拖不进去，用 `dsh-quick-restart-repo.zip` 解压后按目录上传。

## 2. 加 topic

仓库首页右上 **⚙ Settings** → **Topics** → 输入 `dsh-plugin` → Save。

## 3. 建 Release 并上传 tarball

1. 仓库右侧 **Releases** → **Create a new release**
2. **Choose a tag** 输入 `v1.0.4` → **Create new tag**
3. Title：`v1.0.4`
4. 上传 `E:\DSH\deliverables\dsh-quick-restart-release\grapt-dsh-quick-restart-1.0.4.tgz`
5. **Publish release**

发布后打开这个地址确认能下载：

```text
https://github.com/iQingke/dsh-quick-restart/releases/download/v1.0.4/grapt-dsh-quick-restart-1.0.4.tgz
```

已有的 `dsh` tag 没有资产，可以保留或删除；YAML 用 `v1.0.4` 即可。

## 4. 等满 24 小时

仓库年龄检查按 `created_at` 算：
`2026-10-24T15:00:04Z` = 北京时间 `2026-10-24 23:00:04`。
最早可提 PR：**2026-10-25 23:00（北京时间）**。
提前提，CI 会因为 `repo too young` 失败，不是 YAML 问题。

## 5. 提交 awesome-dsh-plugin

1. Fork：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
2. 在你 fork 的 `main` 分支：**Add file** → **Create new file**
3. 路径：

```text
data/plugins/iQingke__dsh-quick-restart.yml
```

4. 内容（也可直接复制 `awesome-entry.iQingke.yml`）：

```yaml
url: https://github.com/iQingke/dsh-quick-restart
name: iQingke/dsh-quick-restart
category: ui
description:
  en: "Adds a Restart item to the DeepSeek Harness desktop account menu, with confirmation, progress and failure reporting."
  zh: "在 DeepSeek Harness 桌面版账号菜单中加入「重启」项，带二次确认、进度与失败原因提示。"
tarball: https://github.com/iQingke/dsh-quick-restart/releases/download/v1.0.4/grapt-dsh-quick-restart-1.0.4.tgz
```

5. Commit → 回到 fork 首页 → **Contribute** → **Open pull request**
6. 标题：`Add iQingke/dsh-quick-restart`
7. 描述里写清楚：桌面版账号菜单重启项、二次确认、进度/失败提示、MIT、Windows 桌面版验证。
8. Create pull request。

## 6. PR 描述模板

```text
Add iQingke/dsh-quick-restart

- Adds a Restart item to the DSH desktop account menu (after Feedback, before Sign out).
- Confirmation dialog, in-progress state, success/failure reporting.
- Desktop-only; requires DSH Desktop 0.2.1-rc.2 on Windows (tested).
- MIT licensed; source and release tarball in the repo.

Tested on: DSH Desktop 0.2.1-rc.2, Windows 11.
```

## 7. 不要做的事

- 不要把 `tarball` 写成 `releases/latest/download/...`：版本号变了会 404，`v1.0.4` 固定地址更稳。
- 不要给 `icon:` 填 SVG：市场只接受 GitHub 上的 png/jpg/jpeg/webp。
- 不要一个 PR 塞多个条目：一个 PR 最多 3 个，你只提交 1 个。
- 不要改 `README.md` 等生成文件。
- 仓库必须 public；private 仓库直接不过。

## 8. 合并后

- 市场列表来自 awesome-dsh-plugin，合并后通常一天内同步到 https://awesome-dsh-plugin.com。
- 市场安装走 `tarball`，用户不需要 npm，也不需要构建授权。
- 若维护者认为与 `dsh-whale-tools`（会话头部重启）或 `dsh-web-launcher`（后台重启 Web）重复，会在 PR 里说明；你的差异是「桌面版账号菜单内、带确认与结果回执的整应用重启」。
