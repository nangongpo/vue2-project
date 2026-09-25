import axios from 'axios'

import { setSecurityStepUpHandler, setupErrorHandler } from './error-handler'
import { notify, notifyRequestError } from './notifications'
import { responseHandler } from './response-handler'

const request = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  withCredentials: true,
  timeout: 10 * 1000,
})

const { errorHandler: defaultErrorHandler } = setupErrorHandler(request)

export { notify, notifyRequestError, responseHandler, setSecurityStepUpHandler }
export { defaultErrorHandler as errorHandler }
export default request
