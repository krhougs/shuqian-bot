import { ApiPromise, WsProvider } from '@polkadot/api'
import { BN } from 'bn.js'
import {
  action,
  computed,
  configure,
  makeAutoObservable,
  makeObservable,
  observable,
  toJS,
} from 'mobx'
import { iterate, wait } from './utils.js'
import { makePersistable } from 'mobx-persist-store'
import Decimal from 'decimal.js'
import Storage from 'node-persist'
import logger from './logger.js'
import path from 'path'

const DECIMAL_2_POW_64 = new Decimal(2).pow(64)
const BN_2_POW_64 = new BN(2).pow(new BN(64))

configure({ enforceActions: 'never' })

class AppData {
  constructor(storage, resolve) {
    makeObservable(
      this,
      {
        currentHead: observable,
        lastHead: observable,
        pools: observable,
        poolRelationship: computed,
        subscriptions: observable,
        subscriptionMaps: observable,
        setSubscription: action,
        deleteSubscription: action,
      },
      { deep: true }
    )
    makePersistable(this, {
      name: 'AppData',
      properties: [
        'currentHead',
        'lastHead',
        'pools',
        'subscriptions',
        'subscriptionMaps',
      ],
      storage,
    }).then(() => resolve())
  }

  currentHead
  lastHead
  pools = {}

  subscriptions = {}
  subscriptionMaps = {}

  getSubscription(chatId, key) {
    return this.subscriptionMaps[chatId]?.[key]
      ? this.subscriptions[key]
      : undefined
  }
  setSubscription(chatId, key) {
    if (this.getSubscription(chatId, key)) {
      throw new Error('Subscription exists.')
    }
    this.subscriptionMaps[chatId] ||= {}
    this.subscriptionMaps[chatId][key] = key
    this.subscriptions[key] ||= {
      current: null,
      last: null,
      previousPoint: null,
    }
  }
  deleteSubscription(chatId, key) {
    if (this.getSubscription(chatId, key)) {
      delete this.subscriptionMaps[chatId]?.[key]
    }
  }

  get poolRelationship() {
    return [
      ...new Set(
        Object.values(this.subscriptionMaps)
          .map((i) => Object.keys(i))
          .flat(1)
      ),
    ]
      .map((i) => i.split('_'))
      .reduce((prev, curr) => {
        prev[curr[0]] ||= []
        prev[curr[0]].push(curr[1])
        return prev
      }, {})
  }
}

class Pool {
  constructor() {
    makeAutoObservable(this)
  }
  workers = []
  info
  rewardAcc
  pid
  updatedAt = Date.now()
}

class Worker {
  constructor() {
    makeAutoObservable(this)
  }
  rewardAcc
  updatedAt = Date.now()
}

class Subscription {
  constructor(currentHeight) {
    makeAutoObservable(this)
    this.currentHeight = currentHeight
  }

  currentHeight
  updatedAt = Date.now()
  ownerClaimable
  delegatorClaimable
}

const initStorage = async (dir) => {
  const storage = Storage.create()
  await storage.init({
    dir,
  })
  let storageInit__resolve
  const storageInit__promise = new Promise((resolve) => {
    storageInit__resolve = resolve
  })
  const appData = new AppData(storage, storageInit__resolve)
  await storageInit__promise
  return appData
}

const wrapSetData = (appData, getApiAt, api) => () =>
  setData(appData, getApiAt(), api)

const setData = async (appData, apiAt, api) => {
  const relationship = toJS(appData.poolRelationship)
  const keys = Object.keys(relationship)
  const rawPools = (
    await Promise.all(
      keys.map((pid) => apiAt.query.phalaStakePool.stakePools(pid))
    )
  )
    .map((i) => (i.isSome ? i.unwrap() : null))
    .filter((i) => i)
  await Promise.all(
    rawPools.map(async (rawPool) => {
      const pid = rawPool.pid.toNumber()
      const pool = new Pool()
      pool.pid = pid
      pool.info = rawPool.toJSON()
      pool.rewardAcc = rawPool.rewardAcc.toString()
      appData.pools[pid] = pool
      await Promise.all(
        relationship[pid].map(async (accountId) => {
          const key = `${pid}_${accountId}`
          const subObj = appData.subscriptions[key]
          const current = new Subscription(appData.currentHead.height)
          current.ownerClaimable =
            accountId === rawPool.owner.toString()
              ? rawPool.ownerReward.toString()
              : '0'
          let stakeInfo = await apiAt.query.phalaStakePool.poolStakers([
            pid,
            accountId,
          ])
          stakeInfo = stakeInfo.isSome ? stakeInfo.unwrap() : null
          current.delegatorClaimable = stakeInfo
            ? new Decimal(stakeInfo.shares.toString())
                .mul(
                  new Decimal(rawPool.rewardAcc.toString()).div(
                    DECIMAL_2_POW_64
                  )
                )
                .sub(new Decimal(stakeInfo.rewardDebt.toString()))
                .round()
                .toString()
            : '0'
          if (!subObj.previousPoint) {
            subObj.previousPoint = current
          }
          subObj.last = subObj.current
          subObj.current = current
        })
      )
    })
  )
}

const createDataProvider = async () => {
  const appData = await initStorage(
    process.env.DATA_PATH ?? path.join(process.env.PWD, '/data')
  )
  const wsProvider = new WsProvider('wss://khala-api.phala.network/ws')
  const api = await ApiPromise.create({ provider: wsProvider })

  api.on('disconnected', (e) => {
    logger.error(e)
    process.exit(255)
  })

  let currentHeadHash = null
  let currentNumber = 0
  let apiAtCurrent = null

  const _setData = wrapSetData(appData, () => apiAtCurrent, api)

  iterate(
    async function* () {
      while (true) {
        const newHeadHash = await api.rpc.chain.getFinalizedHead()
        if (!newHeadHash.eq(currentHeadHash)) {
          currentHeadHash = newHeadHash
          apiAtCurrent = await api.at(currentHeadHash)
          currentNumber = (await apiAtCurrent.query.system.number()).toNumber()
          appData.lastHead = appData.currentHead
          appData.currentHead = {
            hash: currentHeadHash.toHex(),
            height: currentNumber,
            updatedAt: Date.now(),
          }
          yield _setData
          logger.info('Processed #' + currentNumber)
        }
        await wait(3000)
      }
    },
    async (e, attempt, setShouldIgnore) => {
      logger.error(e)
    },
    async (e) => {
      logger.error(e)
    },
    0
  )

  return [appData, api]
}

export { createDataProvider }
