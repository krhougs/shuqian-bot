import { createDataProvider } from './data.js'
import { startBotListener } from './bot.js'
import logger from './logger.js'

try {
  const [appData, api] = await createDataProvider()
  await startBotListener(appData, api)
} catch (e) {
  logger.error(e)
}
