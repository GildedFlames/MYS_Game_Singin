#!/usr/bin/env node
/**
 * 本地获取米游社完整 Cookie（包含 HttpOnly 的 cookie_token_v2）。
 *
 * 用法：
 *   npm run login                         # 写入 cookie.txt
 *   npm run login -- --append             # 追加/刷新一个账号（默认就是追加）
 *   npm run login -- --file "MY cook 不上传i.txt"
 *   npm run login -- --overwrite          # 覆盖文件，只保留当前账号
 *   npm run login -- --no-proxy           # 系统代理导致打不开登录页时使用
 *   npm run login -- --browser "C:\\...\\msedge.exe"
 *
 * 说明：
 * - 使用本机已安装的 Edge / Chrome，不需要额外下载浏览器。
 * - 打开的是无痕上下文，不会读取你日常浏览器的登录状态，需要现场登录一次。
 * - 登录成功后把 Cookie 写入文件，不会把 Cookie 打印到终端。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(name)
const getArg = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const targetFile = path.resolve(getArg('--file', 'cookie.txt'))
const overwrite = hasFlag('--overwrite')
const noProxy = hasFlag('--no-proxy')
const loginTimeout = Number(getArg('--timeout', '300')) * 1000
const explicitBrowser = getArg('--browser', process.env.BROWSER_PATH || '')

const BROWSER_CANDIDATES = [
  explicitBrowser,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean)

function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }
  return ''
}

function parseCookie(cookie) {
  const map = new Map()
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=')
    if (index > 0) map.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return map
}

function findUid(cookie) {
  const fields = parseCookie(cookie)
  return fields.get('ltuid_v2') || fields.get('ltuid') || fields.get('account_id_v2') || fields.get('account_id') || ''
}

function buildCookie(cookies) {
  const groups = new Map()
  for (const cookie of cookies) {
    if (!groups.has(cookie.domain)) groups.set(cookie.domain, [])
    groups.get(cookie.domain).push(cookie)
  }

  const tokenGroups = [...groups.entries()].filter(([, list]) =>
    list.some((c) => c.name === 'cookie_token_v2' || c.name === 'cookie_token' || c.name === 'ltoken_v2')
  )
  if (!tokenGroups.length) return ''

  // 优先 .mihoyo.com（老接口），其次 .miyoushe.com（新接口）；两个域名只取一套，避免同名 Cookie 冲突。
  tokenGroups.sort(([a], [b]) => {
    const score = (domain) => (domain.endsWith('mihoyo.com') && !domain.endsWith('miyoushe.com') ? 2 : 1)
    return score(b) - score(a)
  })

  return tokenGroups[0][1].map((c) => `${c.name}=${c.value}`).join('; ')
}

function mergeCookieLine(content, newCookie) {
  const uid = findUid(newCookie)
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const kept = lines.filter((line) => {
    const oldUid = findUid(line)
    return !uid || !oldUid || oldUid !== uid
  })
  kept.push(newCookie)
  return kept.join('\n') + '\n'
}

async function main() {
  let chromium
  try {
    ({ chromium } = await import('playwright-core'))
  } catch {
    console.error('缺少 playwright-core，请先执行: npm install')
    process.exit(1)
  }

  const executablePath = findBrowser()
  if (!executablePath) {
    console.error('没有找到 Edge/Chrome，请用 --browser 指定浏览器路径，或设置 BROWSER_PATH。')
    process.exit(1)
  }

  const browserArgs = ['--no-first-run', '--no-default-browser-check', '--start-maximized']
  if (noProxy) browserArgs.push('--no-proxy-server', '--proxy-bypass-list=*')

  const browser = await chromium.launch({ headless: false, executablePath, args: browserArgs })
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: null })
    const page = await context.newPage()

    console.log('已打开浏览器，请登录米游社（扫码或账号密码）。')
    console.log('登录成功后会自动抓取，窗口自动关闭。')

    try {
      await page.goto('https://user.mihoyo.com/', { waitUntil: 'commit', timeout: 45000 })
    } catch (err) {
      console.log('打开 user.mihoyo.com 失败，尝试 www.miyoushe.com：' + err.message)
      await page.goto('https://www.miyoushe.com/ys/', { waitUntil: 'commit', timeout: 45000 })
    }

    let captured = ''
    const deadline = Date.now() + loginTimeout
    while (Date.now() < deadline) {
      const cookies = await context.cookies()
      const names = new Set(cookies.map((c) => c.name))
      if (names.has('cookie_token_v2') || names.has('cookie_token') || names.has('ltoken_v2')) {
        captured = buildCookie(cookies)
        if (captured) break
      }
      await page.waitForTimeout(1500)
    }

    if (!captured) {
      console.error('超时：没有检测到登录 Cookie。')
      process.exitCode = 2
      return
    }

    // 再访问一次米游社，尽量同步 .miyoushe.com 一侧的 Cookie
    try {
      await page.goto('https://www.miyoushe.com/ys/', { waitUntil: 'commit', timeout: 60000 })
      await page.waitForTimeout(5000)
      const synced = buildCookie(await context.cookies())
      if (synced) captured = synced
    } catch {
      // 同步失败不影响已经拿到的 .mihoyo.com Cookie
    }

    const uid = findUid(captured)
    if (!uid) {
      console.error('抓到的 Cookie 里没有 ltuid，登录可能未完成。')
      process.exitCode = 3
      return
    }

    let existing = ''
    if (!overwrite && fs.existsSync(targetFile)) existing = fs.readFileSync(targetFile, 'utf8')
    const output = overwrite ? captured + '\n' : mergeCookieLine(existing, captured)
    fs.writeFileSync(targetFile, output, { mode: 0o600 })

    const count = output.split(/\r?\n/).filter(Boolean).length
    console.log(`已写入: ${targetFile}`)
    console.log(`当前账号: ltuid=${uid}`)
    console.log(`文件中账号数: ${count}`)
    console.log('下一步: npm start 验证；GitHub 上把文件内容填到 MYS_COOKIES（多账号用逗号或换行分隔）。')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('抓取失败: ' + (err?.message || err))
  process.exitCode = 1
})
