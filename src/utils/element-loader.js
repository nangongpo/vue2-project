import elBase from "element-ui/lib/theme-chalk/base.css?url";
import elMsg from "element-ui/lib/theme-chalk/message.css?url";
import elMsgBox from "element-ui/lib/theme-chalk/message-box.css?url";
import elNotify from "element-ui/lib/theme-chalk/notification.css?url";
import elLoading from "element-ui/lib/theme-chalk/loading.css?url";

// 单例锁：防止多次初始化和重复 CSS 注入
let isElementRegistered = false;

/**
 * 判断 Element UI 是否已注册
 */
export const isElementReady = () => isElementRegistered;

/**
 * 动态加载并注册 Element UI 核心模块
 * @param {Object} Vue - Vue 构造函数
 */
export const loadElementUI = async (Vue) => {
  if (isElementRegistered) return;

  try {
    // 1. 动态注入 CSS (使用数组去重检查)
    const cssUrls = [elBase, elMsg, elMsgBox, elNotify, elLoading];
    cssUrls.forEach((url) => {
      if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        document.head.appendChild(link);
      }
    });

    // 2. 并行异步加载 JS 模块
    const [
      { default: Loading },
      { default: InfiniteScroll },
      { default: Message },
      { default: MessageBox },
      { default: Notification },
    ] = await Promise.all([
      import("element-ui/lib/loading"),
      import("element-ui/lib/infinite-scroll"),
      import("element-ui/lib/message"),
      import("element-ui/lib/message-box"),
      import("element-ui/lib/notification"),
    ]);

    // 3. 执行全局注册逻辑
    Vue.prototype.$ELEMENT = { size: "", zIndex: 2000 };

    Vue.use(Loading.directive);
    Vue.use(InfiniteScroll);

    Vue.prototype.$loading = Loading.service;
    Vue.prototype.$msgbox = MessageBox;
    Vue.prototype.$alert = MessageBox.alert;
    Vue.prototype.$confirm = MessageBox.confirm;
    Vue.prototype.$prompt = MessageBox.prompt;
    Vue.prototype.$notify = Notification;
    Vue.prototype.$message = Message;

    isElementRegistered = true;
    console.log("✅ Element UI 已完成异步按需挂载");
  } catch (err) {
    console.error("❌ Element UI 异步加载失败:", err);
    throw err;
  }
};
