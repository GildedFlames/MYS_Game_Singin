import axios from 'axios'

const client = axios.create({
  timeout: 20000,
  validateStatus: () => true
})

const randomSleep = (min, max) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min
  if (delay <= 0) return Promise.resolve()
  console.log(`Sleeping for ${delay} seconds...`)
  return new Promise((resolve) => setTimeout(resolve, delay * 1000))
}

let warnedMissingTokens = false

const getTokenConfig = async () => {
  const genshinTokens = process.env.GENSHIN_TOKENS
  const StarRailTokens = process.env.STARRAIL_TOKENS
  if (!genshinTokens && !StarRailTokens) {
    if (!warnedMissingTokens) {
      console.warn('[Cloud] 未配置 GENSHIN_TOKENS / STARRAIL_TOKENS，跳过云游戏签到。')
      warnedMissingTokens = true
    }
    return { CloudYS: [], CloudSR: [] }
  }
  const genshinTokenArr = genshinTokens ? genshinTokens.split(',').map((v) => v.trim()).filter(Boolean) : []
  const StarRailTokenArr = StarRailTokens ? StarRailTokens.split(',').map((v) => v.trim()).filter(Boolean) : []
  return { CloudYS: genshinTokenArr, CloudSR: StarRailTokenArr }
}

const commonHeaders = {
  Connection: 'Keep-Alive',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'zh-CN,zh;q=0.9',
  Accept: 'application/json, text/plain, */*',
  'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'x-rpc-channel': 'mihoyo',
  'x-rpc-client_type': 17,
  'x-rpc-combo_token': '',
  'x-rpc-cps': 'mac_mihoyo',
  'x-rpc-device_id': '1b252815-b2df-494f-8c84-a93e1a6d3479',
  'x-rpc-device_model': 'Macintosh',
  'x-rpc-device_name': 'Apple Macintosh',
  'x-rpc-language': 'zh-cn',
  'x-rpc-sys_version': 'Mac OS 10.15.7',
  'x-rpc-vendor_id': 2
}

const gameConfig = {
  CloudYS: {
    headers: {
      Host: 'api-cloudgame.mihoyo.com',
      origin: 'https://ys.mihoyo.com',
      Referer: 'https://ys.mihoyo.com/',
      'x-rpc-app_id': 4,
      'x-rpc-app_version': '6.0.0',
      'x-rpc-cg_game_biz': 'hk4e_cn',
      'x-rpc-op_biz': 'clgm_cn'
    },
    baseURL: 'https://api-cloudgame.mihoyo.com/hk4e_cg_cn'
  },
  CloudSR: {
    headers: {
      Host: 'cg-hkrpg-api.mihoyo.com',
      origin: 'https://sr.mihoyo.com',
      Referer: 'https://sr.mihoyo.com/',
      'x-rpc-app_id': 8,
      'x-rpc-app_version': '3.5.0',
      'x-rpc-cg_game_biz': 'hkrpg_cn',
      'x-rpc-op_biz': 'clgm_hkrpg-cn'
    },
    baseURL: 'https://cg-hkrpg-api.mihoyo.com/hkrpg_cn/cg'
  }
}

function explainCloudRetcode(retcode, message) {
  if (retcode === -100) return 'Token 失效或账号存在防沉迷限制，请重新获取 x-rpc-combo_token'
  return message || `retcode=${retcode}`
}

async function request(gameKey, token, config, label) {
  try {
    const res = await client.request({
      ...config,
      headers: { ...commonHeaders, ...gameConfig[gameKey].headers, 'x-rpc-combo_token': token }
    })
    if (res.status !== 200) {
      console.error(`[${gameKey}] ${label} HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 300)}`)
      return null
    }
    return res.data
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status} ${JSON.stringify(err.response.data)?.slice(0, 300)}`
      : `${err.code || err.name}: ${err.message}`
    console.error(`[${gameKey}] ${label} 请求失败: ${detail}`)
    return null
  }
}

const getWallet = async (gameKey, token) => {
  const data = await request(gameKey, token, {
    method: 'GET',
    url: gameConfig[gameKey].baseURL + '/wallet/wallet/get'
  }, '查询云游戏钱包')

  if (!data) return false
  if (data.retcode !== 0) {
    console.error(`[${gameKey}] 查询钱包失败: ${explainCloudRetcode(data.retcode, data.message)}`)
    return false
  }
  const freeTime = data.data?.free_time?.free_time
  const totalTime = data.data?.total_time
  const sendFreeTime = data.data?.free_time?.send_freetime
  const extra = sendFreeTime ? `，本次获得 ${sendFreeTime} 分钟` : ''
  console.log(`[${gameKey}] 云游戏签到成功${extra}，免费时长: ${freeTime}，总时长: ${totalTime}`)
  return true
}

const getNotifications = async (gameKey, token) => {
  const data = await request(gameKey, token, {
    method: 'GET',
    url: gameConfig[gameKey].baseURL + '/gamer/api/listNotifications?status=NotificationStatusUnread&type=NotificationTypePopup&is_sort=true'
  }, '查询云游戏通知')

  if (!data || data.retcode !== 0) {
    // 通知清理只是附加功能，失败不影响签到结果。
    return []
  }
  return data.data?.list || []
}

const ackNotifications = async (gameKey, token, id) => {
  const data = await request(gameKey, token, {
    method: 'POST',
    url: gameConfig[gameKey].baseURL + '/gamer/api/ackNotification',
    data: { id }
  }, '确认云游戏通知')
  return Boolean(data && data.retcode === 0)
}

const doCloudSign = async (gameKey) => {
  const stats = { success: 0, already: 0, failed: 0, skipped: 0, configured: false }
  const tokenList = (await getTokenConfig())[gameKey]
  if (!tokenList.length) return stats
  stats.configured = true

  console.info(`[${gameKey}] 开始云游戏签到，共 ${tokenList.length} 个账号\n`)
  for (let i = 0; i < tokenList.length; i += 1) {
    const token = tokenList[i]
    if (!token) continue
    console.log(`[${gameKey}] 账号 ${i + 1} 开始签到...`)
    const ok = await getWallet(gameKey, token)
    if (ok) stats.success += 1
    else stats.failed += 1

    // 清理未读的云游戏弹窗通知；失败不影响签到。
    if (ok) {
      const notifications = await getNotifications(gameKey, token)
      if (notifications.length) {
        console.log(`[${gameKey}] 待确认通知 ${notifications.length} 条`)
        for (const notification of notifications) {
          await randomSleep(1, 3)
          await ackNotifications(gameKey, token, notification.id)
        }
      }
    }

    if (i < tokenList.length - 1) await randomSleep(3, 9)
  }
  console.info(`[${gameKey}] 云游戏签到结束: 成功 ${stats.success}，失败 ${stats.failed}\n`)
  return stats
}

export { doCloudSign }
