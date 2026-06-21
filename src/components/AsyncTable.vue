<script>
// 1. 使用 Vite 8 的 ?url 动态获取资源路径，避开 CSS 自动分割与注入
import baseCssUrl from "vue-easytable/libs/theme-default/base.css?url";
import tableCssUrl from "vue-easytable/libs/theme-default/ve-table.css?url";
import iconCssUrl from "vue-easytable/libs/theme-default/ve-icon.css?url";

// 2. 函数式组件：加载中骨架屏
const TableSkeleton = {
  functional: true,
  render(h) {
    return h('div', { class: 'table-loading-container' }, [
      h('div', { class: 'skeleton-header' }),
      h('div', { class: 'skeleton-content' }, 
        Array.from({ length: 6 }).map(() => h('div', { class: 'skeleton-row' }))
      ),
      h('div', { class: 'loading-text' }, '表格正在拼命加载中...')
    ]);
  }
};

// 3. 函数式组件：加载错误重试
const TableError = {
  functional: true,
  render(h, context) {
    const { retry } = context.props;
    return h('div', { class: 'table-error-container' }, [
      h('div', { class: 'error-msg' }, '表格组件加载失败，请检查网络'),
      h('button', { 
        class: 'retry-btn',
        on: { click: () => (retry ? retry() : window.location.reload()) } 
      }, '点击重试')
    ]);
  }
};

// 4. 异步加载逻辑引擎
const AsyncTableEngine = () => ({
  component: import("vue-easytable").then((veModule) => {
    // 动态插入 CSS，确保首屏零阻塞
    [baseCssUrl, tableCssUrl, iconCssUrl].forEach(url => {
      if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
      }
    });

    const { VeTable, VeIcon } = veModule;
    return {
      components: { VeTable, VeIcon },
      render(h) {
        return h('ve-table', {
          attrs: this.$attrs,
          on: this.$listeners,
          scopedSlots: this.$scopedSlots
        }, this.$slots.default);
      }
    };
  }),
  loading: TableSkeleton,
  error: TableError,
  delay: 200,
  timeout: 10000
});

export default {
  name: 'AsyncTable',
  inheritAttrs: false,
  components: { AsyncTableEngine },
  render(h) {
    return h('AsyncTableEngine', {
      attrs: this.$attrs,
      on: this.$listeners,
      scopedSlots: this.$scopedSlots
    }, this.$slots.default);
  }
}
</script>

<style scoped>
/* 骨架屏与错误组件样式 */
.table-loading-container, .table-error-container {
  width: 100%;
  min-height: 300px;
  padding: 16px;
  background: #fff;
  border: 1px solid #e8e8e8;
  box-sizing: border-box;
}
.skeleton-header { height: 40px; background: #f6f7f8; margin-bottom: 20px; }
.skeleton-row { height: 32px; background: #f6f7f8; margin-bottom: 12px; }
.table-error-container { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.retry-btn { margin-top: 10px; padding: 8px 16px; cursor: pointer; }
</style>
