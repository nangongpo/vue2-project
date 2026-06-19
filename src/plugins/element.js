import '@/theme/base.css';
import '@/theme/icon.css';
import '@/theme/message.css'
import '@/theme/message-box.css'
import '@/theme/notification.css'
import '@/theme/loading.css'

import Loading from 'element-ui/lib/loading'
import InfiniteScroll from 'element-ui/lib/infinite-scroll'
import Message from 'element-ui/lib/message'
import MessageBox from 'element-ui/lib/message-box'
import Notification from 'element-ui/lib/notification'

export default {
  install(Vue, opts = {}) {
    Vue.prototype.$ELEMENT = {
      size: opts.size || '',
      zIndex: opts.zIndex || 2000
    }

    Vue.use(Loading.directive)
    Vue.use(InfiniteScroll)

    Vue.prototype.$loading = Loading.service
    Vue.prototype.$msgbox = MessageBox
    Vue.prototype.$alert = MessageBox.alert
    Vue.prototype.$confirm = MessageBox.confirm
    Vue.prototype.$prompt = MessageBox.prompt
    Vue.prototype.$notify = Notification
    Vue.prototype.$message = Message
  }
}
