<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h2>账号安全中心</h2>
        <p>管理认证器、登录设备和账号安全状态。</p>
      </div>
      <el-button icon="el-icon-refresh" :loading="securityBusy || loading" @click="refreshAll">刷新状态</el-button>
    </div>

    <el-alert v-if="securityError" :title="securityError" type="error" :closable="false" />

    <status-card :security-user="securityUser" :sessions-count="sessions.length" :format-date="formatDate" />

    <el-card class="section-card" shadow="never">
      <div class="section-heading">
        <div>
          <div class="section-title">认证器管理</div>
          <p class="section-hint">使用认证器保护登录和高风险操作。</p>
        </div>
        <el-tag :type="securityUser.mfaEnabled ? 'success' : 'warning'">
          {{ securityUser.mfaEnabled ? '认证器已绑定' : '尚未绑定' }}
        </el-tag>
      </div>
      <div v-if="securityUser.mfaEnabled" class="security-action-row">
        <div>
          <p>多因素认证已启用。</p>
          <p v-if="securityUser.mfaVerifiedAt" class="muted">
            最近验证：{{ formatDate(securityUser.mfaVerifiedAt) }}
          </p>
        </div>
        <span class="muted">认证器丢失请联系安全管理员，通过受控流程重置。</span>
      </div>
      <div v-else class="security-action-row">
        <p>绑定认证器后，账号即使密码泄露也能获得额外保护。</p>
        <el-button type="primary" @click="openEnrollment">开始绑定</el-button>
      </div>
    </el-card>

    <el-card class="section-card" shadow="never">
      <div class="section-heading">
        <div>
          <div class="section-title">高风险操作验证</div>
          <p class="section-hint">敏感操作会通过全局弹窗要求重新验证身份。</p>
        </div>
        <el-button type="primary" plain @click="openReauth">重新认证</el-button>
      </div>
      <p v-if="securityUser.reauthenticatedAt" class="muted">
        最近重新认证：{{ formatDate(securityUser.reauthenticatedAt) }}
      </p>
    </el-card>

    <el-card class="section-card" shadow="never">
      <div class="section-heading">
        <div>
          <div class="section-title">登录设备</div>
          <p class="section-hint">当前账号的有效登录会话，当前设备不能从这里撤销。</p>
        </div>
        <el-button :loading="loading" @click="loadSessions">刷新设备</el-button>
      </div>
      <session-list :sessions="sessions" :loading="loading" :format-date="formatDate" @revoke="revoke" />
    </el-card>

    <p class="audit-hint">安全登录和认证记录由审计日志统一保存。</p>
    <el-dialog title="绑定认证器" :visible.sync="enrollmentVisible" width="520px" append-to-body
      :close-on-click-modal="false" :before-close="closeEnrollment">
      <mfa-enrollment-flow :step="enrollmentStep" :enrollment="enrollment" :qr-code-url="qrCodeUrl"
        :password.sync="password" :otp.sync="otp" :busy="securityBusy" :error="securityError" @next="enrollMfa"
        @confirm="confirmMfa" @confirm-step="enrollmentStep = 3"
        @previous="enrollmentStep = 2; otp = ''; securityError = ''" @reset="resetEnrollment" />
    </el-dialog>

    <reauth-dialog :visible.sync="reauthVisible" :mfa-enabled="securityUser.mfaEnabled" :password.sync="reauthPassword"
      :otp.sync="reauthOtp" :busy="securityBusy" :error="securityError" @cancel="clearReauth"
      @submit="reauthenticate" />
  </div>
</template>

<script>
import { getMfaStatus, getSessions, revokeSession } from '@/api/user'
import { axiosPost } from '@/api/index'
import { dateFormat } from '@/utils/date'
import { qrSvgDataUrl } from '@/utils/qrcode'
import MfaEnrollmentFlow from '@/components/Security/MfaEnrollmentFlow.vue'
import ReauthDialog from '@/components/Security/ReauthDialog.vue'
import SessionList from '@/components/Security/SessionList.vue'
import StatusCard from '@/components/Security/StatusCard.vue'

export default {
  name: 'SystemSession',
  components: { MfaEnrollmentFlow, ReauthDialog, SessionList, StatusCard },
  data() {
    return {
      loading: false,
      sessions: [],
      securityUser: {},
      securityLoaded: false,
      securityBusy: false,
      securityError: '',
      password: '',
      otp: '',
      reauthPassword: '',
      reauthOtp: '',
      enrollment: null,
      enrollmentStep: 1,
      enrollmentVisible: false,
      reauthVisible: false,
    }
  },
  computed: {
    qrCodeUrl() {
      if (!this.enrollment?.uri) return ''
      try {
        return qrSvgDataUrl(this.enrollment.uri, { title: 'TOTP 绑定二维码' })
      } catch {
        return ''
      }
    },
  },
  async created() {
    await this.loadSecurity()
    if (this.securityLoaded) await this.loadSessions()
  },
  beforeDestroy() {
    this.closeEnrollment()
    this.clearReauth()
  },
  methods: {
    async loadSecurity() {
      this.securityBusy = true
      this.securityError = ''
      try {
        this.securityUser = await getMfaStatus()
        this.securityLoaded = true
      } catch (error) {
        this.securityError = error.message || '账号安全信息加载失败'
      } finally {
        this.securityBusy = false
      }
    },
    async refreshAll() {
      await this.loadSecurity()
      if (this.securityLoaded) await this.loadSessions()
    },
    openEnrollment() {
      this.securityError = ''
      this.enrollmentStep = 1
      this.enrollment = null
      this.password = ''
      this.otp = ''
      this.enrollmentVisible = true
    },
    closeEnrollment(done) {
      if (this.securityBusy) return
      this.enrollmentVisible = false
      this.resetEnrollment()
      if (typeof done === 'function') done()
    },
    resetEnrollment() {
      this.password = ''
      this.otp = ''
      this.enrollment = null
      this.enrollmentStep = 1
    },
    async securityAction(action) {
      if (this.securityBusy) return false
      this.securityBusy = true
      this.securityError = ''
      try {
        await action()
        return true
      } catch (error) {
        this.securityError = error.message || '验证失败，请重试'
        return false
      } finally {
        this.securityBusy = false
      }
    },
    async enrollMfa() {
      if (!this.password) {
        this.securityError = '请输入当前密码'
        return
      }
      await this.securityAction(async () => {
        this.enrollment = await axiosPost('/auth/mfa/enroll', { password: this.password })
        this.enrollmentStep = 2
        this.password = ''
      })
    },
    async confirmMfa() {
      if (!/^\d{6}$/.test(this.otp)) {
        this.securityError = '请输入 6 位验证码'
        return
      }
      const success = await this.securityAction(async () => {
        await axiosPost('/auth/mfa/confirm', { otp: this.otp })
        await this.loadSecurity()
        this.$message.success('认证器绑定成功')
        this.$emit('verified')
      })
      if (success) {
        this.enrollmentVisible = false
        this.resetEnrollment()
        await this.loadSessions()
      }
    },
    openReauth() {
      this.securityError = ''
      this.reauthPassword = ''
      this.reauthOtp = ''
      this.reauthVisible = true
    },
    clearReauth() {
      this.reauthPassword = ''
      this.reauthOtp = ''
      this.reauthVisible = false
    },
    async reauthenticate() {
      if (
        !this.reauthPassword ||
        (this.securityUser.mfaEnabled && !/^\d{6}$/.test(this.reauthOtp))
      ) {
        this.securityError = '请输入密码和有效的动态验证码'
        return
      }
      const success = await this.securityAction(async () => {
        const result = await axiosPost('/auth/reauth', {
          password: this.reauthPassword,
          ...(this.securityUser.mfaEnabled ? { otp: this.reauthOtp } : {}),
        })
        this.securityUser = { ...this.securityUser, ...result }
        this.$store.commit('user/SET_USER_INFO', { ...this.$store.state.user.user_info, ...result })
        this.$message.success('身份验证成功')
        this.$emit('verified')
      })
      if (success) this.clearReauth()
    },
    formatDate(value) {
      return dateFormat(value) || '未知'
    },
    async loadSessions() {
      this.loading = true
      try {
        this.sessions = (await getSessions()) || []
      } catch (error) {
        this.securityError = error.message || '登录设备加载失败'
      } finally {
        this.loading = false
      }
    },
    async revoke(session) {
      try {
        await this.$confirm('确认撤销该设备的登录会话？撤销后需要重新登录。', '撤销登录会话', {
          type: 'warning',
        })
        await revokeSession(session.id)
        this.$message.success('登录会话已撤销')
        await this.loadSessions()
      } catch {
        /* 用户取消或请求失败时由请求层提示。 */
      }
    },
  },
}
</script>

<style lang="scss" scoped>
.page-container {
  padding: 20px;
}

.page-header,
.section-heading,
.security-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 8px;
  font-size: 24px;
}

.page-header p,
.section-hint,
.muted,
.audit-hint {
  color: #7a8492;
}

.page-header p,
.section-hint {
  margin: 0;
}

.section-card {
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.security-action-row {
  margin-top: 18px;
}

.security-action-row p {
  margin: 4px 0;
}

.audit-hint {
  margin: 18px 0;
  text-align: center;
  font-size: 13px;
}

.security-error {
  color: #d93025;
}

@media (max-width: 768px) {
  .page-container {
    padding: 12px;
  }

  .page-header,
  .section-heading,
  .security-action-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
