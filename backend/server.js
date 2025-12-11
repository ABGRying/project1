const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

// 导入路由
const contactsRouter = require('./routes/contacts');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors({
    origin: '*', // 允许所有来源，生产环境应限制
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务（可选）
app.use(express.static(path.join(__dirname, 'public')));

// API路由
app.use('/api/contacts', contactsRouter);

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Contact Management API'
    });
});

// 欢迎页面
app.get('/', (req, res) => {
    res.json({
        message: '欢迎使用通讯录管理系统API',
        version: '1.0.0',
        endpoints: {
            contacts: {
                GET_all: '/api/contacts',
                GET_one: '/api/contacts/:id',
                POST: '/api/contacts',
                PUT: '/api/contacts/:id',
                DELETE: '/api/contacts/:id',
                IMPORT: '/api/contacts/import'
            },
            health: '/health'
        },
        documentation: '请查看前端代码中的API调用示例'
    });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({
        error: 'API endpoint not found',
        path: req.url,
        method: req.method
    });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err.stack);
    res.status(500).json({
        error: '服务器内部错误',
        message: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`
    ====================================
    通讯录管理系统后端服务器
    ====================================
    状态: 运行中
    地址: http://localhost:${PORT}
    时间: ${new Date().toLocaleString()}
    
    API端点:
    - 获取所有联系人: GET /api/contacts
    - 创建联系人: POST /api/contacts
    - 更新联系人: PUT /api/contacts/:id
    - 删除联系人: DELETE /api/contacts/:id
    - 批量导入: POST /api/contacts/import
    - 健康检查: GET /health
    
    数据库: SQLite (data/contacts.db)
    ====================================
    `);
});

module.exports = app;