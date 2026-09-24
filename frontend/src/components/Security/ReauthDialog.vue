<template>
  <el-dialog
    title="账号安全验证"
    :visible.sync="visibleProxy"
    width="440px"
    append-to-body
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    @closed="clearForm">
    <el-form label-width="100px" @submit.native.prevent="$emit('submit')">
      <p v-if="riskLevel" class="risk-hint">
        当前操作需要额外身份验证，验证成功后将继续执行（{{ riskLevel }}）。
      </p>
      <el-form-item label="当前密码">
        <el-input v-model="passwordProxy" type="password" autocomplete="current-password" />
      </el-form-item>
      <el-form-item v-if="mfaEnabled" label="动态验证码">
        <el-input
          v-model="otpProxy"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          @keyup.enter.native="$emit('submit')" />
      </el-form-item>
      <p class="muted">已使用的验证码不能重复提交，请输入认证器当前显示的验证码。</p>
      <p v-if="error" class="security-error">{{ error }}</p>
    </el-form>
    <span slot="footer">
      <el-button :disabled="busy" @click="$emit('cancel')">取消</el-button>
      <el-button type="primary" :loading="busy" @click="$emit('submit')">确认验证</el-button>
    </span>
  </el-dialog>
</template>

<script>
export default {
  name: 'ReauthDialog',
  props: {
    visible: Boolean,
    mfaEnabled: Boolean,
    password: { type: String, default: '' },
    otp: { type: String, default: '' },
    busy: Boolean,
    error: { type: String, default: '' },
    riskLevel: { type: String, default: '' },
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
    passwordProxy: {
      get() {
        return this.password
      },
      set(value) {
        this.$emit('update:password', value)
      },
    },
    otpProxy: {
      get() {
        return this.otp
      },
      set(value) {
        this.$emit('update:otp', value.replace(/\D/g, '').slice(0, 6))
      },
    },
  },
  methods: {
    clearForm() {
      this.$emit('update:password', '')
      this.$emit('update:otp', '')
    },
  },
}
</script>

<style lang="scss" scoped>
.muted {
  color: #7a8492;
}
.security-error {
  color: #d93025;
}
</style>
