const isProd = import.meta.env.PROD

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
  password: isProd
    ? {
        pattern: /^\S*(?=\S{8,18})(?=\S*\d)(?=\S*[A-Z])(?=\S*[a-z])(?=\S*[\-\_!@#$%^&*?])\S*$/,
        message: '最少8位最大18位，包括至少1个大写字母，1个小写字母，1个数字，1个特殊字符',
      }
    : undefined,
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
