<template>
  <div class="greetings">
    <div>
      <a href="https://vite.dev" target="_blank">
        <img src="@/assets/vite.svg" class="logo" alt="Vite logo" />
      </a>
      <a href="https://v2.vuejs.org/" target="_blank">
        <img src="@/assets/vue.svg" class="logo vue" alt="Vue logo" />
      </a>
    </div>

    <h1 class="green">{{ msg }}</h1>

    <p>
      Edit
      <code>components/HelloWorld.vue</code> to test HMR
    </p>

    <h3>
      You’ve successfully created a project with
      <a target="_blank" href="https://vitejs.dev/">Vite</a> +
      <a target="_blank" href="https://v2.vuejs.org/">Vue 2</a>.
    </h3>

    <div class="mb-10">
      <el-radio-group v-model="radio">
        <el-radio :label="1">备选项1</el-radio>
        <el-radio :label="2">备选项2</el-radio>
        <el-radio :label="3">备选项3</el-radio>
      </el-radio-group>
    </div>

    <div class="mb-10">
      <el-statistic
        group-separator=","
        :precision="2"
        :value="1314"
        title="增长人数">
      </el-statistic>
    </div>

    <div class="mb-10">
      <el-button plain @click="openMessage">打开消息提示</el-button>
      <el-button plain @click="openMessageVn">VNode</el-button>
      <el-button plain @click="openPrompt">打开Prompt Dialog</el-button>
    </div>

    <div class="mb-10">
      <el-button plain @click="openAlert">打开Alert Dialog</el-button>
      <el-button plain @click="openConfirm">打开Confirm Dialog</el-button>
      <el-button plain @click="openNotify">打开Notify</el-button>
    </div>

      
    <div class="mb-10">
    <el-date-picker
      v-model="date1"
      type="date"
      format="yyyy年MM月dd日"
      value-format="yyyy-MM-dd"
      placeholder="选择日期">
    </el-date-picker>
    <el-popover
      placement="top-start"
      title="标题"
      width="200"
      trigger="hover"
      content="这是一段内容,这是一段内容,这是一段内容,这是一段内容。">
      <el-button slot="reference">hover 激活</el-button>
    </el-popover>
    <el-dropdown>
      <span class="el-dropdown-link">
        下拉菜单<i class="el-icon-arrow-down el-icon--right"></i>
      </span>
      <el-dropdown-menu slot="dropdown">
        <el-dropdown-item>黄金糕</el-dropdown-item>
        <el-dropdown-item>狮子头</el-dropdown-item>
        <el-dropdown-item>螺蛳粉</el-dropdown-item>
        <el-dropdown-item disabled>双皮奶</el-dropdown-item>
        <el-dropdown-item divided>蚵仔煎</el-dropdown-item>
      </el-dropdown-menu>
    </el-dropdown>
    </div>

    <div class="infinite-scroll-box mb-10">
      <ul class="infinite-list" v-infinite-scroll="load" style="overflow:auto">
        <li v-for="i in count" class="infinite-list-item">{{ i }}</li>
      </ul>
    </div>

    <AsyncTable v-loading="loading" :columns="columns" :table-data="tableData" class="mb-10" />
    <el-pagination 
      background 
      layout="prev, pager, next" 
      :current-page="currentPage"
      :page-size="pageSize"
      :total="8"
      @current-change="onCurrentChange">
    </el-pagination>

    <!-- <el-table
      :data="tableData"
      v-loading="loading"
      stripe
      style="width: 100%"
      class="mb-10">
      <el-table-column
        prop="date"
        label="日期"
        width="180">
      </el-table-column>
      <el-table-column
        prop="name"
        label="姓名"
        width="180">
      </el-table-column>
      <el-table-column
        prop="address"
        label="地址">
      </el-table-column>
    </el-table> -->
  </div>
</template>

<script>
import AsyncTable from '@/components/AsyncTable.vue'
export default {
  components: { AsyncTable },
  props: {
    msg: String
  },
  data() {
    return {
      loading: false,
      radio: 1,
      count: 0,
      date1: '',
      currentPage: 1,
      pageSize: 4,
      columns: [
        { field: "date", key: "date", title: "日期", width: 180 },
        { field: "name", key: "name", title: "姓名", width: 180 },
        { field: "address", key: "address", title: "地址" },
      ],
      tableData: [{
        date: '2016-05-02',
        name: '王大虎',
        address: '上海市普陀区金沙江路 1518 弄'
      }, {
        date: '2016-05-04',
        name: '王大虎',
        address: '上海市普陀区金沙江路 1517 弄'
      }, {
        date: '2016-05-01',
        name: '王大虎',
        address: '上海市普陀区金沙江路 1519 弄'
      }, {
        date: '2016-05-03',
        name: '王大虎',
        address: '上海市普陀区金沙江路 1516 弄'
      }],
    }
  },
  mounted() {
  },
  methods: {
    load() {
      this.count += 2
    },
    openMessage() {
      this.$message('这是一条消息提示')
    },
    openMessageVn() {
      const h = this.$createElement;
      this.$message({
        message: h('p', null, [
          h('span', null, '内容可以是 '),
          h('i', { style: 'color: teal' }, 'VNode')
        ])
      })
    },
    openPrompt() {
      this.$prompt('请输入邮箱', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /[\w!#$%&'*+/=?^_`{|}~-]+(?:\.[\w!#$%&'*+/=?^_`{|}~-]+)*@(?:[\w](?:[\w-]*[\w])?\.)+[\w](?:[\w-]*[\w])?/,
        inputErrorMessage: '邮箱格式不正确'
      }).then(({ value }) => {
        this.$message({
          type: 'success',
          message: '你的邮箱是: ' + value
        })
      }).catch(() => {
        this.$message({
          type: 'info',
          message: '取消输入'
        })     
      })
    },
    openAlert() {
      this.$alert('这是一段内容', '标题名称', {
        confirmButtonText: '确定',
        callback: action => {
          this.$message({
            type: 'info',
            message: `action: ${ action }`
          });
        }
      });
    },
    openConfirm() {
      this.$confirm('此操作将永久删除该文件, 是否继续?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.$message({
          type: 'success',
          message: '删除成功!'
        })
      }).catch(() => {
        this.$message({
          type: 'info',
          message: '已取消删除'
        })      
      })
    },
    openNotify() {
      const h = this.$createElement;

      this.$notify({
        title: '标题名称',
        message: h('i', { style: 'color: teal'}, '这是提示文案这是提示文案这是提示文案这是提示文案这是提示文案这是提示文案这是提示文案这是提示文案')
      })
    },
    onCurrentChange(currentPage) {
      this.currentPage = currentPage
      this.loading = true
      setTimeout(() => {
        this.tableData = [{
          date: '2016-05-02',
          name: '王二虎',
          address: '上海市普陀区金沙江路 1518 弄'
        }, {
          date: '2016-05-04',
          name: '王二虎',
          address: '上海市普陀区金沙江路 1517 弄'
        }, {
          date: '2016-05-01',
          name: '王二虎',
          address: '上海市普陀区金沙江路 1519 弄'
        }, {
          date: '2016-05-03',
          name: '王二虎',
          address: '上海市普陀区金沙江路 1516 弄'
        }]
        this.loading = false
      }, 2000)
    }
  }
}
</script>

<style>
:root {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}
a:hover {
  color: #535bf2;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
}

.mb-10 {
  margin-bottom: 10px;
}

/* button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
}
button:hover {
  border-color: #646cff;
}
button:focus,
button:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
} */

.card {
  padding: 2em;
}

#app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

@media (prefers-color-scheme: light) {
  :root {
    color: #213547;
    background-color: #ffffff;
  }
  a:hover {
    color: #747bff;
  }
  button {
    background-color: #f9f9f9;
  }
}

.infinite-scroll-box {
  height: 200px;
  overflow-x: hidden;
  overflow-y: auto;
}

.infinite-list .infinite-list-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 50px;
  background: #e8f3fe;
  margin: 10px;
  color: #7dbcfc;
}

h1 {
  font-weight: 500;
  font-size: 2.6rem;
  top: -10px;
}

h3 {
  font-size: 1.2rem;
}

.greetings h1,
.greetings h3 {
  text-align: center;
}

.logo {
  height: 4em;
  padding: 1em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
  .el-dropdown-link {
    cursor: pointer;
    color: #409EFF;
  }
  .el-icon-arrow-down {
    font-size: 12px;
  }
</style>
