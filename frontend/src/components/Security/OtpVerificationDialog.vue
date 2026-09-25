<template>
  <el-dialog
    title="输入动态验证码"
    :visible.sync="visibleProxy"
    width="420px"
    custom-class="otp-verification-dialog"
    append-to-body
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :destroy-on-close="true"
    @opened="focusInput"
    @closed="clearOtp">
    <div class="otp-body">
      <p>请输入认证器中当前显示的 6 位动态验证码。</p>
      <el-input
        ref="otpInput"
        :value="otp"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        placeholder="请输入 6 位验证码"
        :disabled="busy"
        @input="handleInput"
        @keyup.enter.native="$emit('submit')" />
      <p v-if="recoveryHint" class="recovery-hint">{{ recoveryHint }}</p>
      <p v-if="error" class="security-error">{{ error }}</p>
    </div>
    <span slot="footer">
      <el-button :disabled="busy" @click="$emit('cancel')">取消</el-button>
      <el-button type="primary" :loading="busy" @click="$emit('submit')">验证并登录</el-button>
    </span>
  </el-dialog>
</template>

<script>
export default {
  name: 'OtpVerificationDialog',
  props: {
    visible: Boolean,
    otp: { type: String, default: '' },
    busy: Boolean,
    error: { type: String, default: '' },
    recoveryHint: { type: String, default: '' },
  },
  computed: {
    visibleProxy: {
      get() {
        return this.visible
      },
      set(value) {
        this.$emit('update:visible', value)
      },
    },
  },
  methods: {
    handleInput(value) {
      this.$emit('update:otp', (value || '').replace(/\D/g, '').slice(0, 6))
      this.$emit('clear-error')
    },
    focusInput() {
      this.$nextTick(() => this.$refs.otpInput && this.$refs.otpInput.focus())
    },
    clearOtp() {
      this.$emit('update:otp', '')
    },
  },
}
</script>

<style lang="scss" scoped>
.otp-body {
  width: 360px;
  max-width: 100%;
  margin: 0 auto;
}
.otp-body p {
  color: #8495a6;
  font-size: 13px;
  line-height: 1.6;
}
.security-error {
  color: #d93025 !important;
}
.recovery-hint {
  margin: 8px 0 0;
  color: #8495a6;
}
</style>
