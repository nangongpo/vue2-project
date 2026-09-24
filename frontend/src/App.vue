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
import { setSecurityStepUpHandler } from '@/api/axios'

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
  created() {
    setSecurityStepUpHandler((context) => this.openSecurityStepUp(context))
  },
  beforeDestroy() {
    setSecurityStepUpHandler(null)
    this.resolveSecurityStepUp(false)
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
        const result = await axiosPost(
          '/auth/reauth',
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
  },
}
</script>
