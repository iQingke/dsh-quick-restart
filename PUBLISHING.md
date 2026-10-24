# 上架 DSH 插件市场：逐步操作

先纠正一个关键点：**DSH 插件市场没有「上传 tarball」的入口**。市场是一个目录，插件列表来自 GitHub 上的
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 仓库；市场按条目里的
GitHub 仓库安装，优先使用与该仓库关联的 npm 包，其次使用 GitHub Release 里的预构建 tarball。

所以「上架」实际是三件事：

1. 把代码放到一个 GitHub 仓库；
2. （推荐）把包发布到 npm；
3. 去 awesome-dsh-plugin 提一个只加一个 YAML 文件的 PR。

本目录里的 `grapt-dsh-quick-restart-1.0.4.tgz` 是第 2 步或「GitHub Release 预构建包」要用的产物，不是直接传给市场的文件。

---

## 0. 先准备三个东西

| 需要 | 说明 |
|---|---|
| GitHub 账号与仓库 | 条目 `url` 必须是 GitHub 仓库；仓库要能通过 `dsh plugin add` 安装 |
| npm 账号与 `@grapt` scope | 只有 npm 包是可选项；但你想用 `@grapt/dsh-quick-restart` 这个名字，就必须拥有该 scope |
| 仓库创建满 1 天 | awesome-dsh-plugin 的 CI 会检查，刚建几分钟的仓库会被拒 |

当前状态（2026-10-23 实测，**官方 registry**）：

```text
npm view @grapt/dsh-quick-restart version --registry=https://registry.npmjs.org/ --registry=https://registry.npmjs.org/  -> 404，包名尚未被占用
npm whoami --registry=https://registry.npmjs.org/                                -> ENEEDAUTH，本机未登录 npm
```

404 只说明包名空着，**不代表 `@grapt` scope 归你**。

---

## 1. 确认 npm `@grapt` scope

在普通终端执行（不要在 DSH 的沙箱里，避免缓存目录权限问题）：

```powershell
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

> 如果登录被跳到 `registry.npmmirror.com` 并提示 `Public registration is not allowed`：
> 当前 npm registry 指向 npmmirror（只读镜像，不支持登录/发布），不是你的账号问题。
> 用上面的 `--registry=https://registry.npmjs.org/` 对官方源登录；不需要改全局 registry。

如果官方源的浏览器登录页打不开（网络原因），可以在 npmjs.com 的
`Access Tokens` 页面创建一个 **Granular Access Token**（勾选 Publish，scope 选 `@grapt`），然后：

```powershell
npm config set //registry.npmjs.org/:_authToken=<你的token> --location=user
npm whoami --registry=https://registry.npmjs.org/
```

不要把 token 贴到聊天或提交进仓库；它只应保存在 `C:\Users\Kiki\.npmrc`。

- 如果输出 `grapt`：`@grapt` 是你的用户 scope，可以直接用。
- 如果输出别的用户名：`@grapt` 可能是组织 scope，检查成员身份：

```powershell
npm org ls grapt --registry=https://registry.npmjs.org/
```

- 能看到自己且角色是 `owner` / `developer`：可以用。
- 报 404 或没有权限：你并不拥有 `@grapt`。两个选择：
  1. 在 npmjs.com 创建名为 `grapt` 的组织（如果名字可用）；
  2. 改包名，例如 `@<你的npm用户名>/dsh-quick-restart`。改包名时三处必须同步：
     - `package.json` 的 `name`
     - `cordis.patch.yml` 的 `name`
     - `client.js` 顶部 `__ModuleLoader__.load` 的 `id`

发布前还可以再确认一次包名是否被占用：

```powershell
npm view @grapt/dsh-quick-restart version --registry=https://registry.npmjs.org/
```

---

## 2. 把代码放进 GitHub 仓库

建议仓库名 `dsh-quick-restart`，根目录直接放本目录的内容（不要只放 tarball）：

```text
dsh-quick-restart/
├─ package.json
├─ cordis.patch.yml
├─ index.js
├─ client.js
├─ restart-helper.cjs
├─ locale/
│  ├─ zh.json
│  └─ en.json
├─ icon.svg
├─ README.md
├─ LICENSE
├─ screenshots/
│  ├─ account-menu.png
│  └─ confirm-dialog.png
└─ screenshots.json
```

创建仓库并推送：

```powershell
git init
git add .
git commit -m "feat: restart item for the DSH desktop account menu"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

然后在 GitHub 仓库页面：

1. 添加 topic：`dsh-plugin`（仓库首页右上角齿轮 → Topics）。
2. 确认仓库根目录有 `package.json`，且包含：

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web", "immediately": true }
}
```

这是安装的硬性要求；只声明 `dsh.client` 会被 CI 拒绝。

### 补上 `repository` 字段

npm 包必须指回这个仓库，市场才会把两者关联。编辑 `package.json`：

```jsonc
"repository": {
  "type": "git",
  "url": "git+https://github.com/<owner>/<repo>.git"
}
```

也可以命令行改：

```powershell
npm pkg set repository.type=git repository.url="git+https://github.com/<owner>/<repo>.git"
```

### 截图声明

本目录已经准备好 `screenshots.json`：

```json
[
  "screenshots/account-menu.png",
  "screenshots/confirm-dialog.png"
]
```

把它放在仓库根目录（与 `package.json` 同级），路径相对该文件，1–8 张，不能以 `/` 开头、不能含 `..`。市场会优先用它；没有它时会从 README 自动抽取图片。

### 图标（可选）

市场卡片图标只接受 **GitHub 托管的位图**（png/jpg/jpeg/webp），不接受 SVG。当前只有 `icon.svg`，所以：

- 不写 `icon:`，市场回退到你的 GitHub 头像；或
- 另做一张 180×180 的 `assets/icon-180.png` 放进仓库，再在条目里写 `icon:`。

---

## 3. 发布 npm 包（推荐）

在 `package.json` 所在目录执行：

```powershell
npm publish --access public --registry=https://registry.npmjs.org/
```

如果开了 2FA，按提示加 `--otp=<6位码>`。

发布后验证：

```powershell
npm view @grapt/dsh-quick-restart version --registry=https://registry.npmjs.org/ --registry=https://registry.npmjs.org/
npm owner ls @grapt/dsh-quick-restart --registry=https://registry.npmjs.org/
```

应看到 `1.0.4`，owner 是你。

> 本机 DSH 的沙箱会把 npm 默认缓存目录挡在 workspace 外；如果在这里执行遇到 `EPERM`，加
> `--cache E:\DSH\.npm-cache`。普通终端不需要这个参数。

### 不发布 npm 的替代方案

把 `grapt-dsh-quick-restart-1.0.4.tgz` 附加到 GitHub Release（tag `v1.0.4`），然后在条目里加：

```yaml
tarball: https://github.com/<owner>/<repo>/releases/download/v1.0.4/grapt-dsh-quick-restart-1.0.4.tgz
```

必须是 GitHub Release 托管的 `https` `.tgz`。如果坚持用 `releases/latest/download/<固定文件名>`，资产名里不要带版本号，否则下次发版就 404。

---

## 4. 向 awesome-dsh-plugin 提交条目

1. Fork `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`。
2. 在 `data/plugins/` 下新增**一个**文件，文件名用 `<owner>__<repo>.yml`，例如 `grapt__dsh-quick-restart.yml`。
3. 内容：

```yaml
url: https://github.com/<owner>/<repo>
name: <owner>/<repo>
category: ui
description:
  en: "Adds a Restart item to the DeepSeek Harness desktop account menu, with confirmation, progress and failure reporting."
  zh: "在 DeepSeek Harness 桌面版账号菜单中加入「重启」项，带二次确认、进度与失败原因提示。"
```

可选字段：

```yaml
icon: https://raw.githubusercontent.com/<owner>/<repo>/main/assets/icon-180.png
tarball: https://github.com/<owner>/<repo>/releases/download/v1.0.4/grapt-dsh-quick-restart-1.0.4.tgz
```

注意：

- `description.en` 必填；中文可留空让维护者补。
- 描述只写功能，不要写「最好用」「革命性」这类营销词，也不要写不存在的数字/命令。
- 一个 PR 最多 3 条；只改自己这条，不要手改生成的 README。
- 分类建议 `ui`（插件入口在界面里）；如果维护者觉得 `dev` 更贴切，他们会改。
- 仓库必须创建满 1 天，且已有真实可运行代码。

提交 PR 后 CI 会检查 `dsh.bundle`、仓库年龄、YAML、README 生成。合并后市场通常一天内自动收录。

---

## 5. README 里的简介、截图、支持范围、风险分别填在哪

| 内容 | 位置 |
|---|---|
| 一句话简介 | awesome 条目的 `description.en` / `description.zh` |
| 市场卡片截图 | 仓库根目录 `screenshots.json` 指向的 `screenshots/*.png` |
| 支持范围 | 仓库 `README.md` 的「支持范围」一节（已经写好） |
| 风险与实现边界 | 仓库 `README.md` 的「实现方式与边界」一节（已经写好） |
| 安装/失败处理 | 仓库 `README.md` 的「安装」「失败与无权限」两节（已经写好） |

市场详情页会读取仓库 README，所以 README 必须放在仓库根目录，截图路径必须真实存在。

---

## 6. 最短路径清单

```text
[ ] npm login，确认 whoami=grapt 或 org 成员
[ ] 建 GitHub 仓库，推代码，加 topic dsh-plugin
[ ] package.json 加 repository 字段
[ ] 仓库根目录放 screenshots.json
[ ] npm publish --access public --registry=https://registry.npmjs.org/
[ ] fork awesome-dsh-plugin，加 data/plugins/<owner>__<repo>.yml
[ ] 提 PR，等 CI + 维护者合并
[ ] 市场搜索 @grapt/dsh-quick-restart，安装验证
```

如果暂时不想发 npm，把 tarball 传到 GitHub Release，并在条目里加 `tarball:`，同样可以上架。
