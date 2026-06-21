<template>
  <component :is="activeComponent" v-bind="$attrs" v-on="$listeners" />
</template>

<script>
// 1. 使用 Vite 8 的 ?url 动态获取资源路径，避开 CSS 自动分割与注入
import formCssUrl from "@/theme/form.css?url";

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
      [formCssUrl].forEach(url => {
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
        import('element-ui/lib/form-item')
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
              loading: false,
              loadingText: '',
              loginModel: {
                username: '',
                password: ''
              },
            }
          },
          render(h) {
            const { username, password } = this.loginModel
            return h('div', { class: 'skeleton-wrapper login-container' }, [
              h('div', { class: 'login-title' }, title),
              h('el-form', {
                props: { model: this.loginModel },
              }, [
                h('el-form-item', { props: { prop: 'username', label: '员工账号' } }, [
                  h('input', {
                    props: {
                      value: username,
                    },
                    attrs: {
                      autocomplete: 'username',
                      placeholder: '请输入用户名/邮箱',
                    },
                    on: {
                      input: (newVal) => {
                        this.loginModel.username = newVal
                      }
                    }
                  })
                ]),
                h('el-form-item', { props: { prop: 'password', label: '安全密码' } }, [
                  h('input', { 
                    props: {
                      value: password,
                      type: 'password',
                    },
                    attrs: {
                      autocomplete: 'current-password',
                      placeholder: '请输入密码',
                    },
                    on: {
                      input: (newVal) => {
                        this.loginModel.password = newVal
                      }
                    }
                  })
                ]),
                h('el-form-item', [
                  h('button', {
                    class: ['login-btn', { 'is-loading': this.loading }],
                    attrs: { disabled: this.loading },
                    props: { type: 'primary' }, 
                    style: { width: '100%' },
                    on: {
                      click: () => {
                        this.loadingText = '正在登录...'
                        this.loading = true
                        setTimeout(() => {
                          console.log('登录', this.loginModel)
                          sessionStorage.setItem('token', 'vue2-project')
                          this.$router.replace({ name: 'dashboard' })
                          this.loadingText = ''
                          this.loading = false
                        }, 3000)
                      }
                    }
                  }, [
                    h('span', { class: 'btn-loading-icon' }),
                    h('span', { class: 'btn-text' }, this.loadingText || '登 录')
                  ])
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

<style>
.skeleton-wrapper {
  font-size: 24px; 
  font-weight: 700; 
  text-align: center; 
  box-sizing: border-box;
}

.skeleton-item {
  background: #f0f2f5; border-radius: 4px; margin-bottom: 20px;
  animation: pulse 1.5s infinite ease-in-out;
}

.skeleton-item .header { 
  height: 34px; 
  width: 60%; 
  margin: 0 auto 20px auto; 
}

.skeleton-item .input, .skeleton-item .button { 
  height: 40px; 
}

@keyframes pulse { 
  0% { opacity: 0.6; } 
  50% { opacity: 1; } 
  100% { opacity: 0.6; } 
}

.login-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  width: 360px;
  height: 380px;
  padding: 40px;
  background-color: #0b111e; 
  border: 1px solid #00f2fe;
  border-radius: 4px;
  box-shadow: 0px 15px 40px rgba(0, 0, 0, 0.8);
}

.login-title {
  color: #ffffff;
  font-size: 22px;
  font-weight: bold;
  margin-top: 0;
  margin-bottom: 30px;
  text-align: center;
  letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(0, 242, 254, 0.5);
}

.login-container .el-form-item {
  margin-bottom: 20px;
}

 .login-container .el-form-item .el-form-item__label {
  display: block;
  color: #8a99ad;
  font-size: 14px;
  margin-bottom: 8px;
  line-height: 1;
  padding: 0;
}

.login-container .el-form-item input {
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
  padding: 12px;
  background-color: #00f2fe;
  border: none;
  color: #060913;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  margin-top: 10px;
  border-radius: 2px;
  -webkit-transition: background-color 0.2s;
  transition: background-color 0.2s;
}

.login-btn:hover {
  background-color: #00b8d4;
}

.login-btn:disabled {
  background-color: #13394d;
  color: #7094a6;
  cursor: not-allowed;
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
</style>
