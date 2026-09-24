<template>
  <div class="page-container">
    <el-card class="security-card" shadow="never">
      <div class="page-title">账号安全验证</div>
      <p v-if="securityUser.mfaRequired && !securityUser.mfaEnabled">
        管理员需绑定认证器后才能使用管理功能。
      </p>
      <p v-if="securityUser.mfaEnabled">多因素认证已启用。高风险操作前请重新验证身份。</p>
      <p v-if="securityUser.reauthenticatedAt">
        最近重新认证：{{ formatDate(securityUser.reauthenticatedAt) }}
      </p>
      <form
        v-if="securityLoaded && !securityUser.mfaEnabled"
        @submit.prevent="enrollment ? confirmMfa() : enrollMfa()">
        <template v-if="!enrollment">
          <label for="enrollment-password">当前密码</label>
          <el-input
            id="enrollment-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            maxlength="128" />
          <el-button native-type="submit" type="primary" :loading="securityBusy"
            >验证密码并绑定认证器</el-button
          >
        </template>
        <template v-else>
          <p>使用认证器扫描二维码添加 TOTP 账号（{{ enrollment.expiresIn / 60 }} 分钟内有效）：</p>
          <div class="mfa-qr-panel">
            <img v-if="qrCodeUrl" class="mfa-qr-code" :src="qrCodeUrl" alt="TOTP 绑定二维码" />
            <p v-else class="mfa-qr-error">二维码生成失败，请使用下方密钥手动添加。</p>
          </div>
          <p>无法扫码时，在认证器中手动输入以下密钥：</p>
          <code class="mfa-secret">{{ enrollment.secret }}</code>
          <details>
            <summary>手动导入 URI</summary>
            <code class="mfa-secret">{{ enrollment.uri }}</code>
          </details>
          <p>使用 6 位验证码、SHA1 算法及 30 秒周期。请勿分享密钥或导入 URI。</p>
          <label for="enrollment-otp">动态验证码</label>
          <el-input
            id="enrollment-otp"
            v-model="otp"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6" />
          <el-button native-type="submit" type="primary" :loading="securityBusy"
            >确认绑定</el-button
          >
          <el-button :disabled="securityBusy" @click="resetEnrollment">重新绑定</el-button>
        </template>
      </form>
      <form
        v-if="
          securityLoaded && (securityUser.mfaEnabled || !securityUser.mfaRequired) && !enrollment
        "
        @submit.prevent="reauthenticate">
        <label for="reauth-password">重新认证密码</label>
        <el-input
          id="reauth-password"
          v-model="reauthPassword"
          type="password"
          autocomplete="current-password"
          maxlength="128" />
        <template v-if="securityUser.mfaEnabled">
          <label for="reauth-otp">新的动态验证码</label>
          <el-input
            id="reauth-otp"
            v-model="reauthOtp"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6" />
          <p>已用验证码不能重复使用，请等待认证器更新后提交。</p>
        </template>
        <el-button native-type="submit" type="primary" :loading="securityBusy">重新认证</el-button>
      </form>
      <p v-if="securityError" role="alert" class="security-error">{{ securityError }}</p>
      <el-button v-if="!securityLoaded" :loading="securityBusy" @click="loadSecurity"
        >重试加载</el-button
      >
    </el-card>
    <el-card v-if="!securityOnly && canListSessions" shadow="never">
      <div class="page-title">当前账号的登录会话</div>
      <el-table v-loading="loading" :data="sessions" border stripe>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.current ? 'success' : 'info'">
              {{ scope.row.current ? '当前会话' : '其他设备' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="登录地址" width="100" />
        <el-table-column prop="userAgent" label="设备信息" min-width="300" show-overflow-tooltip />
        <el-table-column label="登录时间" width="150">
          <template #default="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="最近活跃" width="150">
          <template #default="scope">
            {{ formatDate(scope.row.lastSeenAt) }}
          </template>
        </el-table-column>
        <el-table-column label="过期时间" width="150">
          <template #default="scope">
            {{ formatDate(scope.row.expiresAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="100">
          <template slot-scope="scope">
            <el-button type="text" :disabled="scope.row.current" @click="revoke(scope.row)">
              撤销
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script>
import { getMfaStatus, getSessions, revokeSession } from '@/api/user'
import { axiosPost } from '@/api/index'
import { dateFormat } from '@/utils/date'
import { qrSvgDataUrl } from '@/utils/qrcode'

export default {
  name: 'SystemSession',
  props: {
    securityOnly: { type: Boolean, default: false },
    initialSecurity: { type: Object, default: null },
  },
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
    }
  },
  computed: {
    canListSessions() {
      return (
        this.securityLoaded &&
        (!this.securityUser.mfaRequired ||
          (this.securityUser.mfaEnabled && this.securityUser.mfaVerifiedAt))
      )
    },
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
    if (!this.securityOnly && this.canListSessions) await this.loadSessions()
  },
  beforeDestroy() {
    this.resetEnrollment()
    this.reauthPassword = ''
    this.reauthOtp = ''
  },
  methods: {
    async loadSecurity() {
      this.securityBusy = true
      this.securityError = ''
      try {
        this.securityUser = this.initialSecurity || (await getMfaStatus())
        this.securityLoaded = true
      } catch (error) {
        this.securityError = error.message || '账号安全信息加载失败'
      } finally {
        this.securityBusy = false
      }
    },
    resetEnrollment() {
      this.password = ''
      this.otp = ''
      this.enrollment = null
    },
    async securityAction(action) {
      if (this.securityBusy) return
      this.securityBusy = true
      this.securityError = ''
      try {
        await action()
      } catch (error) {
        this.securityError = error.message || '验证失败，请重试'
      } finally {
        this.password = ''
        this.otp = ''
        this.reauthPassword = ''
        this.reauthOtp = ''
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
      })
    },
    async confirmMfa() {
      if (!/^\d{6}$/.test(this.otp)) {
        this.securityError = '请输入 6 位验证码'
        return
      }
      await this.securityAction(async () => {
        const result = await axiosPost('/auth/mfa/confirm', { otp: this.otp })
        this.resetEnrollment()
        this.securityUser = { ...this.securityUser, ...result }
        this.$store.commit('user/SET_USER_INFO', { ...this.$store.state.user.user_info, ...result })
        this.$message.success('认证器绑定成功')
        if (!this.securityOnly && this.canListSessions) await this.loadSessions()
        this.$emit('verified')
      })
    },
    async reauthenticate() {
      if (
        !this.reauthPassword ||
        (this.securityUser.mfaEnabled && !/^\d{6}$/.test(this.reauthOtp))
      ) {
        this.securityError = '请输入密码和有效的动态验证码'
        return
      }
      await this.securityAction(async () => {
        const result = await axiosPost('/auth/reauth', {
          password: this.reauthPassword,
          ...(this.securityUser.mfaEnabled ? { otp: this.reauthOtp } : {}),
        })
        this.securityUser = { ...this.securityUser, ...result }
        this.$store.commit('user/SET_USER_INFO', { ...this.$store.state.user.user_info, ...result })
        this.$message.success('身份验证成功，请返回并重新执行操作')
        if (!this.securityOnly && this.canListSessions) await this.loadSessions()
        this.$emit('verified')
      })
    },
    formatDate(value) {
      return dateFormat(value) || '未知'
    },
    async loadSessions() {
      this.loading = true
      try {
        this.sessions = (await getSessions()) || []
      } finally {
        this.loading = false
      }
    },
    async revoke(session) {
      await this.$confirm('确认撤销该登录会话？', '提示', { type: 'warning' })
      await revokeSession(session.id)
      this.$message.success('会话已撤销')
      await this.loadSessions()
    },
  },
}
</script>

<style lang="scss" scoped>
.page-container {
  padding: 20px;
}
.page-title {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
}
.security-card {
  margin-bottom: 20px;
}
.security-card form {
  max-width: 460px;
  margin: 16px 0;
}
.security-card label {
  display: block;
  margin: 12px 0 6px;
}
.security-card .el-button {
  margin-top: 12px;
}
.mfa-qr-panel {
  display: flex;
  justify-content: center;
  margin: 12px 0 16px;
  padding: 16px;
  background: #f6f8fb;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}
.mfa-qr-code {
  width: 188px;
  height: 188px;
  image-rendering: pixelated;
}
.mfa-qr-error {
  margin: 0;
  color: #d93025;
}
.mfa-secret {
  display: block;
  overflow-wrap: anywhere;
  user-select: all;
  margin: 12px 0;
}
.security-error {
  color: #d93025;
}
</style>
