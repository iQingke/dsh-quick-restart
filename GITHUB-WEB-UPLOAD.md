# 无需 npm：用 GitHub 网页发布

这条路不需要 npm 账号、不需要 `npm login`、不需要命令行 git。只要浏览器能打开 GitHub 即可。

## 0. 先确认

- 仓库名建议：`dsh-quick-restart`
- 仓库必须是 **public**
- 仓库创建必须满 **1 天**，awesome-dsh-plugin 的 CI 才会通过
- 仓库根目录必须有 `package.json`，且其中包含 `dsh.bundle`

## 1. 创建仓库

打开 https://github.com/new

- Repository name: `dsh-quick-restart`
- 选 **Public**
- 不要勾选 README / .gitignore / license（保持空仓库）
- Create repository

## 2. 上传文件

在空仓库页面点 **uploading an existing file**，把 `E:\DSH\deliverables\dsh-quick-restart-release` 里的这些内容拖进去：

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

不要上传：

```text
grapt-dsh-quick-restart-1.0.4.tgz   ← 这是 Release 资产，不是仓库文件
PUBLISHING.md                        ← 可选，不影响
```

提交信息随意，例如 `feat: restart item for the DSH desktop account menu`，然后 **Commit changes**。

> 如果拖文件夹不成功，就在本地解压 [dsh-quick-restart-repo.zip](dsh-quick-restart-repo.zip)，把里面的内容按目录拖进去。GitHub 网页会保留文件夹结构。

## 3. 加 topic

仓库首页右上角 **⚙** → **Topics**，添加：

```text
dsh-plugin
```

保存。

## 4. 创建 Release 并上传 tarball

1. 仓库右侧 **Releases** → **Create a new release**
2. Tag: `v1.0.4`（新建 tag）
3. Release title: `v1.0.4`
4. 上传 [grapt-dsh-quick-restart-1.0.4.tgz](grapt-dsh-quick-restart-1.0.4.tgz)
5. **Publish release**

发布后确认资产地址可访问：

```text
https://github.com/<你的GitHub用户名>/dsh-quick-restart/releases/download/v1.0.4/grapt-dsh-quick-restart-1.0.4.tgz
```

## 5. 提交到 awesome-dsh-plugin（网页操作，不用 clone）

1. 打开 https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
2. 右上角 **Fork** → **Create fork**
3. 在你 fork 的仓库里点 **Add file** → **Create new file**
4. 文件名填：

```text
data/plugins/<你的GitHub用户名>__dsh-quick-restart.yml
```

5. 内容粘贴 [awesome-entry.example.yml](awesome-entry.example.yml)，把 `YOUR_GITHUB` 全部替换成你的 GitHub 用户名
6. **Commit changes**
7. 回到 fork 仓库首页，点 **Contribute** → **Open pull request**
8. 标题例如 `Add <你的GitHub用户名>/dsh-quick-restart`
9. **Create pull request**

CI 会检查 `dsh.bundle`、仓库年龄、YAML 和 README 生成。合并后市场通常一天内自动收录。

## 6. 这条路的边界

- **不需要 npm**：市场条目里的 `tarball:` 会让用户安装你上传的预构建包，跳过源码构建授权。
- **仍然需要 GitHub**：官方市场只接受 awesome-dsh-plugin 里的 GitHub 条目；没有 GitHub 仓库就无法进入官方市场。
- 如果 GitHub 也无法访问：只能直接把 `grapt-dsh-quick-restart-1.0.4.tgz` 发给用户，让他们在本地用
  `plugin_manager install_bundle` 安装；这属于站外分发，不会出现在市场里。
