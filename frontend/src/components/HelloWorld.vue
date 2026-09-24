<template>
  <div class="greetings app-content">
    <div>
      <a href="https://vite.dev" target="_blank">
        <img src="@/assets/vite.svg" class="logo" alt="Vite logo" />
      </a>
      <a href="https://v2.vuejs.org/" target="_blank">
        <img src="@/assets/vue.svg" class="logo vue" alt="Vue logo" />
      </a>
    </div>

    <h1 v-cloak class="green">{{ msg }}</h1>

    <p>
      Edit
      <code>components/HelloWorld.vue</code> to test HMR
    </p>

    <!-- <h3>
      You’ve successfully created a project with
      <a target="_blank" href="https://vitejs.dev/">Vite</a> +
      <a target="_blank" href="https://v2.vuejs.org/">Vue 2</a>.
    </h3> -->

    <!-- <lazy-list ref="listComponent" :local-scroll="false" class="scroll-wrapper"> -->
    <!-- <lazy-item unique-id="common" :height="220"> -->
    <!-- <div class="mb-10 text-center">
          <el-radio-group v-model="radio">
            <el-radio :label="1">备选项1</el-radio>
            <el-radio :label="2">备选项2</el-radio>
            <el-radio :label="3">备选项3</el-radio>
          </el-radio-group>
        </div>

        <div class="mb-10 text-center">
          <el-statistic
            group-separator=","
            :precision="2"
            :value="1314"
            title="增长人数">
          </el-statistic>
        </div>

        <div class="mb-10 text-center">
          <el-button plain @click="openMessage">打开消息提示</el-button>
          <el-button plain @click="openMessageVn">VNode</el-button>
          <el-button plain @click="openPrompt">打开Prompt Dialog</el-button>
        </div>

        <div class="mb-10 text-center">
          <el-button plain @click="openAlert">打开Alert Dialog</el-button>
          <el-button plain @click="openConfirm">打开Confirm Dialog</el-button>
          <el-button plain @click="openNotify">打开Notify</el-button>
        </div> -->

    <div class="mb-10 text-center">
      <el-date-picker
        v-model="date1"
        type="date"
        format="yyyy年MM月dd日"
        value-format="yyyy-MM-dd"
        placeholder="选择日期" />
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
    <!-- </lazy-item> -->
    <!-- <lazy-item unique-id="base-table" :height="250" class="mb-10 text-center"> -->
    <div style="width: 100%; height: 328px">
      <h3>普通表格BaseTable</h3>
      <!-- <BaseTable
            min-height="200px"
            :fields="fields"
            :field-attrs="{ align: 'center', 'header-align': 'center' }"
            :action-attrs="{ width: 80 }"
            :data="tableData">
            <template #action="scope">
              <el-button type="text" size="mini" @click="handleTableRowUpdate(scope.row)">修改</el-button>
            </template>
          </BaseTable> -->
      <BaseTable
        v-loading="loading"
        :fields="fields"
        :field-attrs="{ align: 'center', 'header-align': 'center' }"
        :action-attrs="{ width: 80 }"
        :data="tableData">
        <template #action="scope">
          <el-button type="text" size="mini" @click="handleTableRowUpdate(scope.row)">
            修改
          </el-button>
        </template>
      </BaseTable>
      <Pagination
        v-show="total > 0"
        scroll-container=".greetings"
        :total="total"
        :page.sync="currentPage"
        :limit.sync="pageSize"
        :pageSizes="[4, 10, 20]"
        @pagination="onPaginationChange" />
    </div>

    <!-- </lazy-item> -->
    <!-- <lazy-item
        unique-id="async-table"
        :height="250"
        class="mb-10 text-center">
        <h3>虚拟滚动使用AsyncTable</h3>
        <div v-loading="loading" style="min-height: 210px" class="mb-10">
          <AsyncTable
            :height="210"
            :columns="columns"
            :table-data="tableData"
            :page-size="pageSize" 
          />
        </div>
        <el-pagination
          background
          layout="prev, pager, next"
          :current-page="currentPage"
          :page-size="pageSize"
          :total="8"
          @current-change="onCurrentChange" />
      </lazy-item> -->
    <!-- </lazy-list> -->

    <!-- <div class="infinite-scroll-box mb-10">
      <ul class="infinite-list" v-infinite-scroll="load" style="overflow:auto">
        <li v-for="i in count" class="infinite-list-item">{{ i }}</li>
      </ul>
    </div> -->

    <!-- <AsyncTable v-loading="loading" :columns="columns" :table-data="tableData" :page-size="pageSize" class="mb-10" />
    <el-pagination
      background 
      layout="prev, pager, next" 
      :current-page="currentPage"
      :page-size="pageSize"
      :total="8"
      @current-change="onCurrentChange">
    </el-pagination> -->
  </div>
</template>

<script>
// import AsyncTable from './AsyncTable.vue'
import BaseTable from '@/components/BaseTable/index.vue'
import Pagination from '@/components/Pagination/index.vue'

const tableData = [
  {
    date: '2016-05-02',
    name: '王大虎',
    address: '上海市普陀区金沙江路 1518 弄',
  },
  {
    date: '2016-05-04',
    name: '王大虎',
    address: '上海市普陀区金沙江路 1517 弄',
  },
  {
    date: '2016-05-01',
    name: '王大虎',
    address: '上海市普陀区金沙江路 1519 弄',
  },
  {
    date: '2016-05-03',
    name: '王大虎',
    address: '上海市普陀区金沙江路 1516 弄',
  },
  {
    date: '2016-05-02',
    name: '王二虎',
    address: '上海市普陀区金沙江路 1518 弄',
  },
  {
    date: '2016-05-04',
    name: '王二虎',
    address: '上海市普陀区金沙江路 1517 弄',
  },
  {
    date: '2016-05-01',
    name: '王二虎',
    address: '上海市普陀区金沙江路 1519 弄',
  },
  {
    date: '2016-05-03',
    name: '王二虎',
    address: '上海市普陀区金沙江路 1516 弄',
  },
]

export default {
  components: {
    // LazyList,
    // LazyItem,
    // AsyncTable,
    BaseTable,
    Pagination,
  },
  props: {
    msg: String,
  },
  data() {
    return {
      loading: false,
      radio: 1,
      count: 0,
      date1: '',
      currentPage: 1,
      pageSize: 4,
      total: 8,
      fields: [
        { type: 'selection', width: 55 },
        {
          prop: 'date',
          label: '日期',
          width: 180,
          formatValue: (item, row) => {
            return row[item.prop].split('-').join('/')
          },
        },
        { prop: 'name', label: '姓名', width: 180 },
        { prop: 'address', label: '地址' },
      ],
      columns: [
        { field: 'date', key: 'date', title: '日期', width: 180 },
        { field: 'name', key: 'name', title: '姓名', width: 180 },
        { field: 'address', key: 'address', title: '地址' },
      ],
      tableData: [],
    }
  },
  mounted() {
    this.onPaginationChange({ page: 1, limit: 4 })
  },
  methods: {
    load() {
      this.count += 2
    },
    openMessage() {
      this.$message('这是一条消息提示')
    },
    openMessageVn() {
      const h = this.$createElement
      this.$message({
        message: h('p', null, [
          h('span', null, '内容可以是 '),
          h('i', { style: 'color: teal' }, 'VNode'),
        ]),
      })
    },
    openPrompt() {
      this.$prompt('请输入邮箱', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern:
          /[\w!#$%&'*+/=?^_`{|}~-]+(?:\.[\w!#$%&'*+/=?^_`{|}~-]+)*@(?:[\w](?:[\w-]*[\w])?\.)+[\w](?:[\w-]*[\w])?/,
        inputErrorMessage: '邮箱格式不正确',
      })
        .then(({ value }) => {
          this.$message({
            type: 'success',
            message: '你的邮箱是: ' + value,
          })
        })
        .catch(() => {
          this.$message({
            type: 'info',
            message: '取消输入',
          })
        })
    },
    openAlert() {
      this.$alert('这是一段内容', '标题名称', {
        confirmButtonText: '确定',
        callback: (action) => {
          this.$message({
            type: 'info',
            message: `action: ${action}`,
          })
        },
      })
    },
    openConfirm() {
      this.$confirm('此操作将永久删除该文件, 是否继续?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(() => {
          this.$message({
            type: 'success',
            message: '删除成功!',
          })
        })
        .catch(() => {
          this.$message({
            type: 'info',
            message: '已取消删除',
          })
        })
    },
    openNotify() {
      const h = this.$createElement

      this.$notify({
        title: '标题名称',
        message: h(
          'i',
          { style: 'color: teal' },
          '这是提示文案这是提示文案这是提示文案这是提示文案这是提示文案这是提示文案这是提示文案这是提示文案'
        ),
      })
    },
    handleTableRowUpdate(row) {
      console.log(row)
    },
    onCurrentChange(currentPage) {
      this.currentPage = currentPage
      this.loading = true
      setTimeout(() => {
        this.tableData = [
          {
            date: '2016-05-02',
            name: '王二虎',
            address: '上海市普陀区金沙江路 1518 弄',
          },
          {
            date: '2016-05-04',
            name: '王二虎',
            address: '上海市普陀区金沙江路 1517 弄',
          },
          {
            date: '2016-05-01',
            name: '王二虎',
            address: '上海市普陀区金沙江路 1519 弄',
          },
          {
            date: '2016-05-03',
            name: '王二虎',
            address: '上海市普陀区金沙江路 1516 弄',
          },
        ]
        this.loading = false
      }, 2000)
    },
    onPaginationChange({ page, limit }) {
      this.loading = true
      setTimeout(() => {
        const startIndex = (page - 1) * limit
        const endIndex = page * limit
        this.tableData = tableData.slice(startIndex, endIndex)
        this.currentPage = page
        this.loading = false
      }, 2000)
    },
  },
}
</script>

<style scoped>
.greetings {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  padding: 0 10px;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}

a:hover {
  color: #535bf2;
}

h1 {
  font-size: 2.6em;
  line-height: 1.1;
  margin: 10px;
}

h3 {
  font-size: 1.2rem;
  margin: 10px 10px 20px 10px;
}

.greetings h1,
.greetings h3 {
  text-align: center;
}

.logo {
  width: 6em;
  height: 6em;
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

.table-wrapper {
  width: 100%;
  height: 210px;
  overflow: hidden;
}
.infinite-scroll-box {
  width: 100%;
  height: 700px;
  border: 1px solid #eee;
  box-sizing: border-box;
}

.infinite-list {
  height: 700px;
  padding: 0px;
  margin: 0px;
  list-style: none;
  overflow: auto;
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

.el-dropdown-link {
  cursor: pointer;
  color: #409eff;
}

.el-icon-arrow-down {
  font-size: 12px;
}
</style>
