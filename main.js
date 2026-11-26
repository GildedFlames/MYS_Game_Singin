import { doMYSSign } from './src/MYS/index.js'
import { doCloudSign } from './src/MihoyoCloud/index.js'

async function main() {
  const total = { success: 0, already: 0, failed: 0, skipped: 0 }
  const merge = (stats) => {
    total.success += stats.success
    total.already += stats.already || 0
    total.failed += stats.failed
    total.skipped += stats.skipped || 0
  }

  const mys = []
  mys.push(await doMYSSign('Genshin'))
  mys.push(await doMYSSign('StarRail'))
  mys.forEach(merge)

  const cloud = []
  cloud.push(await doCloudSign('CloudYS'))
  cloud.push(await doCloudSign('CloudSR'))
  cloud.forEach(merge)

  console.log(`\n全部任务结束: 成功 ${total.success}，已签到 ${total.already}，失败 ${total.failed}，跳过 ${total.skipped}`)

  // 米游社 Cookie 是核心功能，缺失时必须让 Actions 显式失败，
  // 避免出现“日志全绿但什么都没签”的假成功。
  if (!mys.some((item) => item.configured)) {
    console.error('未配置米游社 Cookie（MYS_COOKIES），签到未执行。')
    process.exitCode = 1
  } else if (total.failed > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('脚本异常退出:', err?.message || err)
  process.exitCode = 1
})
