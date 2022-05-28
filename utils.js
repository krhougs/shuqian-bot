import logger from './logger.js'

export const iterate = async (
  iterator,
  processError,
  throwFatal,
  retryTimes = 5
) => {
  let attempt = 0
  let shouldIgnoreError = false
  const setShouldIgnoreError = () => {
    shouldIgnoreError = true
  }
  for await (const fn of iterator()) {
    attempt = 0
    shouldIgnoreError = false
    const process = async () => {
      try {
        if (fn) {
          await fn()
        }
      } catch (e) {
        if (attempt <= retryTimes) {
          try {
            await processError(e, attempt, setShouldIgnoreError)
            if (shouldIgnoreError) {
              return
            }
          } catch (e) {
            logger.warn(e)
          }
          attempt += 1
          await process()
        } else {
          return await throwFatal(e)
        }
      }
    }
    await process()
  }
}

export const wait = (t) =>
  new Promise((resolve) => setTimeout(() => resolve(), t))
