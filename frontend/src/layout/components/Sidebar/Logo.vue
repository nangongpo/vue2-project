<template>
  <div class="sidebar-logo-container" :class="{'collapse':collapse}">
    <transition name="sidebarLogoFade">
      <router-link v-if="collapse" key="collapse" class="sidebar-logo-link" to="/">
        <img v-if="logo" :src="logo" class="sidebar-logo">
        <div class="sidebar-title">{{ title }} </div>
      </router-link>
      <router-link v-else key="expand" class="sidebar-logo-link" to="/">
        <img v-if="logo" :src="logo" class="sidebar-logo">
        <div class="sidebar-title">{{ title }} </div>
      </router-link>
    </transition>
  </div>
</template>

<script>
import settings from '@/settings'
import logo from '@/assets/logo.svg'

export default {
  name: 'SidebarLogo',
  props: {
    collapse: {
      type: Boolean,
      required: true
    }
  },
  data() {
    return {
      title: settings.title,
      logo
    }
  }
}
</script>

<style lang="scss" scoped>
.sidebarLogoFade-enter-active {
  transition: opacity 1.5s;
}

.sidebarLogoFade-enter,
.sidebarLogoFade-leave-to {
  opacity: 0;
}

.sidebar-logo-container {
  display: flex;
  width: 100%;
  height: $pageTitleHeight;
  text-align: center;
  align-items: center;
  & .sidebar-logo-link {
    width: 100%;

    & .sidebar-logo {
      width: 44px;
      padding-bottom: 10px;
      fill: '#f00';
      font-size: 44px !important;
    }

    & .sidebar-title {
      margin: 0;
      color: #fff;
      font-weight: 700;
      font-size: 18px;
      line-height: 24px;
      padding: 0 12px;
    }
  }

  &.collapse {
    height: $headerHeight;
    & .sidebar-logo-link {
      & .sidebar-logo {
        padding: 6px;
      }
      & .sidebar-title {
        display: none;
      }
    }
  }
}
</style>
