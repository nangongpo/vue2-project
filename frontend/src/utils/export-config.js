export default [
  {
    prop: 'filename',
    prop_width: 1,
    value_width: 400,
    label: '文件名称',
    render: 'input',
    editable: true,
    clearable: true
  },
  {
    prop: 'exportAll',
    prop_width: 1,
    label: '导出选择',
    render: 'radio',
    editable: true,
    options: [
      { label: '全部', value: true },
      { label: '当前选择项', value: false }
    ]
  },
  {
    prop: 'autoWidth',
    prop_width: 1,
    label: '文件名称',
    render: 'radio',
    editable: true,
    options: [
      { label: '是', value: true },
      { label: '否', value: false }
    ]
  },
  {
    prop: 'bookType',
    prop_width: 1,
    value_width: 200,
    label: '文件名称',
    render: 'select',
    editable: true,
    options: [
      { label: 'xlsx', value: 'xlsx' },
      { label: 'xls', value: 'xls' },
      { label: 'csv', value: 'csv' }
    ]
  }
]
