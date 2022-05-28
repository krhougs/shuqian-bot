import { BN } from 'bn.js'
import { Telegraf } from 'telegraf'
import { scheduleJob } from 'node-schedule'
import dayjs from 'dayjs'
import logger from './logger.js'
import relativeTime from 'dayjs/plugin/relativeTime.js'

dayjs.extend(relativeTime)

const STICKER_QUESTION =
  'CAACAgUAAxkBAAMfYpFsE_aoOiHKsL7CXxUnV6iamlsAAi8AA-vpsBrDZy_iMz0aoSQE'

const BN_ONE = new BN('1')

const startBotListener = (appData, api) => {
  const bot = new Telegraf(process.env.BOT_TOKEN)
  api._bot = bot

  const wrapCommand = (command, handler) => {
    bot.command(command, async (ctx) => {
      ctx.commandParams = ctx.message.text.trim().split(' ')
      try {
        await handler(ctx, bot, appData, api)
      } catch (e) {
        logger.error(e)
        ctx.reply('挂了。')
      }
    })
  }

  bot.start((ctx) =>
    ctx.replyWithSticker(
      'CAACAgUAAxkBAAMQYpFrUWJLcDb9S_x__xyKqiWjZAsAAlEBAAL7WcseFveO_uijFvokBA'
    )
  )
  bot.help((ctx) => ctx.replyWithSticker(STICKER_QUESTION))

  wrapCommand('get_subscriptions', handleGetSubscriptions)
  wrapCommand('shuqian', handleGetSubscriptions)
  wrapCommand('subscribe', handleSubscribe)
  wrapCommand('unsubscribe', handleUnsubscribe)

  setupScheduler(bot, appData, api)

  const ret = bot.launch()

  process.once('SIGINT', () => {
    bot.stop('SIGINT')
    process.exit(255)
  })
  process.once('SIGTERM', () => {
    bot.stop('SIGTERM')
    process.exit(255)
  })

  return ret
}

const setupScheduler = (bot, appData, api) => {
  scheduleJob(process.env.CRON ?? '0 8 * * *', async () => {
    const chats = Object.keys(appData.subscriptionMaps)
    await Promise.all(
      chats.map(async (chatId) => {
        const keys = Object.keys(appData.subscriptionMaps[chatId])
        await Promise.all(
          keys.map(async (k) => {
            const [pid, accountId] = k.split('_')
            const { current, previousPoint } = appData.subscriptions[k]
            if (!current) {
              return
            }
            const currentOwnerClaimable = new BN(current.ownerClaimable)
            const prevOwnerClaimable = new BN(previousPoint.ownerClaimable)
            const deltaOwnerClaimable =
              currentOwnerClaimable.sub(prevOwnerClaimable)
            const currentOwnerClaimableBalance = api.createType(
              'BalanceOf',
              new BN(current.ownerClaimable)
            )
            const prevOwnerClaimableBalance = api.createType(
              'BalanceOf',
              new BN(previousPoint.ownerClaimable)
            )
            const deltaOwnerClaimableBalance = api.createType(
              'BalanceOf',
              deltaOwnerClaimable
            )
            const currentDelegatorClaimable = new BN(current.delegatorClaimable)
            const prevDelegatorClaimable = new BN(
              previousPoint.delegatorClaimable
            )
            const deltaDelegatorClaimable = currentDelegatorClaimable.sub(
              prevDelegatorClaimable
            )
            const currentDelegatorClaimableBalance = api.createType(
              'BalanceOf',
              new BN(current.delegatorClaimable)
            )
            const prevDelegatorClaimableBalance = api.createType(
              'BalanceOf',
              new BN(previousPoint.delegatorClaimable)
            )
            const deltaDelegatorClaimableBalance = api.createType(
              'BalanceOf',
              deltaDelegatorClaimable
            )

            const prevTime = dayjs(previousPoint.updatedAt)

            await bot.telegram.sendMessage(
              chatId,
              `<b>Daily Report</b>
<code>${accountId}</code>
@Pool #${pid} from <b>${prevTime.fromNow()}</b> to Now

<b>Owner Claimable</b>
${prevOwnerClaimableBalance.toHuman()} ➡ ${deltaOwnerClaimableBalance.toHuman()} ➡ ${currentOwnerClaimableBalance.toHuman()}

<b>Delegator Claimable</b>
${prevDelegatorClaimableBalance.toHuman()} ➡ ${deltaDelegatorClaimableBalance.toHuman()} ➡ ${currentDelegatorClaimableBalance.toHuman()}

<i>Last point: ${prevTime.format()}</i>`,
              {
                parse_mode: 'HTML',
              }
            )
          })
        )
      })
    )
    Object.values(appData.subscriptions).forEach((obj) => {
      obj.previousPoint = obj.current || obj.previousPoint
    })
  })
}

const handleGetSubscriptions = async (ctx, bot, appData, api) => {
  const keys = Object.keys(appData.subscriptionMaps[ctx.chat.id])
  await Promise.all(
    keys.map(async (k) => {
      const [pid, accountId] = k.split('_')
      const { current, previousPoint } = appData.subscriptions[k]
      const currentOwnerClaimable = new BN(current.ownerClaimable)
      const prevOwnerClaimable = new BN(previousPoint.ownerClaimable)
      const deltaOwnerClaimable = currentOwnerClaimable.sub(prevOwnerClaimable)
      const currentOwnerClaimableBalance = api.createType(
        'BalanceOf',
        new BN(current.ownerClaimable)
      )
      const prevOwnerClaimableBalance = api.createType(
        'BalanceOf',
        new BN(previousPoint.ownerClaimable)
      )
      const deltaOwnerClaimableBalance = api.createType(
        'BalanceOf',
        deltaOwnerClaimable
      )
      const currentDelegatorClaimable = new BN(current.delegatorClaimable)
      const prevDelegatorClaimable = new BN(previousPoint.delegatorClaimable)
      const deltaDelegatorClaimable = currentDelegatorClaimable.sub(
        prevDelegatorClaimable
      )
      const currentDelegatorClaimableBalance = api.createType(
        'BalanceOf',
        new BN(current.delegatorClaimable)
      )
      const prevDelegatorClaimableBalance = api.createType(
        'BalanceOf',
        new BN(previousPoint.delegatorClaimable)
      )
      const deltaDelegatorClaimableBalance = api.createType(
        'BalanceOf',
        deltaDelegatorClaimable
      )

      const prevTime = dayjs(previousPoint.updatedAt)

      await ctx.replyWithHTML(`<b>Current Status</b>
<code>${accountId}</code>
@Pool #${pid} from <b>${prevTime.fromNow()}</b> to Now

<b>Owner Claimable</b>
${prevOwnerClaimableBalance.toHuman()} ➡ ${deltaOwnerClaimableBalance.toHuman()} ➡ ${currentOwnerClaimableBalance.toHuman()}

<b>Delegator Claimable</b>
${prevDelegatorClaimableBalance.toHuman()} ➡ ${deltaDelegatorClaimableBalance.toHuman()} ➡ ${currentDelegatorClaimableBalance.toHuman()}

<i>Last point: ${prevTime.format()}</i>`)
    })
  )
}

const handleSubscribe = async (ctx, bot, appData, api) => {
  const { commandParams } = ctx
  if (commandParams.length < 3) {
    await ctx.replyWithHTML('Usage:\n/subscribe <i>pid</i> <i>account_id</i>')
    return
  }
  if (commandParams.length > 3) {
    await ctx.replyWithSticker(STICKER_QUESTION)
    return
  }

  const pid = parseInt(commandParams[1])
  const accountId = commandParams[2]
  const key = `${pid}_${accountId}`
  const chatId = `${ctx.chat.id}`

  if (!(pid && pid > 0)) {
    await ctx.replyWithSticker(STICKER_QUESTION)
    return
  }
  try {
    const account = await api.query.system.account(accountId)
    if (account.nonce.lt(BN_ONE)) {
      await ctx.replyWithSticker(STICKER_QUESTION)
      return
    }
  } catch (e) {
    logger.error('Failed to validate account:', e, commandParams)
    await ctx.replyWithSticker(STICKER_QUESTION)
    return
  }

  if (typeof appData.getSubscription(chatId, key) === 'undefined') {
    appData.setSubscription(chatId, key)
    await ctx.reply('👌')
    return
  }
  await ctx.reply('Subscription exists.')
}

const handleUnsubscribe = async (ctx, bot, appData) => {
  const { commandParams } = ctx
  if (commandParams.length < 3) {
    await ctx.replyWithHTML('Usage:\n/unsubscribe <i>pid</i> <i>account_id</i>')
    return
  }

  const pid = parseInt(commandParams[1])
  const accountId = commandParams[2]
  const key = `${pid}_${accountId}`
  const chatId = `${ctx.chat.id}`

  if (typeof appData.getSubscription(chatId, key) === 'undefined') {
    await ctx.replyWithSticker(STICKER_QUESTION)
    return
  }
  appData.deleteSubscription(chatId, key)
  await ctx.reply('拜拜了您嘞～')
}

export { startBotListener }
