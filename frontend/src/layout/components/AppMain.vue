<template>
  <section class="app-main">
    <transition name="fade-transform" mode="out-in">
      <!-- <keep-alive :include="cachedViews"> -->
        <router-view :key="key" />
      <!-- </keep-alive> -->
    </transition>
  </section>
</template>

<script>
import Vue from 'vue'

export default {
  name: 'AppMain',
  computed: {
    cachedViews() {
      return this.$store.state.tagsView.cachedViews
    },
    key() {
      return this.$route.path
    }
  }
}
</script>

<style lang="scss" scoped>
.app-main {
  min-height: calc(100vh - #{$headerHeight});
  width: 100%;
  position: relative;
  overflow: hidden;
  background: $bg;
}

.fixed-header+.app-main {
  padding-top: $headerHeight;
}

.hasTagsView {
  .app-main {
    min-height: 100vh;
  }

  .fixed-header+.app-main {
    padding-top: $headerHeight + $tagsViewHeight;
  }
}
</style>

<style lang="scss">
.app-content {
  height: calc(100vh - #{$headerHeight})
}
.hasTagsView {
  .app-content {
    height: calc(100vh - #{$headerHeight + $tagsViewHeight})
  }
}
</style>
