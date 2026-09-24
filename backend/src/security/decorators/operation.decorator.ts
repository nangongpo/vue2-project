import { SetMetadata } from '@nestjs/common'

export const SECURITY_OPERATION = 'security_operation'

/** 为业务接口绑定统一的风险控制操作标识。 */
export const SecurityOperation = (operationCode: string) => SetMetadata(SECURITY_OPERATION, operationCode)
