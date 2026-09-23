<template>
  <!-- 首页不使用UI库 -->
  <div class="tech-bg">
    <div class="login-container">
      <section class="login-intro">
        <h1>{{ title }}</h1>
        <p class="intro-copy">后台管理系统</p>
        <div class="management-points">
          <div class="management-point"><span class="point-icon">✓</span><span>用户与组织管理</span></div>
          <div class="management-point"><span class="point-icon">✓</span><span>角色与权限配置</span></div>
          <div class="management-point"><span class="point-icon">✓</span><span>系统运行信息查看</span></div>
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
            @blur="prepareCaptcha"
          />
        </div>

        <div class="input-group password-group">
          <label for="password">登录密码</label>
          <input
            v-model="loginModel.password"
            id="password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            @input="clearLoginError"
          />
          <div class="login-error">{{ loginError || ' ' }}</div>
        </div>

        <div class="login-action">
          <button
            :class="['login-btn', { 'is-loading': loading, 'is-disabled': loading }]"
            :disabled="loading"
            type="primary"
            style="width: 100%;"
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
      @close="handleCaptchaDialogClose">
      <div class="captcha-dialog-body">
        <p class="captcha-dialog-tip">请拖动拼图完成验证，验证通过后将自动登录</p>
        <div ref="captchaContainer" class="captcha-container"></div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { createSliderCaptcha } from '@/utils/sliderCaptcha'
import { REQUEST_CODE } from '@/api/codes'
import { createCaptchaChallenge, reportCaptchaEvent, verifyCaptcha } from '@/api/user'
import { getSystemHealth } from '@/api/system'

export default {
  name: 'login',
  data() {
    return {
      title: 'vue2-project',
      loading: false,
      loadingText: '',
      captchaDialogVisible: false,
      captchaLoading: false,
      captchaInitStartedAt: 0,
      systemStatus: {
        state: 'checking',
        text: '系统状态检查中'
      },
      captchaVerified: false,
      captchaResult: null,
      captchaChallenge: null,
      captchaUsername: '',
      loginError: '',
      sliderCaptcha: null,
      loginModel: {
        username: 'admin',
        password: 'admin@123456'
      },
    }
  },
  methods: {
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
        if (this.sliderCaptcha && this.sliderCaptcha.SetChallenge) this.sliderCaptcha.SetChallenge(this.captchaChallenge.payload)
        this.reportCaptchaEvent('INIT_SUCCESS', { attemptId: this.captchaChallenge.attemptId, challengeId: this.captchaChallenge.challengeId, durationMs: Date.now() - this.captchaInitStartedAt })
      } catch (error) {
        this.loginError = error && error.message ? error.message : '验证码服务暂不可用'
        this.reportCaptchaEvent('INIT_FAILURE', { durationMs: Date.now() - this.captchaInitStartedAt, reason: error && error.code ? String(error.code) : 'INIT_REQUEST_FAILED' })
      } finally {
        this.captchaLoading = false
      }
    },
    initSliderCaptcha() {
      if (!this.$refs.captchaContainer) return
      if (this.sliderCaptcha) this.sliderCaptcha.destroy()
      this.sliderCaptcha = createSliderCaptcha(this.$refs.captchaContainer, {
        verify: result => {
          if (!this.captchaChallenge) return Promise.reject(new Error('验证码加载中，请稍候'))
          return verifyCaptcha({
            attemptId: this.captchaChallenge.attemptId,
            challengeId: this.captchaChallenge.challengeId,
            points: result.points,
            finalX: result.finalX,
            trackWidth: result.trackWidth
          })
        },
        onSuccess: result => {
          this.reportCaptchaEvent('VERIFY_SUCCESS', { attemptId: this.captchaChallenge && this.captchaChallenge.attemptId, challengeId: this.captchaChallenge && this.captchaChallenge.challengeId, durationMs: result.duration })
          this.captchaVerified = true
          this.captchaResult = result
          this.captchaDialogVisible = false
          this.submitLogin()
        },
        onFail: error => {
          this.reportCaptchaEvent('VERIFY_FAILURE', { attemptId: this.captchaChallenge && this.captchaChallenge.attemptId, challengeId: this.captchaChallenge && this.captchaChallenge.challengeId, reason: error && error.code ? String(error.code) : 'VERIFY_FAILED' })
          this.captchaVerified = false
          this.captchaResult = null
          if (error && error.code === REQUEST_CODE.CAPTCHA_INVALID) {
            this.captchaChallenge = null
            this.prepareCaptcha()
          }
        },
        onEvent: event => {
          if (event.event === 'RESOURCE_LOAD_FAILURE') {
            this.reportCaptchaEvent(event.Event || event.event, { attemptId: this.captchaChallenge && this.captchaChallenge.attemptId, challengeId: this.captchaChallenge && this.captchaChallenge.challengeId, reason: event.reason })
          }
        }
      })
    },
    async handleLogin() {
      if (this.loading || this.captchaDialogVisible) return
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
      const loginPayload = { ...this.loginModel }
      if (this.captchaResult && this.captchaResult.captchaToken) {
        loginPayload.captchaToken = this.captchaResult.captchaToken
        loginPayload.attemptId = this.captchaResult.attemptId
      }
      try {
        await this.$store.dispatch('user/login', loginPayload)
        await this.$router.replace({ name: 'dashboard' })
      } catch (error) {
        this.loginError = error && error.message ? error.message : '登录失败，请重试'
        this.captchaVerified = false
        this.captchaResult = null
        const needsCaptcha = error && (
          error.code === REQUEST_CODE.CAPTCHA_REQUIRED
          || error.code === REQUEST_CODE.CAPTCHA_INVALID
        )
        if (needsCaptcha) {
          this.captchaChallenge = null
          this.captchaDialogVisible = true
          this.$nextTick(() => this.prepareCaptcha())
        } else {
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
    }
  },
  mounted() {
    this.checkSystemHealth()
  },
  beforeDestroy() {
    if (this.sliderCaptcha) this.sliderCaptcha.destroy()
  }
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
  content: "";
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
  0% { transform: translate(0, 0); }
  50% { transform: translate(25%, 25%); }
  100% { transform: translate(0, 0); }
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
  background: rgba(11, 17, 30, .94);
  border: 1px solid rgba(0, 242, 254, .52);
  border-radius: 10px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .72), 0 0 35px rgba(0, 242, 254, .08);
}

.login-intro {
  position: relative;
  display: flex;
  flex: 0 0 42%;
  flex-direction: column;
  padding: 48px 48px 36px;
  overflow: hidden;
  background: linear-gradient(145deg, rgba(12, 45, 75, .96), rgba(7, 18, 35, .98));
}

.login-intro::after {
  position: absolute;
  right: -90px;
  bottom: -110px;
  width: 270px;
  height: 270px;
  border: 1px solid rgba(0, 242, 254, .22);
  border-radius: 50%;
  box-shadow: 0 0 0 22px rgba(0, 242, 254, .04), 0 0 0 44px rgba(0, 242, 254, .025);
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
  box-shadow: 0 0 9px rgba(85, 214, 139, .8);
}

.intro-status.is-checking {
  color: #9aa8b5;
}

.intro-status.is-checking .status-dot {
  background: #e6a23c;
  box-shadow: 0 0 9px rgba(230, 162, 60, .65);
}

.intro-status.is-error {
  color: #f39a9a;
}

.intro-status.is-error .status-dot {
  background: #f56c6c;
  box-shadow: 0 0 9px rgba(245, 108, 108, .7);
}

.login-form-panel {
  flex: 1;
  padding: 38px 40px 28px;
  background: rgba(8, 14, 25, .82);
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
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
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
