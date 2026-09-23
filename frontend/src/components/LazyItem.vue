<template>
  <div 
    :style="{ minHeight: isStyleReleased ? 'auto' : currentMinHeight }"
    class="lazy-item-container"
  >
    <div :data-id="uniqueId" style="width: 100%;">
      <template v-if="isVisible">
        <slot></slot>
      </template>
      <template v-else>
        <slot name="skeleton">
          <div class="default-skeleton" :style="{ height: currentMinHeight }"></div>
        </slot>
      </template>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LazyItem',
  props: {
    uniqueId: {
      type: [String, Number],
      required: true
    },
    height: {
      type: [String, Number],
      default: '100px'
    },
    keepAlive: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      isVisible: false,          // 控制真实组件的 DOM 挂载
      isStyleReleased: false,    // 核心：控制 minHeight 从固定高度释放为 'auto' 的时机
      parentListComponent: null,
      currentMinHeight: typeof this.height === 'number' ? this.height + 'px' : this.height
    };
  },
  mounted() {
    var self = this;
    this.$nextTick(function() {
      var parent = self.$parent;
      while (parent && parent.$options.name !== 'LazyList') {
        parent = parent.$parent;
      }
      
      if (parent) {
        self.parentListComponent = parent;
        parent.$on('list-scroll', self.checkVisibility);
        self.checkVisibility();
      } else {
        self.isVisible = true;
        self.isStyleReleased = true;
      }
    });
  },
  beforeDestroy() {
    if (this.parentListComponent) {
      this.parentListComponent.$off('list-scroll', this.checkVisibility);
    }
  },
  methods: {
    /**
     * 时间分片碰撞检测
     */
    checkVisibility() {
      if (this.isVisible && this.keepAlive) {
        if (this.parentListComponent) {
          this.parentListComponent.$off('list-scroll', this.checkVisibility);
        }
        return;
      }

      if (!this.$el) return;

      var rect = this.$el.getBoundingClientRect();
      var windowHeight = window.innerHeight || document.documentElement.clientHeight;
      var containerTop = 0;
      var containerBottom = windowHeight;

      if (this.parentListComponent && this.parentListComponent.localScroll) {
        var pRect = this.parentListComponent.$el.getBoundingClientRect();
        containerTop = Math.max(0, pRect.top);
        containerBottom = Math.min(windowHeight, pRect.bottom);
      }

      var buffer = 150; 
      var isElementInViewport = (rect.top - buffer <= containerBottom) && (rect.bottom + buffer >= containerTop);

      if (isElementInViewport) {
        var self = this;
        
        // 【帧同步第一步】：立刻挂载真实组件 DOM，但由于 isStyleReleased 仍为 false，容器高依然是锁死的 250px
        self.isVisible = true; 

        // 【帧同步第二步】：利用 nextTick + 双重 rAF 建立时间分片沙盒
        self.$nextTick(function() {
          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              // 此时子组件（AsyncTable / 基础表单等）已经经历了完整的初次排版和首帧渲染
              // 它的真实物理高度已经完全撑起来了，此时再释放 'auto'，el-pagination 绝不会产生任何位移
              self.isStyleReleased = true;
            });
          });
        });
      } else {
        if (!this.keepAlive) {
          this.isVisible = false;
          this.isStyleReleased = false;
        }
      }
    }
  }
};
</script>

<style scoped>
.lazy-item-container {
  width: 100%;
  overflow: hidden; 
  box-sizing: border-box;
}
.default-skeleton {
  width: 100%;
  background-color: #f2f2f2;
  animation: skeleton-blink 1.2s ease-in-out infinite;
}
@keyframes skeleton-blink {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}
</style>
