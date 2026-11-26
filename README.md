# 米游社、米家云游戏签到脚本 (Node.js 版) - 支持多账号 (崩铁 & 原神)

## 简介
本项目是一个用于自动签到米游社、云崩铁、云原神的 Node.js 脚本。支持多账号，并可本地部署或通过 GitHub Actions 自动运行。

## 功能特性
- **多账号支持**: 同时支持多个账号的签到。
- **本地部署**: 可以在本地或服务器上运行脚本。
- **GitHub Actions 部署**: 可以通过 GitHub Actions 定期自动运行签到任务。

## 免责声明
本脚本仅供交流测试使用。因使用本脚本而产生的任何问题，作者概不负责。官方可能更改接口导致脚本失效，脚本失效会尽快更新，但不保证第一时间。请低调使用，如有不同意，请关闭并停止使用。

## 获取 Cookie 方式 - 米游社签到必需

> **重要：Cookie 必须是“已登录”的完整 Cookie，至少包含 `cookie_token_v2`（或 `cookie_token`）和 `ltuid_v2`。**
> 如果只有 `ltuid` / `account_id` / `ltmid_v2`，所有签到接口都会返回 `-100 登录状态失效`，这不是脚本本身的问题。
> 请不要用 Console 的 `document.cookie` 抓取：`cookie_token_v2` 可能是 HttpOnly，Console 里根本看不到，复制出来必然缺字段。

1. **打开浏览器**:
   - 打开你的浏览器，进入无痕/隐身模式。
   
2. **登录米游社**:
   - 访问 [原神论坛](http://bbs.mihoyo.com/ys) 或 [崩铁论坛](http://bbs.mihoyo.com/sr)，二选一进行登录操作，原神崩铁Cookie通用。
   
3. **获取完整 Cookie（推荐 Network 方式）**:
   - 按下键盘上的 `F12` 或右键点击页面选择“检查”，打开开发者工具。
   - 切换到 **Network** 选项卡，刷新页面。
   - 随便点开一条发往 `api-takumi.mihoyo.com` 的请求（例如 `getUserGameRolesByCookie`）。
   - 在 **Request Headers** 中找到 `Cookie:`，复制它后面的**整段内容**。
   - 确认这段内容里同时有 `cookie_token_v2=` 和 `ltuid_v2=`（老的 `cookie_token` / `ltuid` 也可以）。

   > 不要用 Console 里 `document.cookie` 的方式复制。米游社的 `cookie_token_v2` 可能是 HttpOnly，
   > `document.cookie` 看不到它，复制出来就是一个“只有 ltuid、没有登录态”的残缺 Cookie，接口必然返回 `-100`。

## 获取 Token 方式 - 云游戏签到必需

1. **打开浏览器**:
   - 打开你的浏览器，进入无痕/隐身模式。
   
2. **登录云游戏**:
   - 访问 [云原神](https://ys.mihoyo.com/cloud/#/) 和 [云崩铁](https://sr.mihoyo.com/cloud/#/)。原神崩铁Token不通用！
   
3. **获取 Token**:
   - 按下键盘上的 `F12` 或右键点击页面选择“检查”，打开开发者工具。
   - 切换到“Network”选项卡
   - 在XHR请求中找到一条 `Request Headers` 中含有 `x-rpc-combo_token` 字段的请求。
   - 选中并复制`x-rpc-combo_token`的值，此时 Token 已经复制到你的剪贴板。



## GitHub Actions 部署

你可以通过 GitHub Actions 定期自动运行签到任务。以下是配置步骤：

1. **Fork本仓库**

2. **配置 GitHub Secrets**:
   - 打开你的 Fork 仓库页面。
   - 点击 `Settings` -> `Secrets and variables` -> `Actions`。
   - 添加新的 Secret, 多个cookie/token用英文逗号(,)分隔，若cookie/token下有原神/崩铁角色会执行签到：
     - 名称: `MYS_COOKIES`
       值: `cookie1,cookie2,cookie3`
     - 名称: `GENSHIN_TOKENS`
       值: `ys-token1,ys-token2`
     - 名称: `STARRAIL_TOKENS`
       值: `sr-token1,sr-token2`

3. **创建 Workflow 文件**:
   - 在 `.github/workflows` 目录下创建一个新的 YAML 文件，例如 `main.yml`。

4. **YAML 配置示例**:

   ```yaml
    name: MiHoYo Sign-In Script

    on:
      schedule:
        - cron: '20 23 * * *' # 每天UTC 23:20, 对应北京时间7:20，实际运行时间有偏差。
      workflow_dispatch: # 允许手动触发

    jobs:
      build-and-run:
        runs-on: ubuntu-latest

        steps:
        - name: Checkout repository
          uses: actions/checkout@v3

        - name: Set up Node.js
          uses: actions/setup-node@v3
          with:
            node-version: '20'

        - name: Install dependencies
          run: npm install

        - name: Run main.js
          env:
            MYS_COOKIES: ${{ secrets.MYS_COOKIES }}
            GENSHIN_TOKENS: ${{ secrets.GENSHIN_TOKENS }}
            STARRAIL_TOKENS: ${{ secrets.STARRAIL_TOKENS }}
          run: node main.js
   ```

## 本地部署

1. **安装 Node.js**:
   - 确保你已安装 Node.js 版本大于 14.x。
   
2. **Clone项目**:
   ```sh
   git clone https://github.com/GildedFlames/MYS_Game_Singin.git
   ```
   
3. **安装依赖**:
   ```sh
   npm install
   ```

4. **获取完整 Cookie（推荐自动方式）**:
   ```sh
   npm run login
   ```
   - 会自动打开本机 Edge/Chrome，扫码登录后把**含 HttpOnly `cookie_token_v2`** 的完整 Cookie 写入 `cookie.txt`
   - 第二个账号再执行一次 `npm run login`，会自动追加（同账号则刷新）
   - 系统代理导致登录页打不开时加 `-- --no-proxy`
   - 想写到别的文件：`npm run login -- --file "MY cook 不上传i.txt"`

   也可以手动配置（二选一）:
   - 环境变量：`MYS_COOKIES='cookie1,cookie2'`
   - 或在项目根目录新建 `cookie.txt` / `MY cook 不上传i.txt`，把完整 Cookie 放进去（已加入 `.gitignore`）

   脚本默认使用客户端版本 `2.117.0` 与网页端 Salt `4751cb...`；官方更新后可用 `MIHOYO_APP_VERSION`、`MIHOYO_WEB_SALT` 覆盖。

5. **在 /src/MihoyoCloud/index.js getTokenConfig 方法中设置Token信息**（或使用环境变量 `GENSHIN_TOKENS` / `STARRAIL_TOKENS`）

6. **运行脚本**:
   ```sh
   npm start
   ```

## 常见问题

### 日志提示 `-100 登录状态失效`
说明 Cookie 不是有效的登录态，而不是代码写错。依次检查：

1. Cookie 是否包含 `cookie_token_v2` 或 `cookie_token`；
2. Cookie 是否包含 `ltuid_v2` / `account_id_v2`；
3. 不要用 Console 的 `document.cookie`（HttpOnly 字段看不到），直接用 `npm run login` 自动抓，或从 F12 -> Network 的 Request Headers 复制；
4. 账号是否触发了米游社风控（可先在浏览器打开米游社手动签到确认）。

### 日志提示 `-500001` / 请求被风控
通常是客户端版本号或 `DS` Salt 过期。本项目默认使用 `2.117.0` + `4751cb...`，可通过环境变量覆盖：

```sh
MIHOYO_APP_VERSION=2.117.0 MIHOYO_WEB_SALT=4751cb5557bfad5e249e58462c39fb0a node main.js
```

### GitHub Actions 显示成功但没签到
旧版本在缺少 `MYS_COOKIES` 时会直接跳过并仍然退出码 0。现已改为缺少 Cookie 或存在签到失败时返回非 0，Actions 会显示失败。请检查 `Settings -> Secrets and variables -> Actions` 中的 `MYS_COOKIES`。

## 更新日志

- **2025-02-08**: v1.0.0 初始发布，支持原神和崩铁多账号签到功能。
- **2025-09-17**: v1.1.0 增加云原神云崩铁签到功能。
- **2026-11-26**: v1.2.0 修复签到整体失效：更新客户端版本与网页端 Salt；改用通用 `/event/luna/sign` 接口并先查询签到状态；补齐 Cookie 完整性检查与 `-100` 提示；支持本地 Cookie 文件；失败时返回非 0 退出码。
- 
## 致谢与版权说明

本项目基于 [GildedFlames/MYS_Game_Singin](https://github.com/GildedFlames/MYS_Game_Singin) 进行 Fork 和个性化配置。

**请支持原作者：**
- 原项目地址：https://github.com/GildedFlames/MYS_Game_Singin
- 感谢 [GildedFlames](https://github.com/GildedFlames) 的辛勤开发！

本仓库仅用于个人学习和使用。
