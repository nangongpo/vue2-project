<template>
  <div class="login-container">
    <AsyncLoginForm />
  </div>
</template>

<script>
import AsyncLoginForm from '@/components/AsyncLoginForm.vue';
export default {
  name: 'login',
  components: { AsyncLoginForm },
  data() {
    return {
    }
  },
  computed: {},
  watch: {},
  created() { },
  mounted() { },
  methods: {}
}
</script>
<style scoped>
.login-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
