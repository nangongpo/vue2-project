<template>
  <div id="app">
    <router-view />
    <reauth-dialog
      :visible.sync="securityStepUpVisible"
      :mfa-enabled="securityStepUpMfaEnabled"
      :password.sync="securityStepUpPassword"
      :otp.sync="securityStepUpOtp"
      :busy="securityStepUpBusy"
      :error="securityStepUpError"
      :risk-level="securityStepUpContext && securityStepUpContext.riskLevel"
      @submit="submitSecurityStepUp"
      @cancel="cancelSecurityStepUp" />
  </div>
</template>

<script>
import ReauthDialog from '@/components/Security/ReauthDialog.vue'
import { axiosPost } from '@/api'
import { setSecurityStepUpHandler } from '@/api/http'

export default {
  name: 'App',
  components: { ReauthDialog },
  data() {
    return {
      securityStepUpVisible: false,
      securityStepUpBusy: false,
      securityStepUpError: '',
      securityStepUpPassword: '',
      securityStepUpOtp: '',
      securityStepUpContext: null,
      securityStepUpResolver: null,
      securityStepUpPromise: null,
      sessionExpiryTimer: null,
      sessionExpiryNotification: null,
      sessionExpiryKey: '',
    }
  },
  computed: {
    securityStepUpMfaEnabled() {
      const requiredFactors = this.securityStepUpContext?.requiredFactors || []
      return Boolean(
        this.$store.state.user.user_info?.mfaEnabled || requiredFactors.includes('OTP')
      )
    },
  },
  mounted() {
    setSecurityStepUpHandler((context) => this.openSecurityStepUp(context))
  },
  watch: {
    '$store.state.user.user_info.sessionExpiresAt': {
      immediate: true,
      handler(value) {
        this.scheduleSessionExpiryNotice(value)
      },
    },
  },
  beforeDestroy() {
    setSecurityStepUpHandler(null)
    this.resolveSecurityStepUp(false)
    this.clearSessionExpiryNotice()
  },
  methods: {
    openSecurityStepUp(context) {
      if (this.securityStepUpPromise) return this.securityStepUpPromise
      this.securityStepUpContext = context || {}
      this.securityStepUpError = ''
      this.securityStepUpPassword = ''
      this.securityStepUpOtp = ''
      this.securityStepUpVisible = true
      this.securityStepUpPromise = new Promise((resolve) => {
        this.securityStepUpResolver = resolve
      })
      return this.securityStepUpPromise
    },
    resolveSecurityStepUp(result) {
      const resolve = this.securityStepUpResolver
      this.securityStepUpResolver = null
      this.securityStepUpPromise = null
      this.securityStepUpVisible = false
      this.securityStepUpBusy = false
      this.securityStepUpPassword = ''
      this.securityStepUpOtp = ''
      this.securityStepUpContext = null
      if (resolve) resolve(result)
    },
    cancelSecurityStepUp() {
      this.resolveSecurityStepUp(false)
    },
    async submitSecurityStepUp() {
      if (this.securityStepUpBusy) return
      if (!this.securityStepUpPassword) {
        this.securityStepUpError = '请输入当前密码'
        return
      }
      if (this.securityStepUpMfaEnabled && !/^\d{6}$/.test(this.securityStepUpOtp)) {
        this.securityStepUpError = '请输入认证器当前显示的 6 位验证码'
        return
      }
      this.securityStepUpBusy = true
      this.securityStepUpError = ''
      try {
        const renewSession = Boolean(this.securityStepUpContext?.renewSession)
        const result = await axiosPost(
          renewSession ? '/auth/session/renew' : '/auth/reauth',
          {
            password: this.securityStepUpPassword,
            ...(this.securityStepUpMfaEnabled ? { otp: this.securityStepUpOtp } : {}),
          },
          { showNotify: false },
        )
        this.$store.commit('user/SET_USER_INFO', {
          ...this.$store.state.user.user_info,
          ...result,
        })
        this.resolveSecurityStepUp(true)
      } catch (error) {
        this.securityStepUpError = error.message || '验证失败，请重试'
      } finally {
        this.securityStepUpBusy = false
      }
    },
    clearSessionExpiryNotice() {
      if (this.sessionExpiryTimer) clearTimeout(this.sessionExpiryTimer)
      this.sessionExpiryTimer = null
      if (this.sessionExpiryNotification) this.sessionExpiryNotification.close()
      this.sessionExpiryNotification = null
      this.sessionExpiryKey = ''
    },
    scheduleSessionExpiryNotice(value) {
      if (this.sessionExpiryTimer) clearTimeout(this.sessionExpiryTimer)
      this.sessionExpiryTimer = null
      const expiry = Date.parse(value || '')
      if (!Number.isFinite(expiry) || !this.$store.state.user.authenticated) return
      const serverTime = Date.parse(this.$store.state.user.user_info.serverTime || '')
      const clockOffset = Number.isFinite(serverTime) ? serverTime - Date.now() : 0
      const remaining = expiry - (Date.now() + clockOffset)
      if (remaining <= 0) return
      const delay = Math.max(remaining - 5 * 60 * 1000, 1000)
      const key = String(expiry)
      this.sessionExpiryTimer = setTimeout(() => this.showSessionExpiryNotice(key), delay)
    },
    showSessionExpiryNotice(key) {
      if (this.sessionExpiryKey === key || !this.$store.state.user.authenticated) return
      this.sessionExpiryKey = key
      this.sessionExpiryNotification = this.$notify({
        title: '登录会话即将过期',
        message: '会话将在 5 分钟后过期，点击此通知进行安全续签。',
        type: 'warning',
        duration: 0,
        onClick: async () => {
          this.sessionExpiryNotification?.close()
          this.sessionExpiryNotification = null
          await this.openSecurityStepUp({
            renewSession: true,
            riskLevel: '会话续签',
            requiredFactors: this.$store.state.user.user_info.mfaEnabled ? ['PASSWORD', 'OTP'] : ['PASSWORD'],
          })
        },
      })
    },
  },
}
</script>
