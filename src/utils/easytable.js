import XLSX from 'xlsx-js-style'

export function parseColumns(columns) {
    // A. 计算表头最大深度（总行数）
    const getDepth = (nodes) => {
        let max = 0;
        nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
                max = Math.max(max, getDepth(node.children));
            }
        });
        return max + 1;
    };
    const maxDepth = getDepth(columns);

    // B. 计算每个节点占用的总列数 (colSpan)
    const calcColSpan = (node) => {
        if (!node.children || node.children.length === 0) {
            node.colSpan = 1;
            return 1;
        }
        let total = 0;
        node.children.forEach(child => {
            total += calcColSpan(child);
        });
        node.colSpan = total;
        return total;
    };
    columns.forEach(node => calcColSpan(node));

    // 计算整张表总列数
    const totalCols = columns.reduce((sum, node) => sum + node.colSpan, 0);

    // C. 初始化标准的空表头网格 (maxDepth 行 * totalCols 列)
    const headerRows = Array.from({ length: maxDepth }, () => Array(totalCols).fill(''));
    const merges = [];
    const fields = [];

    // D. 递归填充网格并生成合并规则
    const fillGrid = (nodes, curRow, curCol) => {
        let colOffset = curCol;
        nodes.forEach(node => {
            // 填入当前单元格文本
            headerRows[curRow][colOffset] = node.title;

            const isLeaf = !node.children || node.children.length === 0;
            const rowSpan = isLeaf ? (maxDepth - curRow) : 1; // 叶子节点自动向下合并至底层
            const colSpan = node.colSpan;

            // 记录合并坐标
            if (rowSpan > 1 || colSpan > 1) {
                merges.push({
                    s: { r: curRow, c: colOffset },
                    e: { r: curRow + rowSpan - 1, c: colOffset + colSpan - 1 }
                });
            }

            if (isLeaf) {
                fields.push(node.field); // 收集叶子节点的 field 用于后面映射数据
            } else {
                fillGrid(node.children, curRow + 1, colOffset); // 递归处理子项
            }

            colOffset += colSpan; // 右移当前计算的列坐标
        });
    };

    fillGrid(columns, 0, 0);

    return { headerRows, merges, fields };
}

export function exportExcel(options) {
    const { columns, tableData } = options
    // 1. 调用解析器，动态获取表头、合并规则、字段顺序
    const { headerRows, merges, fields } = this.parseColumns(columns)

    // 2. 根据解析出的 fields 顺序，动态映射数据行
    const dataRows = tableData.map(item => {
    return fields.map(field => item[field] ?? '')
    });

    // 3. 拼接表头和数据
    const sheetData = [...headerRows, ...dataRows]

    // 4. 生成 Excel 工作表
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData)
    worksheet['!merges'] = merges; // 注入动态计算的合并规则

    // 5. 触发浏览器下载
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "动态多级报表")

    XLSX.writeFile(workbook, '智能多级表头报表.xlsx')
}