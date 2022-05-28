import { createDataProvider } from './data.js'
import { startBotListener } from './bot.js'

const [appData, api] = await createDataProvider()
startBotListener(appData, api)
