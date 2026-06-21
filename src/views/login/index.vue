<template>
  <div class="tech-bg">
    <AsyncLoginForm />
  </div>
</template>

<script>
import AsyncLoginForm from '@/components/AsyncLoginForm.vue';
export default {
  name: 'login',
  components: { AsyncLoginForm },
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
</style>
