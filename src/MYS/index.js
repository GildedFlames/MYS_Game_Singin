import axios from 'axios'
import md5 from 'md5'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// 2026 年米游社前端迁移到 www.miyoushe.com 后，登录 Cookie 也落在 .miyoushe.com；
// 继续请求 api-takumi.mihoyo.com 会拿不到登录态（-100）。
// 优先新域名，失败再回退老域名，兼容两种登录方式。
const API_HOSTS = [...new Set([
  process.env.MIHOYO_API_HOST,
  'api-takumi.miyoushe.com',
  'api-takumi.mihoyo.com'
].filter(Boolean))]
// 米游社客户端版本 / 网页端签名 Salt。两者必须与当前线上版本匹配，
// 旧版本（例如 2.81.1 + yUZ3s0...）会被服务端判定为登录状态失效。
const APP_VERSION = process.env.MIHOYO_APP_VERSION || '2.117.0'
const WEB_SALT = process.env.MIHOYO_WEB_SALT || '4751cb5557bfad5e249e58462c39fb0a'
const CLIENT_TYPE = '5'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LOCAL_COOKIE_FILES = ['MY cook 不上传i.txt', 'cookie.txt', '.cookie']

const GAMES = {
  Genshin: {
    game_biz: 'hk4e_cn',
    act_id: 'e202311201442471',
    fallback_region: 'cn_gf01',
    signgame: 'hk4e'
  },
  StarRail: {
    game_biz: 'hkrpg_cn',
    act_id: 'e202304121516551',
    fallback_region: 'prod_gf_cn',
    // 星铁签到时不需要 x-rpc-signgame，活动 ID 已经能区分游戏。
    signgame: undefined
  }
}

const client = axios.create({
  timeout: 20000,
  // 交给调用方统一处理非 2xx，避免把带 Cookie 的完整请求对象打进日志。
  validateStatus: () => true
})

const randomSleep = (min, max) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min
  if (delay <= 0) return Promise.resolve()
  console.log(`Sleeping for ${delay} seconds...`)
  return new Promise((resolve) => setTimeout(resolve, delay * 1000))
}

function readLocalCookie() {
  for (const name of LOCAL_COOKIE_FILES) {
    const file = path.join(ROOT_DIR, name)
    if (fs.existsSync(file)) {
      console.warn(`[MYS] MYS_COOKIES 未设置，使用本地 Cookie 文件: ${name}`)
      return fs.readFileSync(file, 'utf8').trim()
    }
  }
  return ''
}

function normalizeCookie(value) {
  let cookie = String(value || '').trim()
  // 兼容用户直接粘贴 “Cookie: xxx” 或带引号的情况。
  cookie = cookie.replace(/^cookie\s*:\s*/i, '').trim()
  if ((cookie.startsWith('"') && cookie.endsWith('"')) || (cookie.startsWith("'") && cookie.endsWith("'"))) {
    cookie = cookie.slice(1, -1).trim()
  }
  return cookie
}

function splitCookies(raw) {
  // 英文逗号、中文逗号、换行都可以作为多账号分隔符
  return raw.split(/[,，\r\n]+/).map(normalizeCookie).filter(Boolean)
}

const getCookieConfig = () => {
  const fromEnv = [process.env.MYS_COOKIES, process.env.MYS_COOKIE]
    .filter(Boolean)
    .join(',')
  const raw = (fromEnv || readLocalCookie()).trim()
  if (!raw) {
    console.error('[MYS] 缺少 Cookie。请设置 MYS_COOKIES，或把完整 Cookie 写入 MY cook 不上传i.txt / cookie.txt。')
    return { Genshin: [], StarRail: [] }
  }
  const list = splitCookies(raw)
  return { Genshin: list, StarRail: list }
}

function parseCookie(cookie) {
  const map = new Map()
  for (const part of String(cookie).split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    map.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return map
}

function testCookie(cookie) {
  const fields = parseCookie(cookie)
  const missing = []
  if (!fields.get('cookie_token_v2') && !fields.get('cookie_token')) {
    missing.push('cookie_token_v2/cookie_token')
  }
  if (!fields.get('ltuid_v2') && !fields.get('ltuid') && !fields.get('account_id_v2') && !fields.get('account_id')) {
    missing.push('ltuid_v2/ltuid')
  }
  return missing
}

function maskCookie(cookie) {
  const fields = parseCookie(cookie)
  const uid = fields.get('ltuid_v2') || fields.get('ltuid') || fields.get('account_id_v2') || 'unknown'
  return `ltuid=${uid}`
}

function getDS() {
  const t = Math.floor(Date.now() / 1000)
  const r = Math.random().toString(36).slice(-6)
  return `${t},${r},${md5(`salt=${WEB_SALT}&t=${t}&r=${r}`)}`
}

function buildHeaders(cookie, extra = {}) {
  const deviceId = parseCookie(cookie).get('_MHYUUID') || randomUUID()
  return {
    DS: getDS(),
    Cookie: cookie,
    'User-Agent': `Mozilla/5.0 (Linux; Android 12; Unspecified Device) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/103.0.5060.129 Mobile Safari/537.36 miHoYoBBS/${APP_VERSION}`,
    'x-rpc-app_version': APP_VERSION,
    'x-rpc-client_type': CLIENT_TYPE,
    'x-rpc-device_id': deviceId,
    'x-rpc-channel': 'miyousheluodi',
    'X-Requested-With': 'com.mihoyo.hyperion',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,en-US;q=0.8',
    'Origin': 'https://webstatic.mihoyo.com',
    'Referer': 'https://webstatic.mihoyo.com/',
    ...extra
  }
}

async function request(config, label) {
  try {
    const res = await client.request(config)
    if (res.status !== 200) {
      console.error(`[MYS] ${label} HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 300)}`)
      return null
    }
    return res.data
  } catch (err) {
    // 只打印安全的摘要，绝不能打印 err.config（里面含有 Cookie）。
    const detail = err.response
      ? `HTTP ${err.response.status} ${JSON.stringify(err.response.data)?.slice(0, 300)}`
      : `${err.code || err.name}: ${err.message}`
    console.error(`[MYS] ${label} 请求失败: ${detail}`)
    return null
  }
}

function explainRetcode(retcode, message) {
  if (retcode === -100) {
    return '登录状态失效。Cookie 不完整、已过期，或与接口域名不匹配（.miyoushe.com / .mihoyo.com 是两套 Cookie）。请确认 Cookie 来自能返回角色列表的域名，且包含 cookie_token_v2；document.cookie 看不到 HttpOnly 的 cookie_token_v2，要从 F12 -> Network 的 Request Headers 复制。'
  }
  if (retcode === -500001) {
    return '请求被风控/参数缺失（-500001）。请确认客户端版本与 Salt 是否仍为最新，并稍后重试。'
  }
  return message || `retcode=${retcode}`
}

async function getRoles(cookie, gameKey) {
  const game = GAMES[gameKey]
  const failures = []

  for (const host of API_HOSTS) {
    const data = await request({
      method: 'GET',
      url: `https://${host}/binding/api/getUserGameRolesByCookie`,
      params: { game_biz: game.game_biz },
      headers: buildHeaders(cookie)
    }, `[${gameKey}] 获取角色列表 (${host})`)

    if (!data) {
      failures.push(`${host}: 网络错误`)
      continue
    }
    if (data.retcode !== 0) {
      failures.push(`${host}: ${data.retcode} ${data.message || ''}`.trim())
      continue
    }

    const roles = data.data?.list || []
    console.log(`[${gameKey}] 登录成功，接口域名: ${host}`)
    if (!roles.length) {
      console.info(`[${gameKey}] 该账号下没有绑定${gameKey === 'Genshin' ? '原神' : '星穹铁道'}角色`)
    }
    return { roles, host, error: null }
  }

  console.error(`[${gameKey}] 登录失败: ${explainRetcode(-100)}`)
  console.error(`[${gameKey}] 接口尝试结果: ${failures.join(' | ')}`)
  return { roles: [], host: null, error: 'auth' }
}

async function getSignInfo(cookie, gameKey, role, host) {
  const game = GAMES[gameKey]
  const headers = buildHeaders(cookie, {
    'Origin': 'https://act.mihoyo.com',
    'Referer': 'https://act.mihoyo.com/'
  })
  if (game.signgame) headers['x-rpc-signgame'] = game.signgame

  const data = await request({
    method: 'GET',
    url: `https://${host}/event/luna/info`,
    params: {
      lang: 'zh-cn',
      act_id: game.act_id,
      region: role.region || game.fallback_region,
      uid: role.game_uid
    },
    headers
  }, `[${gameKey}] 查询签到状态`)

  if (!data) return null
  if (data.retcode !== 0) {
    console.error(`[${gameKey}] 查询签到状态失败: ${explainRetcode(data.retcode, data.message)}`)
    return null
  }
  return data.data
}

async function signRole(cookie, gameKey, role, host) {
  const game = GAMES[gameKey]
  const region = role.region || game.fallback_region
  const info = await getSignInfo(cookie, gameKey, role, host)

  if (!info) return 'failed'
  if (info.first_bind) {
    console.warn(`[${gameKey}] ${role.nickname}(${role.game_uid}) 是第一次绑定米游社，请先在米游社手动签到一次`)
    return 'skipped'
  }
  if (info.is_sign) {
    console.log(`[${gameKey}] ${role.nickname}(${role.game_uid}) 今天已经签到过了，连续签到 ${info.total_sign_day} 天`)
    return 'already'
  }

  const headers = buildHeaders(cookie, {
    'Content-Type': 'application/json;charset=utf-8',
    'Origin': 'https://act.mihoyo.com',
    'Referer': 'https://act.mihoyo.com/',
    'Sec-Fetch-Site': 'same-site'
  })
  if (game.signgame) headers['x-rpc-signgame'] = game.signgame

  const data = await request({
    method: 'POST',
    url: `https://${host}/event/luna/sign`,
    headers,
    data: { act_id: game.act_id, region, uid: role.game_uid }
  }, `[${gameKey}] 签到`)

  if (!data) return 'failed'
  const result = data.data || {}

  if (data.retcode === -5003) {
    console.log(`[${gameKey}] ${role.nickname}(${role.game_uid}) 今天已经签到过了`)
    return 'already'
  }
  if (data.retcode === 0 && (result.success === 0 || result.success === undefined)) {
    console.log(`[${gameKey}] ${role.nickname}(${role.game_uid}) 签到成功`)
    return 'success'
  }
  if (result.success === 1) {
    console.error(`[${gameKey}] ${role.nickname}(${role.game_uid}) 签到触发人机验证（captcha），需要手动处理。gt=${result.gt || ''}`)
    return 'failed'
  }

  console.error(`[${gameKey}] ${role.nickname}(${role.game_uid}) 签到失败: ${explainRetcode(data.retcode, data.message)}`)
  return 'failed'
}

const doMYSSign = async (gameKey) => {
  const stats = { success: 0, already: 0, failed: 0, skipped: 0, configured: false }
  const cookieList = getCookieConfig()[gameKey]
  if (!cookieList.length) return stats
  stats.configured = true

  console.info(`[${gameKey}] 开始签到，共 ${cookieList.length} 个账号\n`)
  for (let i = 0; i < cookieList.length; i += 1) {
    const cookie = cookieList[i]
    if (!cookie) continue

    console.log(`[${gameKey}] 账号 ${i + 1} (${maskCookie(cookie)}) 开始签到...`)
    const missing = testCookie(cookie)
    if (missing.length) {
      console.warn(`[${gameKey}] Cookie 缺少字段: ${missing.join(', ')}。cookie_token_v2 是 HttpOnly，document.cookie 看不到；请从 F12 -> Network -> api-takumi.miyoushe.com 请求 -> Request Headers 复制完整 Cookie。`)
    }

    const { roles, host, error } = await getRoles(cookie, gameKey)
    if (error === null) {
      for (const role of roles) {
        const result = await signRole(cookie, gameKey, role, host)
        stats[result] += 1
        await randomSleep(1, 3)
      }
    } else {
      stats.failed += 1
    }

    if (i < cookieList.length - 1) await randomSleep(3, 9)
  }
  console.info(`[${gameKey}] 签到结束: 成功 ${stats.success}，已签到 ${stats.already}，失败 ${stats.failed}，跳过 ${stats.skipped}\n`)
  return stats
}

export { doMYSSign, getDS, parseCookie, normalizeCookie, splitCookies }
