import { createLogger } from 'bunyan'

export const logger = createLogger({
  level: process.env.LOGGER_LEVEL || 'info',
  name: 'prb',
  src: true,
})
export const loggerLevel = logger.level()
logger.info({ loggerLevel }, 'Logging Enabled.')

export default logger
