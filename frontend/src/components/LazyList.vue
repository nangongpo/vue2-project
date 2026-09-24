<template>
  <div class="lazy-list-container">
    <slot></slot>
  </div>
</template>

<script>
export default {
  name: 'LazyList',
  props: {
    localScroll: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      scrollTarget: null,
      throttledScroll: null,
      throttledResize: null,
    }
  },
  mounted() {
    var self = this
    this.$nextTick(function () {
      self.scrollTarget = self.localScroll ? self.$el : window

      // 1. 节流滚动监听（100ms 既保证了滚动的响应速度，又避免了高频触发）
      self.throttledScroll = self.throttle(function () {
        self.$emit('list-scroll')
      }, 100)

      // 2. 窗口大小改变监听
      self.throttledResize = self.throttle(function () {
        self.$emit('list-scroll')
      }, 200)

      if (self.scrollTarget) {
        self.scrollTarget.addEventListener('scroll', self.throttledScroll, false)
        window.addEventListener('resize', self.throttledResize, false)

        // 延迟首屏初始化，避开 FP 首屏初次布局开销
        setTimeout(function () {
          self.$emit('list-scroll')
        }, 50)
      }
    })
  },
  beforeDestroy() {
    if (this.scrollTarget && this.throttledScroll) {
      this.scrollTarget.removeEventListener('scroll', this.throttledScroll, false)
    }
    if (this.throttledResize) {
      window.removeEventListener('resize', this.throttledResize, false)
    }
  },
  methods: {
    throttle(fn, delay) {
      var lastTime = 0
      return function () {
        var now = new Date().getTime()
        if (now - lastTime >= delay) {
          fn.apply(this, arguments)
          lastTime = now
        }
      }
    },

    scrollToItem(uniqueId) {
      var self = this
      this.$nextTick(function () {
        var targetEl = self.$el.querySelector('[data-id="' + uniqueId + '"]')
        if (!targetEl) return

        var scrollContainer = self.localScroll ? self.$el : window
        var targetTop = targetEl.getBoundingClientRect().top
        var containerTop = self.localScroll ? self.$el.getBoundingClientRect().top : 0
        var currentScrollTop = self.localScroll
          ? self.$el.scrollTop
          : window.pageYOffset || document.documentElement.scrollTop

        var finalScrollTop = currentScrollTop + targetTop - containerTop
        self.smoothScrollTo(scrollContainer, finalScrollTop, 300)
      })
    },

    smoothScrollTo(element, target, duration) {
      var isWindow = element === window
      var start = isWindow
        ? window.pageYOffset || document.documentElement.scrollTop
        : element.scrollTop
      var change = target - start
      var currentTime = 0
      var increment = 20

      var easeInOutQuad = function (t, b, c, d) {
        t /= d / 2
        if (t < 1) return (c / 2) * t * t + b
        t--
        return (-c / 2) * (t * (t - 2) - 1) + b
      }

      var animateScroll = function () {
        currentTime += increment
        var val = easeInOutQuad(currentTime, start, change, duration)
        if (isWindow) {
          window.scrollTo(0, val)
        } else {
          element.scrollTop = val
        }
        if (currentTime < duration) {
          if (window.requestAnimationFrame) {
            window.requestAnimationFrame(animateScroll)
          } else {
            setTimeout(animateScroll, increment)
          }
        }
      }
      animateScroll()
    },
  },
}
</script>

<style scoped>
.lazy-list-container {
  width: 100%;
}
</style>
