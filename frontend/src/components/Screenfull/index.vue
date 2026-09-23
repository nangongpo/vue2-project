<template>
  <div class="screenfull-svg">
    <svg-icon :icon-class="isFullscreen?'exit-fullscreen':'fullscreen'" @click="click" />
  </div>
</template>

<script>
import screenfull from 'screenfull'

export default {
  name: 'Screenfull',
  props: {
    // 配置目标元素以触发组件切换；'“true”表示启用父DOM元素，“false”表示禁用将事件附加到任何DOM元素；通过使用字符串（CSS选择器）或DOM元素，它将事件附加到指定的DOM元素（如果存在）
    // :target="false" :target="$refs.target"target=".my-parent"target="#target-id"
    value: Boolean,
    target: {
      type: [Boolean, String, Element],
      default: true
    }
  },
  data() {
    return {
      isFullscreen: this.value
    }
  },
  mounted() {
    this.init()
  },
  beforeDestroy() {
    this.destroy()
  },
  methods: {
    click() {
      if (!screenfull.isEnabled) {
        this.$message({
          message: 'you browser can not work',
          type: 'warning'
        })
        return false
      }
      screenfull.toggle(this.targetEl)
    },
    change() {
      this.isFullscreen = screenfull.isFullscreen
      this.$emit('input', this.isFullscreen)
      this.$emit('change', this.isFullscreen)
    },
    init() {
      if (this.target === false || this.target === '') {
        this.targetEl = null
      } else if (this.target === true) {
        this.targetEl = undefined
      } else {
        this.targetEl = this.getElement(this.target) || null
      }

      if (this.targetEl === null) {
        return
      }
      if (screenfull.isEnabled) {
        screenfull.on('change', this.change)
      }
    },
    destroy() {
      if (screenfull.isEnabled) {
        screenfull.off('change', this.change)
      }
    },
    getElement(el) {
      const type = typeof el

      if (type === 'function') {
        el = el()
      }

      if (type === 'string') {
        try {
          el = document.querySelector(el)
        // eslint-disable-next-line no-empty
        } catch (err) {}
      }

      if (el !== Object(el)) {
        return null
      }

      return el._isVue === true && el.$el !== undefined ? el.$el : el
    }
  }
}
</script>

<style scoped>
.screenfull-svg {
  display: inline-block;
  cursor: pointer;
}
</style>
