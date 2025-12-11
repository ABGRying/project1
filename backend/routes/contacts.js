const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const { dbHelper } = require('../database');

// 获取所有联系人
router.get('/', async (req, res) => {
    try {
        console.log('获取所有联系人请求');
        
        // 分页参数
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const offset = (page - 1) * limit;
        
        // 搜索参数
        const search = req.query.search || '';
        
        let sql = `
            SELECT c.*, 
                   GROUP_CONCAT(m.type || ':' || m.value, ';;') as methods_string
            FROM contacts c
            LEFT JOIN contact_methods m ON c.id = m.contact_id
        `;
        
        let params = [];
        let whereClauses = [];
        
        // 搜索条件
        if (search) {
            whereClauses.push(`
                (c.name LIKE ? OR c.notes LIKE ? OR 
                 EXISTS (SELECT 1 FROM contact_methods m2 
                         WHERE m2.contact_id = c.id AND m2.value LIKE ?))
            `);
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        
        // 收藏过滤
        if (req.query.bookmarked === 'true') {
            whereClauses.push('c.bookmarked = 1');
        }
        
        if (whereClauses.length > 0) {
            sql += ' WHERE ' + whereClauses.join(' AND ');
        }
        
        sql += ' GROUP BY c.id ORDER BY c.updated_at DESC';
        
        // 如果有限制，添加分页
        if (limit !== -1) {
            sql += ' LIMIT ? OFFSET ?';
            params.push(limit, offset);
        }
        
        const rows = await dbHelper.all(sql, params);
        
        // 处理结果，将方法字符串转换为对象数组
        const contacts = rows.map(row => {
            const contact = {
                id: row.id,
                name: row.name,
                notes: row.notes,
                bookmarked: Boolean(row.bookmarked),
                created_at: row.created_at,
                updated_at: row.updated_at,
                methods: []
            };
            
            if (row.methods_string) {
                const methodPairs = row.methods_string.split(';;');
                methodPairs.forEach(pair => {
                    const [type, value] = pair.split(':');
                    if (type && value) {
                        contact.methods.push({ type, value });
                    }
                });
            }
            
            return contact;
        });
        
        // 获取总数用于分页
        let countSql = 'SELECT COUNT(*) as total FROM contacts c';
        let countParams = [];
        
        if (whereClauses.length > 0) {
            countSql += ' WHERE ' + whereClauses.join(' AND ');
            countParams = params.slice(0, whereClauses.length * 3);
        }
        
        const countResult = await dbHelper.get(countSql, countParams);
        const total = countResult.total;
        
        res.json({
            success: true,
            data: contacts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('获取联系人失败:', error);
        res.status(500).json({
            success: false,
            error: '获取联系人失败',
            message: error.message
        });
    }
});

// 获取单个联系人
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 获取联系人基本信息
        const contact = await dbHelper.get(
            'SELECT * FROM contacts WHERE id = ?',
            [id]
        );
        
        if (!contact) {
            return res.status(404).json({
                success: false,
                error: '联系人不存在'
            });
        }
        
        // 获取联系方式
        const methods = await dbHelper.all(
            'SELECT type, value FROM contact_methods WHERE contact_id = ? ORDER BY type',
            [id]
        );
        
        const result = {
            id: contact.id,
            name: contact.name,
            notes: contact.notes,
            bookmarked: Boolean(contact.bookmarked),
            created_at: contact.created_at,
            updated_at: contact.updated_at,
            methods: methods
        };
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (error) {
        console.error('获取联系人失败:', error);
        res.status(500).json({
            success: false,
            error: '获取联系人失败',
            message: error.message
        });
    }
});

// 创建联系人
router.post('/', async (req, res) => {
    try {
        console.log('创建联系人请求:', req.body);
        
        const { name, notes, bookmarked, methods = [] } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                error: '姓名不能为空'
            });
        }
        
        const id = uuidv4();
        const now = new Date().toISOString();
        
        // 开始事务
        await dbHelper.run('BEGIN TRANSACTION');
        
        try {
            // 插入联系人基本信息
            await dbHelper.run(
                `INSERT INTO contacts (id, name, notes, bookmarked, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id, name, notes || '', bookmarked ? 1 : 0, now, now]
            );
            
            // 插入联系方式
            for (const method of methods) {
                if (method.type && method.value) {
                    await dbHelper.run(
                        'INSERT INTO contact_methods (contact_id, type, value) VALUES (?, ?, ?)',
                        [id, method.type, method.value]
                    );
                }
            }
            
            await dbHelper.run('COMMIT');
            
            console.log(`✅ 联系人创建成功: ${name} (ID: ${id})`);
            
            res.status(201).json({
                success: true,
                message: '联系人创建成功',
                data: { id, name }
            });
            
        } catch (error) {
            await dbHelper.run('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('创建联系人失败:', error);
        res.status(500).json({
            success: false,
            error: '创建联系人失败',
            message: error.message
        });
    }
});

// 更新联系人
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, notes, bookmarked, methods = [] } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                error: '姓名不能为空'
            });
        }
        
        // 检查联系人是否存在
        const existing = await dbHelper.get(
            'SELECT id FROM contacts WHERE id = ?',
            [id]
        );
        
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: '联系人不存在'
            });
        }
        
        const now = new Date().toISOString();
        
        // 开始事务
        await dbHelper.run('BEGIN TRANSACTION');
        
        try {
            // 更新联系人基本信息
            await dbHelper.run(
                `UPDATE contacts 
                 SET name = ?, notes = ?, bookmarked = ?, updated_at = ?
                 WHERE id = ?`,
                [name, notes || '', bookmarked ? 1 : 0, now, id]
            );
            
            // 删除旧的联系方式
            await dbHelper.run(
                'DELETE FROM contact_methods WHERE contact_id = ?',
                [id]
            );
            
            // 插入新的联系方式
            for (const method of methods) {
                if (method.type && method.value) {
                    await dbHelper.run(
                        'INSERT INTO contact_methods (contact_id, type, value) VALUES (?, ?, ?)',
                        [id, method.type, method.value]
                    );
                }
            }
            
            await dbHelper.run('COMMIT');
            
            console.log(`✅ 联系人更新成功: ${name} (ID: ${id})`);
            
            res.json({
                success: true,
                message: '联系人更新成功',
                data: { id, name }
            });
            
        } catch (error) {
            await dbHelper.run('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('更新联系人失败:', error);
        res.status(500).json({
            success: false,
            error: '更新联系人失败',
            message: error.message
        });
    }
});

// 删除联系人
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 检查联系人是否存在
        const existing = await dbHelper.get(
            'SELECT name FROM contacts WHERE id = ?',
            [id]
        );
        
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: '联系人不存在'
            });
        }
        
        // 开始事务
        await dbHelper.run('BEGIN TRANSACTION');
        
        try {
            // 删除联系方式（外键约束会自动删除）
            await dbHelper.run(
                'DELETE FROM contact_methods WHERE contact_id = ?',
                [id]
            );
            
            // 删除联系人
            await dbHelper.run(
                'DELETE FROM contacts WHERE id = ?',
                [id]
            );
            
            await dbHelper.run('COMMIT');
            
            console.log(`🗑️ 联系人删除成功: ${existing.name} (ID: ${id})`);
            
            res.json({
                success: true,
                message: '联系人删除成功'
            });
            
        } catch (error) {
            await dbHelper.run('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('删除联系人失败:', error);
        res.status(500).json({
            success: false,
            error: '删除联系人失败',
            message: error.message
        });
    }
});

// 批量导入联系人
router.post('/import', async (req, res) => {
    try {
        console.log('批量导入联系人请求');
        
        const { contacts: contactsToImport } = req.body;
        
        if (!Array.isArray(contactsToImport) || contactsToImport.length === 0) {
            return res.status(400).json({
                success: false,
                error: '联系人数据不能为空'
            });
        }
        
        let successCount = 0;
        let failCount = 0;
        const errors = [];
        
        // 开始事务
        await dbHelper.run('BEGIN TRANSACTION');
        
        try {
            for (let i = 0; i < contactsToImport.length; i++) {
                const contact = contactsToImport[i];
                
                if (!contact.name) {
                    errors.push(`第 ${i + 1} 行: 姓名不能为空`);
                    failCount++;
                    continue;
                }
                
                const id = uuidv4();
                const now = new Date().toISOString();
                
                try {
                    // 插入联系人基本信息
                    await dbHelper.run(
                        `INSERT INTO contacts (id, name, notes, bookmarked, created_at, updated_at) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [id, contact.name, contact.notes || '', 
                         contact.bookmarked ? 1 : 0, now, now]
                    );
                    
                    // 插入联系方式
                    if (contact.methods && Array.isArray(contact.methods)) {
                        for (const method of contact.methods) {
                            if (method.type && method.value) {
                                await dbHelper.run(
                                    'INSERT INTO contact_methods (contact_id, type, value) VALUES (?, ?, ?)',
                                    [id, method.type, method.value]
                                );
                            }
                        }
                    }
                    
                    successCount++;
                    
                } catch (error) {
                    errors.push(`第 ${i + 1} 行 "${contact.name}": ${error.message}`);
                    failCount++;
                }
            }
            
            await dbHelper.run('COMMIT');
            
            console.log(`✅ 批量导入完成: 成功 ${successCount}, 失败 ${failCount}`);
            
            res.json({
                success: true,
                message: '批量导入完成',
                data: {
                    total: contactsToImport.length,
                    success: successCount,
                    failed: failCount,
                    errors: errors.length > 0 ? errors.slice(0, 10) : [] // 最多返回10个错误
                }
            });
            
        } catch (error) {
            await dbHelper.run('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('批量导入失败:', error);
        res.status(500).json({
            success: false,
            error: '批量导入失败',
            message: error.message
        });
    }
});

// Excel文件导入（使用multer处理文件上传）
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.post('/import/excel', upload.single('file'), async (req, res) => {
    try {
        console.log('Excel文件导入请求');
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: '请上传文件'
            });
        }
        
        // 读取Excel文件
        const workbook = XLSX.readFile(req.file.path);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (!jsonData || jsonData.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Excel文件中没有数据'
            });
        }
        
        console.log(`从Excel读取到 ${jsonData.length} 行数据`);
        
        // 转换数据格式
        const contactsToImport = jsonData.map((row, index) => {
            const contact = {
                name: row['姓名'] || '',
                notes: row['备注'] || '',
                bookmarked: row['是否收藏'] === '是' || row['是否收藏'] === true,
                methods: []
            };
            
            // 检查姓名
            if (!contact.name) {
                throw new Error(`第 ${index + 2} 行: 姓名不能为空`);
            }
            
            // 添加联系方式
            const methodTypes = ['手机号码', '邮箱地址', '联系地址', '社交账号'];
            methodTypes.forEach(type => {
                if (row[type]) {
                    const values = String(row[type]).split(/[;,，]/).map(v => v.trim()).filter(v => v);
                    values.forEach(value => {
                        contact.methods.push({ type, value });
                    });
                }
            });
            
            return contact;
        });
        
        // 开始事务导入数据
        await dbHelper.run('BEGIN TRANSACTION');
        
        try {
            let successCount = 0;
            
            for (const contact of contactsToImport) {
                const id = uuidv4();
                const now = new Date().toISOString();
                
                // 插入联系人基本信息
                await dbHelper.run(
                    `INSERT INTO contacts (id, name, notes, bookmarked, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [id, contact.name, contact.notes || '', 
                     contact.bookmarked ? 1 : 0, now, now]
                );
                
                // 插入联系方式
                for (const method of contact.methods) {
                    await dbHelper.run(
                        'INSERT INTO contact_methods (contact_id, type, value) VALUES (?, ?, ?)',
                        [id, method.type, method.value]
                    );
                }
                
                successCount++;
            }
            
            await dbHelper.run('COMMIT');
            
            // 清理上传的文件
            const fs = require('fs');
            fs.unlinkSync(req.file.path);
            
            console.log(`✅ Excel导入完成: 成功导入 ${successCount} 个联系人`);
            
            res.json({
                success: true,
                message: 'Excel文件导入成功',
                data: {
                    total: contactsToImport.length,
                    success: successCount
                }
            });
            
        } catch (error) {
            await dbHelper.run('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('Excel导入失败:', error);
        res.status(500).json({
            success: false,
            error: 'Excel导入失败',
            message: error.message
        });
    }
});

module.exports = router;