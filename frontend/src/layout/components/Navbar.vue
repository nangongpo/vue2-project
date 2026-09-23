<template>
  <div class="navbar">
    <hamburger
      id="hamburger-container"
      :is-active="sidebar.opened"
      class="hamburger-container"
      @toggleClick="toggleSideBar"
    />

    <breadcrumb id="breadcrumb-container" class="breadcrumb-container" />

    <div class="right-menu">
      <template v-if="device !== 'mobile'">
        <el-tooltip content="应用检索" effect="dark" placement="bottom">
          <search id="header-search" class="right-menu-item" />
        </el-tooltip>

        <!-- <el-tooltip content="意见与建议" effect="dark" placement="bottom">
          <router-link :to="{ name: 'Feedback' }" target="_blank" class="right-menu-item hover-effect feedback-container">
            <svg-icon icon-class="feedback" class-name="feedback-icon" />
          </router-link>
        </el-tooltip> -->

        <error-log class="errLog-container right-menu-item hover-effect" />

        <el-tooltip content="全屏" effect="dark" placement="bottom">
          <screenfull id="screenfull" class="right-menu-item hover-effect" />
        </el-tooltip>

        <el-tooltip content="布局大小" effect="dark" placement="bottom">
          <size-select id="size-select" class="right-menu-item hover-effect" />
        </el-tooltip>
      </template>

      <el-dropdown
        size="small"
        trigger="click"
        class="right-menu-item hover-effect avatar-container"
        @command="handleCommand">
        <div class="avatar-wrapper">
          <div class="mr-5">
            <svg-icon icon-class="user" />
          </div>
          <div class="user-info">
            <div>{{ userInfo.username }}</div>
            <div class="role-info">{{ roleNames }}</div>
          </div>
        </div>
        <el-dropdown-menu slot="dropdown">
          <el-dropdown-item command="login">登录信息</el-dropdown-item>
          <el-dropdown-item command="updatePassword">密码修改</el-dropdown-item>
          <el-dropdown-item divided command="logout">退出</el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>
      <div
        class="right-menu-item hover-effect logout-container"
        @click="handleCommand('logout')">
        <svg-icon icon-class="exit" class="exit-icon" />
        <span> 退出</span>
      </div>
    </div>

    <el-dialog
      :visible.sync="dialogConfig.visible"
      :title="dialogConfig.title"
      :width="dialogConfig.width"
      :close-on-click-modal="false"
      :center="dialogConfig.center"
      append-to-body
      @open="handleFormReset('dialog')">
      <base-form
        v-loading="dialogConfig.loading"
        ref="dialog"
        :fields="dialogConfig.fields"
        :model="dialogConfig.model"
        :patterns="dialogConfig.patterns"
        :label-width="dialogConfig.labelWidth"
        :value-width="dialogConfig.valueWidth"
        :all-options="allOptions"
        label-as-placeholder
        label-suffix=":"
        inline>
        <template #input="{ prop, attrs }">
          <el-input v-model="dialogConfig.model[prop]" v-bind="attrs" />
        </template>
      </base-form>
      <template v-if="dialogConfig.showFooter" #footer>
        <el-button @click="dialogConfig.visible = false">关 闭</el-button>
        <el-button
          :loading="dialogConfig.loading"
          type="primary"
          @click="handleSubmit">
          确 定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      :visible.sync="messageDialog.visible"
      :title="messageDialog.title"
      :width="messageDialog.width"
      :close-on-click-modal="false"
      :show-close="false"
      append-to-body
      center
      top="0"
      class="center"
      custom-class="message-dialog">
      <div style="padding: 20px 0 40px 0" class="text-center font-md">
        <render-jsx :value="messageDialog.message" />
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import Breadcrumb from '@/components/Breadcrumb/index.vue'
import Hamburger from '@/components/Hamburger/index.vue'
import ErrorLog from '@/components/ErrorLog/index.vue'
import Screenfull from '@/components/Screenfull/index.vue'
import SizeSelect from '@/components/SizeSelect/index.vue'
import Search from '@/components/HeaderSearch/index.vue'
import BaseForm from '@/components/BaseForm/index.vue'
import RenderJsx from '@/components/RenderJsx/index.vue'
import allPatterns from '@/utils/patterns'
import { countDown, isNotEmpty } from '@/utils'
import { dateFormat } from '@/utils/date'
import { updatePassword, updateUnitInfo } from '@/api/user'

export default {
  components: {
    Breadcrumb,
    Hamburger,
    ErrorLog,
    Screenfull,
    SizeSelect,
    Search,
    BaseForm,
    RenderJsx
  },
  data() {
    return {
      dialogConfig: {
        visible: false,
        loading: false,
        action: '',
        title: '',
        width: '',
        labelWidth: '',
        valueWidth: '',
        fields: [],
        model: {},
        patterns: {},
        showFooter: false
      },
      messageDialog: {
        visible: false,
        title: '',
        width: '',
        message: ''
      },
      loginInfoShown: false
    }
  },
  computed: {
    ...mapGetters(['sidebar', 'device', 'userInfo', 'loginInfoPending', 'allOptions']),
    roleNames() {
      return (this.userInfo.roles || []).map(role => role.name).join('、') || '-'
    }
  },
  watch: {
    userInfo: {
      immediate: true,
      handler() {
        this.tryShowLoginInfo()
      }
    },
    loginInfoPending() {
      this.tryShowLoginInfo()
    }
  },
  methods: {
    tryShowLoginInfo() {
      if (!this.userInfo || !this.userInfo.username) {
        this.loginInfoShown = false
        return
      }
      if (!this.loginInfoPending || this.loginInfoShown) return

      this.loginInfoShown = true
      this.$store.commit('user/SET_LOGIN_INFO_PENDING', false)
      this.$nextTick(() => this.showLoginInfo())
    },
    toggleSideBar() {
      this.$store.dispatch('app/toggleSideBar')
    },
    handleCommand(command) {
      switch (command) {
        case 'login':
          this.showLoginInfo()
          break
        case 'updatePassword':
          this.dialogConfig = {
            visible: true,
            action: command,
            showFooter: true,
            loading: false,
            center: true,
            title: '密码修改',
            width: '400px',
            labelWidth: '105px',
            valueWidth: '240px',
            fields: [
              {
                label: '原密码',
                prop: 'password',
                prop_type: 'string',
                prop_width: 1,
                prop_height: 40,
                display: true,
                editable: true,
                required: true,
                render: 'input',
                type: 'password'
              },
              {
                label: '新密码',
                prop: 'new_password',
                prop_type: 'string',
                prop_width: 1,
                prop_height: 40,
                display: true,
                editable: true,
                required: true,
                render: 'input',
                type: 'password'
              },
              {
                label: '确认密码',
                prop: 'confirm_password',
                prop_type: 'string',
                prop_width: 1,
                display: true,
                editable: true,
                required: true,
                render: 'input',
                type: 'password',
                placeholder: '再次输入新密码'
              }
            ],
            model: { password: '', confirm_password: '' },
            patterns: {
              password: allPatterns.password,
              new_password: allPatterns.password,
              confirm_password: {
                validator: (rule, value, callback) => {
                  const { new_password } = this.dialogConfig.model
                  if (value === '') {
                    callback(new Error('请再次输入密码'))
                  } else if (value !== new_password) {
                    callback(new Error('两次输入密码不一致!'))
                  } else {
                    callback()
                  }
                }
              }
            }
          }
          break
        case 'logout':
          this.$store.dispatch('user/logout').then(() => {
            this.$router.push(`/login?redirect=${this.$route.fullPath}`)
          })
          break
      }
    },
    showLoginInfo() {
      const { $createElement: h } = this
      const user = this.userInfo || {}
      const loginInfo = [
        { label: '账号', value: user.username },
        { label: '姓名', value: user.displayName },
        { label: '角色名称', value: this.roleNames },
        { label: '所属单位', value: user.unitName || '-' },
        { label: '当前时间', value: dateFormat(new Date()) },
        { label: '来源', value: user.loginIp },
        { label: '上次登录时间', value: dateFormat(user.lastLoginAt) },
        { label: '上次登录地址', value: user.lastLoginIp },
        { label: '上次登录失败的时间', value: '-' },
        { label: '上次登录失败地址', value: '-' },
        { label: '用户有效期剩余天数', value: user.userExpireDays ?? '-' },
        { label: '密码有效期剩余天数', value: user.passwordExpireDays ?? '-' },
        { label: '上次成功访问之后用户身份鉴别失败次数', value: user.failedLogins ?? 0 }
      ]

      const vNodes = loginInfo.map((item) => {
        return h(
          'div',
          { class: 'info-item' },
          `${item.label}：${isNotEmpty(item.value) ? item.value : '-'}`
        )
      })

      this.$msgbox({
        title: '登录信息',
        customClass: 'login-info',
        center: true,
        message: h('div', { class: 'info-wrapper text-left' }, vNodes),
        showCancelButton: false,
        showConfirmButton: false,
        closeOnClickModal: false,
        callback: () => {}
      })
    },
    handleSubmit() {
      const { dialogConfig, userInfo } = this
      const { title, action, model } = dialogConfig
      this.$refs.dialog.validate((valid) => {
        if (!valid) return
        switch (action) {
          case 'updatePassword':
            dialogConfig.loading = true
            updatePassword({
              currentPassword: model.password,
              newPassword: model.new_password
            }).then(() => {
              dialogConfig.visible = false
              dialogConfig.loading = false

              countDown((second) => {
                const visible = second > 0
                if (visible) {
                  this.messageDialog = {
                    visible,
                    title,
                    width: '400px',
                    message: (h) => (
                      h('div', [
                        '操作成功, ',
                        h('strong', { class: 'text-primary' }, `${second}s`),
                        ' 后自动进入登录页面'
                      ])
                    )
                  }
                  return
                }
                this.messageDialog.visible = visible
                this.$store.dispatch('user/resetToken').then(() => {
                  this.$router.replace({ name: 'login' })
                })
              }, 3)
            }).catch(() => {
              dialogConfig.loading = false
            })
            break
          case 'updateUnitInfo':
            dialogConfig.loading = true
            updateUnitInfo(model).then(() => {
              dialogConfig.visible = false
              dialogConfig.loading = false
              this.$notify.success({
                title,
                message: '操作成功'
              })
            }).catch(() => {
              dialogConfig.loading = false
            })
            break
        }
      })
    },
    handleFormReset(formName) {
      this.$refs[formName] && this.$refs[formName].resetFields()
    }
  }
}
</script>

<style lang="scss" scoped>
.navbar {
  height: $headerHeight;
  overflow: hidden;
  position: relative;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  padding: 0 $element-gutter;

  .hamburger-container {
    line-height: $headerHeight - 4;
    height: 100%;
    float: left;
    cursor: pointer;
    transition: background 0.3s;
    -webkit-tap-highlight-color: transparent;

    &:hover {
      background: rgba(0, 0, 0, 0.025);
    }
  }

  .breadcrumb-container {
    float: left;
    line-height: $headerHeight;
  }

  .errLog-container {
    display: inline-block;
    vertical-align: top;
  }

  .right-menu {
    float: right;
    height: 100%;
    line-height: $headerHeight;

    &:focus {
      outline: none;
    }

    .right-menu-item {
      display: inline-block;
      padding: 0 $element-gutter;
      height: 100%;
      font-size: 18px;
      color: #5a5e66;
      vertical-align: text-bottom;

      &.hover-effect {
        cursor: pointer;
        transition: background 0.3s;

        &:hover {
          background: rgba(0, 0, 0, 0.025);
        }
      }
    }

    .feedback-container {
      padding-top: 2px;
      .feedback-icon {
        font-size: 22px;
      }
    }

    .logout-container {
      &.hover-effect {
        &:hover {
          background: $red;
          color: #fff;
        }
      }
    }

    .exit-icon {
      font-size: 20px;
    }

    .avatar-container {
      .avatar-wrapper {
        display: inline-flex;
        align-items: center;
        line-height: 1;
      }
      .user-info {
        line-height: 1.1;
        .role-info {
          font-size: 12px;
        }
      }
      &.hover-effect {
        &:hover {
          background: $blue;
          color: #fff;
        }
      }
    }
  }
}

.login-info {
  .info-wrapper {
    padding: 0 10px;
    font-size: 16px;
    .info-item {
      padding: 5px 0;
    }
  }
  .backlog-info {
    padding: 10px 0;
  }
}
</style>
