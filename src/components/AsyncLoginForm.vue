<template>
  <div class="login-async-container">
    <component :is="activeComponent" v-bind="$attrs" v-on="$listeners" />
  </div>
</template>

<script>
import elCssUrl from "element-ui/lib/theme-chalk/index.css?url";

// 静态锁：防止多个组件实例重复插入 CSS
let isCssLoaded = false;

const LoginSkeleton = {
  functional: true,
  render(h) {
    return h('div', { class: 'skeleton-wrapper' }, [
      h('div', { class: 'skeleton-item header' }),
      h('div', { class: 'skeleton-item input' }),
      h('div', { class: 'skeleton-item input' }),
      h('div', { class: 'skeleton-item button' })
    ]);
  }
};

export default {
  data() {
    return { activeComponent: LoginSkeleton };
  },
  mounted() {
    this.initAsyncComponent();
  },
  methods: {
    initAsyncComponent() {
      // 1. 链式调用：插入 CSS (检查锁)
      if (!isCssLoaded) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = elCssUrl;
        document.head.appendChild(link);
        isCssLoaded = true;
      }

      // 2. 链式调用：加载组件模块
      import('element-ui').then(({ Form, FormItem, Input, Button }) => {
        // 更新组件状态
        this.activeComponent = {
          components: { ElForm: Form, ElFormItem: FormItem, ElInput: Input, ElButton: Button },
          data: () => ({ form: { u: '', p: '' } }),
          render(h) {
            return h('div', { class: 'skeleton-wrapper' }, [
              h('div', { class: 'mb-10' }, 'vue2-project'),
              h('el-form', { props: { model: this.form }, class: 'login-form' }, [
                h('el-form-item', [h('el-input', { props: { placeholder: '用户名' } })]),
                h('el-form-item', [h('el-input', { props: { type: 'password', placeholder: '密码' } })]),
                h('el-form-item', [
                  h('el-button', { 
                    props: { type: 'primary' }, 
                    style: { width: '100%' },
                    on: {
                      click: (evt) => {
                        sessionStorage.setItem('token', 'vue2-project')
                        this.$router.replace({ name: 'dashboard' })
                      }
                    }
                  }, '登录')
                ])
              ])
            ]);
          }
        };
      }).catch(err => {
        console.error('组件加载失败:', err);
      });
    }
  }
};
</script>

<style scoped>
.skeleton-wrapper {
  font-size: 24px; font-weight: 700; text-align: center; width: 320px; height: 260px;
  border: 1px solid #eee; padding: 20px; box-sizing: border-box;
}
.skeleton-item {
  background: #f0f2f5; border-radius: 4px; margin-bottom: 20px;
  animation: pulse 1.5s infinite ease-in-out;
}
.header { height: 34px; width: 60%; margin: 0 auto 20px auto; }
.input { height: 40px; }
.button { height: 40px; }
@keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
</style>
