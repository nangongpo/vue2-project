<template>
  <!-- 首页不使用UI库 -->
  <div class="tech-bg">
    <div class="login-container">
      <section class="login-intro">
        <h1>{{ title }}</h1>
        <p class="intro-copy">后台管理系统</p>
        <div class="management-points">
          <div class="management-point">
            <span class="point-icon">✓</span><span>用户与组织管理</span>
          </div>
          <div class="management-point">
            <span class="point-icon">✓</span><span>角色与权限配置</span>
          </div>
          <div class="management-point">
            <span class="point-icon">✓</span><span>系统运行信息查看</span>
          </div>
        </div>
        <div :class="['intro-status', 'is-' + systemStatus.state]">
          <span class="status-dot"></span>{{ systemStatus.text }}
        </div>
      </section>

      <section class="login-form-panel">
        <div class="login-heading">
          <div>
            <h2>登录后台</h2>
          </div>
        </div>
        <div class="input-group">
          <label for="username">员工账号</label>
          <input
            v-model="loginModel.username"
            id="username"
            autocomplete="username"
            placeholder="请输入用户名/邮箱"
            @input="handleUsernameInput"
            @blur="prepareCaptcha" />
        </div>

        <div class="input-group password-group">
          <label for="password">登录密码</label>
          <input
            v-model="loginModel.password"
            id="password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            @input="clearLoginError" />
          <div class="login-error">{{ loginError || ' ' }}</div>
        </div>

        <div class="login-action">
          <button
            :class="['login-btn', { 'is-loading': loading, 'is-disabled': loading }]"
            :disabled="loading"
            type="primary"
            style="width: 100%"
            @click="handleLogin">
            <span class="btn-loading-icon"></span>
            <span class="btn-text">{{ loadingText || '验证并登录' }}</span>
          </button>
        </div>
      </section>
    </div>

    <el-dialog
      title="完成验证后登录"
      :visible.sync="captchaDialogVisible"
      width="420px"
      custom-class="captcha-dialog"
      append-to-body
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :destroy-on-close="true"
      @close="handleCaptchaDialogClose">
      <div class="captcha-dialog-body">
        <p class="captcha-dialog-tip">请拖动拼图完成验证，验证通过后将自动登录</p>
        <div ref="captchaContainer" class="captcha-container"></div>
      </div>
    </el-dialog>

    <el-dialog
      title="输入动态验证码"
      :visible.sync="otpDialogVisible"
      width="420px"
      custom-class="otp-dialog"
      append-to-body
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :destroy-on-close="true"
      @opened="focusOtpInput"
      @close="handleOtpDialogClose">
      <div class="otp-dialog-body">
        <p class="otp-dialog-tip">请输入认证器中当前显示的 6 位动态验证码</p>
        <input
          ref="otpInput"
          v-model="loginModel.otp"
          class="otp-dialog-input"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="请输入 6 位验证码"
          :disabled="loading"
          @input="handleOtpInput"
          @keyup.enter="submitOtpLogin" />
        <div class="login-error">{{ loginError || ' ' }}</div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button :disabled="loading" @click="cancelOtpLogin">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submitOtpLogin">验证并登录</el-button>
      </span>
    </el-dialog>

    <el-dialog
      :visible.sync="securityPending"
      width="520px"
      custom-class="security-dialog"
      append-to-body
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :destroy-on-close="true"
      :before-close="blockSecurityDialogClose">
      <session-security
        security-only
        :initial-security="mfaStatus"
        @verified="finishLogin" />
      <span slot="footer" class="dialog-footer">
        <el-button type="danger" plain @click="cancelSecurity">退出登录</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { createSliderCaptcha } from '@/utils/sliderCaptcha'
import { REQUEST_CODE } from '@/api/codes'
import {
  createCaptchaChallenge,
  reportCaptchaEvent,
  verifyCaptcha,
} from '@/api/user'
import { getSystemHealth } from '@/api/system'
import SessionSecurity from '@/views/system/session/index.vue'

export default {
  name: 'login',
  components: { SessionSecurity },
  data() {
    return {
      title: 'vue2-project',
      loading: false,
      securityPending: false,
      otpDialogVisible: false,
      mfaStatus: null,
      loadingText: '',
      captchaDialogVisible: false,
      captchaLoading: false,
      captchaInitStartedAt: 0,
      systemStatus: {
        state: 'checking',
        text: '系统状态检查中',
      },
      captchaVerified: false,
      captchaResult: null,
      captchaChallenge: null,
      captchaUsername: '',
      loginError: '',
      sliderCaptcha: null,
      loginModel: {
        username: 'admin',
        password: 'admin@123456',
        otp: '',
      },
    }
  },
  methods: {
    async finishLogin() {
      this.securityPending = false
      await this.$router.replace({ name: 'dashboard' })
    },
    async cancelSecurity() {
      await this.$store.dispatch('user/logout')
      this.securityPending = false
      this.mfaStatus = null
    },
    focusOtpInput() {
      this.$nextTick(() => {
        if (this.$refs.otpInput) this.$refs.otpInput.focus()
      })
    },
    handleOtpInput() {
      this.loginModel.otp = (this.loginModel.otp || '').replace(/\D/g, '').slice(0, 6)
      this.loginError = ''
    },
    handleOtpDialogClose() {
      this.loginModel.otp = ''
    },
    cancelOtpLogin() {
      this.otpDialogVisible = false
      this.loginModel.otp = ''
      this.loginError = ''
    },
    blockSecurityDialogClose(done) {
      if (!this.securityPending && typeof done === 'function') done()
    },
    async prepareCaptcha() {
      const username = (this.loginModel.username || '').trim()
      if (!username || !this.captchaDialogVisible) return
      if (this.captchaChallenge && this.captchaUsername === username && this.sliderCaptcha) return
      this.captchaLoading = true
      this.captchaInitStartedAt = Date.now()
      if (this.sliderCaptcha) this.sliderCaptcha.destroy()
      this.sliderCaptcha = null
      this.captchaChallenge = null
      this.captchaUsername = username
      this.captchaVerified = false
      this.captchaResult = null
      this.initSliderCaptcha()
      try {
        this.captchaChallenge = await createCaptchaChallenge({ username })
        if (this.sliderCaptcha && this.sliderCaptcha.SetChallenge) {
          this.sliderCaptcha.SetChallenge(this.captchaChallenge.payload)
        }
        this.reportCaptchaEvent('INIT_SUCCESS', {
          attemptId: this.captchaChallenge.attemptId,
          challengeId: this.captchaChallenge.challengeId,
          durationMs: Date.now() - this.captchaInitStartedAt,
        })
      } catch (error) {
        this.loginError = error && error.message ? error.message : '验证码服务暂不可用'
        this.reportCaptchaEvent('INIT_FAILURE', {
          durationMs: Date.now() - this.captchaInitStartedAt,
          reason: error && error.code ? String(error.code) : 'INIT_REQUEST_FAILED',
        })
      } finally {
        this.captchaLoading = false
      }
    },
    initSliderCaptcha() {
      if (!this.$refs.captchaContainer) return
      if (this.sliderCaptcha) this.sliderCaptcha.destroy()
      this.sliderCaptcha = createSliderCaptcha(this.$refs.captchaContainer, {
        verify: (result) => {
          if (!this.captchaChallenge) return Promise.reject(new Error('验证码加载中，请稍候'))
          return verifyCaptcha({
            attemptId: this.captchaChallenge.attemptId,
            challengeId: this.captchaChallenge.challengeId,
            points: result.points,
            finalX: result.finalX,
            trackWidth: result.trackWidth,
          })
        },
        onSuccess: (result) => {
          this.reportCaptchaEvent('VERIFY_SUCCESS', {
            attemptId: this.captchaChallenge && this.captchaChallenge.attemptId,
            challengeId: this.captchaChallenge && this.captchaChallenge.challengeId,
            durationMs: result.duration,
          })
          this.captchaVerified = true
          this.captchaResult = result
          this.captchaDialogVisible = false
          this.submitLogin()
        },
        onFail: (error) => {
          this.reportCaptchaEvent('VERIFY_FAILURE', {
            attemptId: this.captchaChallenge && this.captchaChallenge.attemptId,
            challengeId: this.captchaChallenge && this.captchaChallenge.challengeId,
            reason: error && error.code ? String(error.code) : 'VERIFY_FAILED',
          })
          this.captchaVerified = false
          this.captchaResult = null
          if (error && error.code === REQUEST_CODE.CAPTCHA_INVALID) {
            this.captchaChallenge = null
            this.prepareCaptcha()
          }
        },
        onEvent: (event) => {
          if (event.event === 'RESOURCE_LOAD_FAILURE') {
            this.reportCaptchaEvent(event.Event || event.event, {
              attemptId: this.captchaChallenge && this.captchaChallenge.attemptId,
              challengeId: this.captchaChallenge && this.captchaChallenge.challengeId,
              reason: event.reason,
            })
          }
        },
      })
    },
    async handleLogin() {
      if (this.loading || this.captchaDialogVisible || this.otpDialogVisible) return
      this.loginError = ''
      if (!this.loginModel.username.trim() || !this.loginModel.password) {
        this.loginError = '请输入员工账号和登录密码'
        return
      }
      this.captchaDialogVisible = true
      this.$nextTick(() => this.prepareCaptcha())
    },
    async submitLogin() {
      this.loadingText = '正在登录...'
      this.loading = true
      const completingOtp = this.otpDialogVisible
      const loginPayload = { ...this.loginModel }
      if (!loginPayload.otp) delete loginPayload.otp
      if (this.captchaResult && this.captchaResult.captchaToken) {
        loginPayload.captchaToken = this.captchaResult.captchaToken
        loginPayload.attemptId = this.captchaResult.attemptId
      }
      try {
        if (completingOtp) {
          await this.$store.dispatch('user/completeLogin', { otp: this.loginModel.otp })
        } else {
          await this.$store.dispatch('user/login', loginPayload)
        }
        this.loginModel.otp = ''
        this.otpDialogVisible = false
        await this.finishLogin()
      } catch (error) {
        const errorMessage = error && error.message ? error.message : ''
        const requiresOtp = error && error.code === REQUEST_CODE.MFA_REQUIRED
        const invalidOtp = error && error.code === REQUEST_CODE.MFA_INVALID
        const requiresEnrollment = error && error.code === REQUEST_CODE.MFA_ENROLL_REQUIRED
        this.loginError = invalidOtp
          ? '验证码错误或已使用，请输入认证器当前显示的验证码'
          : requiresOtp || requiresEnrollment
          ? ''
          : errorMessage || '登录失败，请重试'
        const needsCaptcha =
          error &&
          (error.code === REQUEST_CODE.CAPTCHA_REQUIRED ||
            error.code === REQUEST_CODE.CAPTCHA_INVALID)
        if (needsCaptcha) {
          this.captchaVerified = false
          this.captchaResult = null
          this.captchaChallenge = null
          this.captchaDialogVisible = true
          this.otpDialogVisible = false
          this.$nextTick(() => this.prepareCaptcha())
        } else if (requiresOtp || invalidOtp) {
          this.otpDialogVisible = true
          this.focusOtpInput()
        } else if (requiresEnrollment) {
          this.mfaStatus = error.data || {
            mfaRequired: true,
            mfaEnabled: false,
            mfaVerifiedAt: null,
            reauthenticatedAt: null,
          }
          this.securityPending = true
        } else {
          this.captchaVerified = false
          this.captchaResult = null
          this.captchaChallenge = null
          if (this.sliderCaptcha) this.sliderCaptcha.destroy()
          this.sliderCaptcha = null
        }
      } finally {
        this.loadingText = ''
        this.loading = false
      }
    },
    handleCaptchaDialogClose() {
      if (this.captchaVerified) return
      if (this.sliderCaptcha) this.sliderCaptcha.destroy()
      this.sliderCaptcha = null
      this.captchaChallenge = null
      this.captchaResult = null
      this.captchaLoading = false
    },
    clearLoginError() {
      this.loginError = ''
    },
    async submitOtpLogin() {
      if (this.loading) return
      if (!/^\d{6}$/.test(this.loginModel.otp)) {
        this.loginError = '请输入 6 位验证码'
        this.focusOtpInput()
        return
      }
      await this.submitLogin()
    },
    handleUsernameInput() {
      this.loginError = ''
      const username = (this.loginModel.username || '').trim()
      if (this.captchaUsername && username !== this.captchaUsername) {
        this.captchaChallenge = null
        this.captchaVerified = false
        this.captchaResult = null
      }
    },
    reportCaptchaEvent(event, data = {}) {
      reportCaptchaEvent({ event, ...data }).catch(() => {})
    },
    async checkSystemHealth() {
      try {
        const result = await getSystemHealth()
        if (result && result.status === 'ok') {
          this.systemStatus = { state: 'ok', text: '系统服务正常' }
        } else {
          this.systemStatus = { state: 'error', text: '系统服务异常' }
        }
      } catch {
        this.systemStatus = { state: 'error', text: '系统服务不可用' }
      }
    },
  },
  mounted() {
    this.checkSystemHealth()
  },
  beforeDestroy() {
    if (this.sliderCaptcha) this.sliderCaptcha.destroy()
  },
}
</script>
<style scoped>
.tech-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #060913;
  z-index: 1;
  overflow: hidden;
}

/* 使用伪元素承载背景和动画 */
.tech-bg::before {
  content: '';
  position: absolute;
  /* 将伪元素放大，模拟 400% 的 background-size 效果 */
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: -webkit-linear-gradient(135deg, #060913 0%, #0c152b 35%, #13274f 70%, #060913 100%);
  background: linear-gradient(135deg, #060913 0%, #0c152b 35%, #13274f 70%, #060913 100%);
  transform: translateZ(0);
  animation: gradientMove 15s ease infinite;
}

@keyframes gradientMove {
  0% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(25%, 25%);
  }
  100% {
    transform: translate(0, 0);
  }
}

.login-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  display: flex;
  width: 700px;
  min-height: 420px;
  padding: 0;
  overflow: hidden;
  background: rgba(11, 17, 30, 0.94);
  border: 1px solid rgba(0, 242, 254, 0.52);
  border-radius: 10px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.72), 0 0 35px rgba(0, 242, 254, 0.08);
}

.login-intro {
  position: relative;
  display: flex;
  flex: 0 0 42%;
  flex-direction: column;
  padding: 48px 48px 36px;
  overflow: hidden;
  background: linear-gradient(145deg, rgba(12, 45, 75, 0.96), rgba(7, 18, 35, 0.98));
}

.login-intro::after {
  position: absolute;
  right: -90px;
  bottom: -110px;
  width: 270px;
  height: 270px;
  border: 1px solid rgba(0, 242, 254, 0.22);
  border-radius: 50%;
  box-shadow: 0 0 0 22px rgba(0, 242, 254, 0.04), 0 0 0 44px rgba(0, 242, 254, 0.025);
  content: '';
}

.login-intro h1 {
  margin: 0;
  color: #fff;
  font-size: 30px;
  letter-spacing: 1px;
}

.intro-copy {
  margin: 16px 0 0;
  color: #a6c2d1;
  font-size: 14px;
  line-height: 1.8;
}

.management-points {
  position: relative;
  z-index: 1;
  margin-top: auto;
}

.management-point {
  display: flex;
  align-items: center;
  margin-top: 18px;
  color: #bdd5df;
  font-size: 13px;
}

.point-icon {
  display: inline-block;
  width: 19px;
  height: 19px;
  margin-right: 10px;
  color: #07131f;
  background: #56d9df;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
  line-height: 19px;
  text-align: center;
}

.intro-status {
  position: relative;
  z-index: 1;
  margin-top: 34px;
  color: #7fabb9;
  font-size: 12px;
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  background: #55d68b;
  border-radius: 50%;
  box-shadow: 0 0 9px rgba(85, 214, 139, 0.8);
}

.intro-status.is-checking {
  color: #9aa8b5;
}

.intro-status.is-checking .status-dot {
  background: #e6a23c;
  box-shadow: 0 0 9px rgba(230, 162, 60, 0.65);
}

.intro-status.is-error {
  color: #f39a9a;
}

.intro-status.is-error .status-dot {
  background: #f56c6c;
  box-shadow: 0 0 9px rgba(245, 108, 108, 0.7);
}

.login-form-panel {
  flex: 1;
  padding: 38px 40px 28px;
  background: rgba(8, 14, 25, 0.82);
}

.login-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 22px;
}

.login-heading h2 {
  margin: 0;
  color: #fff;
  font-size: 24px;
  font-weight: 600;
}

.input-group {
  margin-bottom: 18px;
}

.captcha-container {
  margin-top: 2px;
}

.captcha-dialog-body {
  width: 360px;
  max-width: 100%;
  margin: 0 auto;
}

.captcha-dialog-tip {
  margin: 0 0 14px;
  color: #8495a6;
  font-size: 13px;
  line-height: 1.6;
}

.otp-dialog-body {
  width: 360px;
  max-width: 100%;
  margin: 0 auto;
}

.otp-dialog-tip {
  margin: 0 0 14px;
  color: #8495a6;
  font-size: 13px;
  line-height: 1.6;
}

.otp-dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  background-color: #141c2e;
  border: 1px solid #233554;
  border-radius: 2px;
  color: #fff;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
}

.otp-dialog-input:focus {
  border-color: #00f2fe;
  outline: none;
  box-shadow: 0 0 8px rgba(0, 242, 254, 0.5);
}

.otp-dialog-input:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

::v-deep .security-dialog {
  position: absolute;
  top: 50%;
  left: 50%;
  max-height: calc(100vh - 40px);
  margin: 0 !important;
  transform: translate(-50%, -50%);
}

::v-deep .security-dialog .el-dialog__body {
  padding: 12px 22px 0;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}

::v-deep .security-dialog .page-title {
  padding: 8px 0 10px 0;
  line-height: 24px;
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}

::v-deep .security-dialog .el-dialog__header {
  display: none;
}

::v-deep .security-dialog .page-container {
  padding: 0;
}

::v-deep .security-dialog .security-card {
  margin-bottom: 0;
  border: 0;
}

::v-deep .security-dialog .security-card .el-card__body {
  padding: 0;
}

::v-deep .security-dialog .security-card form {
  max-width: none;
}

.login-error {
  font-size: 14px;
  font-weight: 500;
  color: #f56c6c;
  height: 18px;
  line-height: 18px;
  margin-top: 4px;
}

.input-group label {
  display: block;
  color: #8a99ad;
  font-size: 14px;
  margin-bottom: 8px;
  line-height: 1;
  padding: 0;
}

.input-group input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  background-color: #141c2e;
  border: 1px solid #233554;
  color: #ffffff;
  font-size: 14px;
  border-radius: 2px;
}

.input-group input:focus {
  border-color: #00f2fe;
  outline: none;
  box-shadow: 0 0 8px rgba(0, 242, 254, 0.5);
}

.login-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(90deg, #00cbd9, #00f2fe);
  border: none;
  color: #060913;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  border-radius: 2px;
  -webkit-transition: background-color 0.2s;
  transition: background-color 0.2s;
}

.login-btn:hover {
  background: linear-gradient(90deg, #00b8c6, #00d9e8);
}

.login-btn:disabled {
  background-color: #13394d;
  color: #7094a6;
  cursor: not-allowed;
}

.login-btn.is-disabled {
  opacity: 0.82;
}

.login-action {
  margin-top: 20px;
}

/* 纯 CSS 旋转菊花 */
.btn-loading-icon {
  display: none; /* 默认隐藏 */
  vertical-align: middle;
  margin-right: 8px;
  margin-bottom: 4px;
  width: 14px;
  height: 14px;
  border: 2px solid #7094a6;
  border-top-color: #00f2fe;
  border-radius: 50%;
  animation: btnSpinner 0.8s linear infinite;
}

@keyframes btnSpinner {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.login-btn.is-loading .btn-loading-icon {
  display: inline-block;
}

@media (max-width: 760px) {
  .login-container {
    display: block;
    width: calc(100% - 32px);
    max-height: calc(100% - 32px);
    overflow-y: auto;
  }

  .login-intro {
    min-height: 190px;
    padding: 28px 30px;
  }

  .login-intro h1 {
    font-size: 24px;
  }

  .management-points {
    display: none;
  }

  .intro-status {
    margin-top: 22px;
  }

  .login-form-panel {
    padding: 32px 30px 28px;
  }
}
</style>
