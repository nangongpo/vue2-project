<template>
  <div class="mfa-enrollment-flow">
    <div class="step-indicator" role="list" aria-label="认证器绑定步骤">
      <div :class="['step-item', { active: step === 1, completed: step > 1 }]" role="listitem">
        <span class="step-icon">{{ step > 1 ? '✓' : 1 }}</span>
        <span class="step-title">确认身份</span>
      </div>
      <span class="step-separator" aria-hidden="true">》</span>
      <div :class="['step-item', { active: step === 2, completed: step > 2 }]" role="listitem">
        <span class="step-icon">{{ step > 2 ? '✓' : 2 }}</span>
        <span class="step-title">添加认证器</span>
      </div>
      <span class="step-separator" aria-hidden="true">》</span>
      <div :class="['step-item', { active: step === 3 }]" role="listitem">
        <span class="step-icon">3</span>
        <span class="step-title">验证绑定</span>
      </div>
    </div>

    <div v-if="step === 1" class="flow-step">
      <p>请输入当前密码，确认由本人发起认证器绑定。</p>
      <el-input
        :value="password"
        type="password"
        autocomplete="current-password"
        placeholder="当前密码"
        @input="$emit('update:password', $event)"
        @keyup.enter.native="$emit('next')" />
      <p v-if="error" class="security-error">{{ error }}</p>
      <el-button type="primary" :loading="busy" @click="$emit('next')">下一步</el-button>
    </div>

    <div v-else-if="step === 2 && enrollment" class="flow-step">
      <div class="enrollment-main-card">
        <div class="mfa-qr-panel">
          <div v-if="qrCodeUrl" class="qr-frame">
            <img class="mfa-qr-code" :src="qrCodeUrl" alt="TOTP 绑定二维码" />
          </div>
          <span v-else class="qr-error">二维码生成失败，请重新生成绑定信息</span>
        </div>
        <p class="qr-caption">使用认证器扫描二维码，将此账号添加到认证器。</p>
        <el-button type="primary" :disabled="busy || !qrCodeUrl" @click="$emit('confirm-step')">
          已完成扫码，继续
        </el-button>
      </div>

      <el-collapse v-model="fallbackOpen" class="fallback-panel">
        <el-collapse-item name="fallback">
          <template slot="title">无法扫描二维码？使用备用方式</template>
          <div class="fallback-content">
            <div class="fallback-option">
              <div>
                <strong>手动输入密钥</strong>
                <p>在认证器中选择手动输入，填写以下密钥。</p>
              </div>
              <div class="secret-row">
                <code class="mfa-secret">{{ enrollment.secret }}</code>
                <el-button size="mini" @click="copySecret">复制密钥</el-button>
              </div>
            </div>

            <div class="fallback-option">
              <strong>导入 OTP 链接</strong>
              <p>复制链接，在认证器中选择“从剪贴板导入”或“导入设置”。</p>
              <el-input
                :value="enrollment.uri"
                type="textarea"
                :rows="3"
                readonly
                class="otp-uri-input"
                aria-label="OTP 导入链接" />
              <el-button size="small" @click="copyOtpUri">复制 OTP 链接</el-button>
              <span v-if="copied" class="copy-success">已复制</span>
            </div>

            <p class="sensitive-hint">二维码、密钥和 OTP 链接具有同等敏感性，请勿分享。</p>
          </div>
        </el-collapse-item>
      </el-collapse>

      <div class="enrollment-footer">
        <span class="muted">绑定信息将在 {{ Math.ceil(enrollment.expiresIn / 60) }} 分钟后失效</span>
        <el-button type="text" :disabled="busy" @click="$emit('reset')">重新生成</el-button>
      </div>
      <p v-if="error" class="security-error">{{ error }}</p>
    </div>

    <div v-else-if="step === 3" class="flow-step">
      <p>请输入认证器当前显示的 6 位动态验证码。</p>
      <el-input
        :value="otp"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        autofocus
        placeholder="6 位验证码"
        @input="$emit('update:otp', $event.replace(/\D/g, '').slice(0, 6))"
        @keyup.enter.native="$emit('confirm')" />
      <p v-if="error" class="security-error">{{ error }}</p>
      <div class="flow-actions">
        <el-button :disabled="busy" @click="$emit('previous')">上一步</el-button>
        <el-button type="primary" :loading="busy" @click="$emit('confirm')">确认绑定</el-button>
      </div>
    </div>
  </div>
</template>

<script>
import { copyText } from '@/utils'

export default {
  name: 'MfaEnrollmentFlow',
  data() {
    return { copied: false, fallbackOpen: [] }
  },
  props: {
    step: { type: Number, required: true },
    enrollment: { type: Object, default: null },
    qrCodeUrl: { type: String, default: '' },
    password: { type: String, default: '' },
    otp: { type: String, default: '' },
    busy: Boolean,
    error: { type: String, default: '' },
  },
  methods: {
    async copySecret() {
      const secret = this.enrollment && this.enrollment.secret
      if (!secret) return
      try {
        await copyText(secret)
        if (this.$message) this.$message.success('密钥已复制，请勿分享')
      } catch {
        if (this.$message) this.$message.warning('复制失败，请手动复制密钥')
      }
    },
    async copyOtpUri() {
      const uri = this.enrollment && this.enrollment.uri
      if (!uri) return
      try {
        await copyText(uri)
        this.copied = true
        setTimeout(() => {
          this.copied = false
        }, 2000)
      } catch {
        this.copied = false
        if (this.$message) this.$message.warning('复制失败，请手动复制 OTP 链接')
      }
    },
  },
}
</script>

<style lang="scss" scoped>
.mfa-enrollment-flow {
  min-height: 240px;
}
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
}
.step-item {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-around;
  gap: 6px;
  color: #909399;
  font-size: 13px;
  white-space: nowrap;
}
.step-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: #909399;
  font-size: 12px;
  border: 1px solid #c0c4cc;
  border-radius: 50%;
}
.step-item.active {
  color: #409eff;
  font-weight: 600;
}
.step-item.active .step-icon,
.step-item.completed .step-icon {
  color: #fff;
  background: #409eff;
  border-color: #409eff;
}
.step-item.completed {
  color: #67c23a;
}
.step-item.completed .step-icon {
  background: #67c23a;
  border-color: #67c23a;
}
.step-separator {
  color: #c0c4cc;
  font-size: 16px;
}
.flow-step {
  margin-top: 18px;
}
.flow-step > .el-button {
  margin-top: 18px;
}
.flow-actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}
.mfa-qr-panel {
  display: flex;
  justify-content: center;
  margin: 0;
  padding: 20px;
  background: #fff;
}
.enrollment-intro h3 {
  margin: 0 0 8px;
  color: #303133;
  font-size: 20px;
}
.enrollment-intro p,
.qr-caption,
.fallback-option p {
  color: #7a8492;
  font-size: 13px;
}
.enrollment-intro p {
  margin: 0 0 16px;
}
.enrollment-main-card {
  padding: 8px 20px 20px;
  text-align: center;
  background: #f6f8fb;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}
.qr-frame {
  display: inline-flex;
  padding: 12px;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
}
.mfa-qr-code {
  width: 188px;
  height: 188px;
  image-rendering: pixelated;
}
.qr-caption {
  margin: 0 0 16px;
}
.qr-error {
  padding: 40px 0;
  color: #f56c6c;
}
.fallback-panel {
  margin-top: 16px;
  border-top: 0;
}
.fallback-content {
  padding: 4px 12px 8px;
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-top: 0;
}
.fallback-option + .fallback-option {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid #ebeef5;
}
.fallback-option strong {
  color: #606266;
  font-size: 14px;
}
.fallback-option p {
  margin: 6px 0 8px;
}
.secret-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mfa-secret {
  flex: 1;
  min-width: 0;
  padding: 8px;
  overflow-wrap: anywhere;
  user-select: all;
  background: #f7f9fc;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}
.otp-uri-panel {
  margin-top: 16px;
  padding: 12px;
  background: #f7f9fc;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}
.otp-uri-panel p {
  margin: 0 0 8px;
  color: #7a8492;
  font-size: 13px;
}
.otp-uri-input {
  margin-bottom: 8px;
}
.copy-success {
  margin-left: 8px;
  color: #67c23a;
  font-size: 13px;
}
.sensitive-hint {
  margin: 16px 0 0;
  color: #e6a23c;
  font-size: 12px;
}
.enrollment-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}
.muted {
  font-size: 12px;
  color: #7a8492;
}
.security-error {
  color: #d93025;
}
@media (max-width: 560px) {
  .step-item {
    gap: 4px;
    font-size: 12px;
  }
  .step-icon {
    width: 20px;
    height: 20px;
  }
  .step-separator {
    font-size: 13px;
  }
  .enrollment-main-card {
    padding-right: 12px;
    padding-left: 12px;
  }
  .mfa-qr-code {
    width: 164px;
    height: 164px;
  }
  .secret-row,
  .enrollment-footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .secret-row .el-button {
    margin-top: 8px;
  }
}
</style>
