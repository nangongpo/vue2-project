const isProd = import.meta.env.PROD

export const PASSWORD_POLICY_MESSAGE =
  '密码需包含大小写字母、数字、符号中至少三类，或使用至少 20 个字符、四个不同词语的口令短语'

export function validatePassword(_rule, value, callback) {
  if (!value) return callback(new Error('请输入密码'))
  const length = Array.from(value).length
  if (length < 12 || length > 128) return callback(new Error('密码长度为 12–128 个字符'))
  const hasInvalidCharacter = Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f || (code >= 0xd800 && code <= 0xdfff)
  })
  if (hasInvalidCharacter) return callback(new Error('密码不能包含控制字符或无效字符'))
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}\s]/u].filter((pattern) => pattern.test(value)).length
  const words = value.trim().split(/\s+/u)
  const passphrase =
    length >= 20 &&
    words.length >= 4 &&
    words.every((word) => /\p{L}/u.test(word) && Array.from(word).length >= 2) &&
    new Set(words.map((word) => word.toLowerCase())).size >= 4
  if (classes < 3 && !passphrase) return callback(new Error(PASSWORD_POLICY_MESSAGE))
  callback()
}

const passwordRule = { validator: validatePassword, trigger: 'blur' }

export default {
  chinese: isProd
    ? {
        pattern: /^[\u4E00-\u9FFF]+$/,
        message: '请输入汉字',
        trigger: 'change',
      }
    : undefined,
  qcbh: {
    pattern: /^[0-9]{15}$/,
    message: '请输入15位强措编号',
    trigger: 'change',
  },
  phone: {
    pattern: /^[1][3-9][0-9]{9}$/,
    message: '手机号不正确',
  },
  password: passwordRule,
  idcard: isProd
    ? {
        pattern:
          /^[1-9]\d{5}(18|19|([23]\d))\d{2}((0[1-9])|(10|11|12))(([0-2][1-9])|10|20|30|31)\d{3}[0-9Xx]$/,
        message: '请输入有效的身份证号码',
      }
    : undefined,
  // idcard: {
  //   pattern: /^[1-9]\d{5}(18|19|([23]\d))\d{2}((0[1-9])|(10|11|12))(([0-2][1-9])|10|20|30|31)\d{3}[0-9Xx]$/,
  //   message: '请输入有效的身份证号码'
  // },
  ip: {
    pattern:
      /^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])$/,
    message: '请输入有效的IP地址',
  },
  url: {
    pattern:
      /^(https?|ftp):\/\/([a-zA-Z0-9.-]+(:[a-zA-Z0-9.&%$-]+)*@)*((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}|([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.(com|edu|gov|int|mil|net|org|biz|arpa|info|name|pro|aero|coop|museum|[a-zA-Z]{2}))(:[0-9]+)*(\/($|[a-zA-Z0-9.,?'\\+&%$#=~_-]+))*$/,
    message: '无效的链接',
  },
  email: {
    pattern:
      /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    message: '无效的邮箱',
  },
  // role_type: {
  //   validator: (rule, value, callback) => {
  //     if (value.length > 1) {
  //       callback(new Error(`最多选择1个角色分类`))
  //     } else {
  //       callback()
  //     }
  //   }
  // }
}
