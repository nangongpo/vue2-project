<template>
  <div class="login-async-container">
    <component :is="activeComponent" v-bind="$attrs" v-on="$listeners" />
  </div>
</template>

<script>
// 1. 使用 Vite 8 的 ?url 动态获取资源路径，避开 CSS 自动分割与注入
import { cssUrls } from '@/utils/element-loader'
const { baseCssUrl, buttonCssUrl, formCssUrl, inputCssUrl } = cssUrls

const title = 'vue2-project'

// 2. 函数式组件：加载中骨架屏
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
    return {
      activeComponent: LoginSkeleton,
    };
  },
  mounted() {
    this.initAsyncComponent();
  },
  methods: {
    initAsyncComponent() {
      // 3. 批量按需加载 CSS
      [baseCssUrl, buttonCssUrl, formCssUrl, inputCssUrl].forEach(url => {
        if (!document.querySelector(`link[href="${url}"]`)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = url;
          document.head.appendChild(link);
        }
      });

      // 4. 链式调用：异步加载 Element-UI 组件
      Promise.all([
        import('element-ui/lib/form'),
        import('element-ui/lib/form-item'),
        import('element-ui/lib/input'),
        import('element-ui/lib/button')
      ]).then(([Form, FormItem, Input, Button]) => {
        // 更新组件状态
        this.activeComponent = {
          components: { 
            ElForm: Form, 
            ElFormItem: FormItem, 
            ElInput: Input, 
            ElButton: Button 
          },
          data() {
            return {
              loginModel: {
                username: '',
                password: ''
              },
            }
          },
          render(h) {
            const { username, password } = this.loginModel
            return h('div', { class: 'skeleton-wrapper' }, [
              h('div', { class: 'mb-20' }, title),
              h('el-form', {
                class: 'login-form',
                props: { model: this.loginModel },
              }, [
                h('el-form-item', { props: { prop: 'username' } }, [
                  h('el-input', { 
                    props: {
                      value: username,
                      'prefix-icon': 'el-icon-user',
                    },
                    attrs: {
                      placeholder: '用户名',
                    },
                    on: {
                      input: (newVal) => {
                        this.loginModel.username = newVal
                      }
                    }
                  })
                ]),
                h('el-form-item', { props: { prop: 'password' } }, [
                  h('el-input', { 
                    props: {
                      value: password,
                      type: 'password', 
                      'prefix-icon': 'el-icon-lock' 
                    },
                    attrs: {
                      placeholder: '密码',
                    },
                    on: {
                      input: (newVal) => {
                        this.loginModel.password = newVal
                      }
                    }
                  })
                ]),
                h('el-form-item', [
                  h('el-button', { 
                    props: { type: 'primary' }, 
                    style: { width: '100%' },
                    on: {
                      click: () => {
                        console.log('登录', this.loginModel)
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
  font-size: 24px; 
  font-weight: 700; 
  text-align: center; 
  width: 320px; 
  height: 260px;
  border: 1px solid #eee; 
  border-radius: 4px;
  padding: 20px; 
  box-sizing: border-box;
}
.skeleton-item {
  background: #f0f2f5; border-radius: 4px; margin-bottom: 20px;
  animation: pulse 1.5s infinite ease-in-out;
}
.header { 
  height: 34px; 
  width: 60%; 
  margin: 0 auto 20px auto; 
}
.input, .button { 
  height: 40px; 
}
@keyframes pulse { 
  0% { opacity: 0.6; } 
  50% { opacity: 1; } 
  100% { opacity: 0.6; } 
}
</style>
