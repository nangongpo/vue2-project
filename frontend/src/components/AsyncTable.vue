<script>
// import baseCssUrl from 'vue-easytable/libs/theme-default/base.css?url'
// import tableCssUrl from 'vue-easytable/libs/theme-default/ve-table.css?url'
// import iconCssUrl from 'vue-easytable/libs/theme-default/ve-icon.css?url'
import asyncTableCssUrl from '@/styles/async-table.css?url'
import Vue from 'vue'

// 单例锁：防止多表格组件实例重复注入 CSS 和重复注册
let isTableRegistered = false
let globalLoadingPromise = null

/**
 * 核心重排优化：确保单张 CSS 彻底加载解析完毕
 */
const loadStyles = (url) => {
  return new Promise((resolve) => {
    if (document.querySelector(`link[href="${url}"]`)) {
      return resolve()
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.onload = () => resolve()
    link.onerror = () => resolve()
    document.head.appendChild(link)
  })
}

/**
 * 原子化加载引擎：控制【CSS 加载 -> JS 加载 -> 组件全局注册】的时序
 */
const loadTableEngine = () => {
  if (isTableRegistered) return Promise.resolve()
  if (globalLoadingPromise) return globalLoadingPromise

  globalLoadingPromise = (async () => {
    try {
      // 1. 并行等待所有 CSS 彻底解析完毕，斩断重排源头
      // const cssUrls = [baseCssUrl, tableCssUrl, iconCssUrl]
      // await Promise.all(cssUrls.map((url) => loadStyles(url)))
      await loadStyles(asyncTableCssUrl)

      // 2. 异步动态导入 JS 依赖包
      const [VeTable, VeIcon] = await Promise.all([
        import('vue-easytable/libs/ve-table'),
        import('vue-easytable/libs/ve-icon'),
      ])

      // 3. 全局常驻注册，后续实例直接复用
      Vue.component('VeTable', VeTable.default.default || VeTable.default)
      Vue.component('VeIcon', VeIcon.default.default || VeIcon.default)

      // isTableRegistered = true
      console.log('✅ VueEasytable 已完成异步按需挂载')
    } catch (err) {
      console.error('❌ VueEasytable 异步加载失败:', err)
      globalLoadingPromise = null
      throw err
    }
  })()

  return globalLoadingPromise
}

// 局部函数式组件：骨架屏组件（自包含独立根节点）
const TableSkeleton = {
  functional: true,
  props: {
    height: Number,
    pageSize: { type: [Number, String], default: 0 }
  },
  render(h, context) {
    const { height, pageSize } = context.props
    const count = Number(pageSize) || 10
    // 如果外面传了 height，给骨架屏外壳强行加上固定高度和溢出隐藏
    const containerStyle = height ? { height: height + 'px', overflow: 'hidden' } : null
    const rowNodes = []
    for (let i = 0; i < count; i++) {
      rowNodes.push(h('div', { class: 'skeleton-row', key: i }))
    }
    return h('div', { class: 'table-loading-container', style: containerStyle }, [
      h('div', { class: 'skeleton-header' }),
      h('div', { class: 'skeleton-content' }, rowNodes)
    ])
  }
}

export default {
  name: 'AsyncTable',
  inheritAttrs: false,
  props: {
    height: {
      type: Number,
      default: 0
    },
    pageSize: {
      type: [Number, String],
      default: 10
    }
  },
  data() {
    return {
      // 核心控制开关
      isEngineReady: isTableRegistered
    }
  },
  created() {
    if (this.isEngineReady) return

    loadTableEngine()
      .then(() => {
        // 双重 rAF 确保样式刷新在组件挂载前稳定，规避浏览器抢跑读取引起的重排
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.isEngineReady = true
          })
        })
      })
      .catch(() => {
        this.isEngineReady = false
      })
  },
  render(h) {
    // 状态 1：如果引擎没有准备好（CSS/JS 还在加载），渲染骨架屏根节点
    if (!this.isEngineReady) {
      return h(TableSkeleton, {
        props: { 
          pageSize: this.pageSize,
          height: this.height
        }
      })
    }

    // 状态 2：加载完毕，渲染真实的 ve-table 根节点
    return h(
      've-table',
      {
        attrs: this.$attrs,
        on: this.$listeners,
      })
  }
}
</script>

<style scoped>
/* 骨架屏极简样式：固定高度减少重排风险 */
.table-loading-container {
  width: 100%;
  padding: 16px;
  background: #fff;
  border: 1px solid #e8e8e8;
  box-sizing: border-box;
}
.skeleton-header {
  height: 40px;
  background: #f6f7f8;
  margin-bottom: 12px;
}
.skeleton-row {
  height: 40px;
  background: #f6f7f8;
  margin-bottom: 8px;
}
.skeleton-row:last-child {
  margin-bottom: 0;
}
</style>
