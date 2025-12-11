const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 数据库文件路径
const dbPath = path.join(__dirname, 'data', 'contacts.db');
const dbDir = path.dirname(dbPath);

// 确保数据目录存在
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// 创建数据库连接
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('无法连接数据库:', err.message);
    } else {
        console.log('✅ 成功连接到SQLite数据库');
        // 设置数据库配置
        db.configure("busyTimeout", 5000);
        // 启用外键约束
        db.run("PRAGMA foreign_keys = ON", (err) => {
            if (err) console.error('启用外键约束失败:', err.message);
        });
        // 串行执行初始化
        initDatabase();
    }
});

// 初始化数据库表 - 使用串行执行确保表创建顺序
function initDatabase() {
    console.log('开始初始化数据库...');
    
    // 使用串行执行确保表按顺序创建
    db.serialize(() => {
        // 1. 创建联系人表
        db.run(`
            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                notes TEXT,
                bookmarked BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('❌ 创建contacts表失败:', err.message);
            } else {
                console.log('✅ contacts表已就绪');
            }
        });

        // 2. 创建联系方式表
        db.run(`
            CREATE TABLE IF NOT EXISTS contact_methods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id TEXT NOT NULL,
                type TEXT NOT NULL,
                value TEXT NOT NULL,
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) {
                console.error('❌ 创建contact_methods表失败:', err.message);
            } else {
                console.log('✅ contact_methods表已就绪');
            }
        });

        // 3. 创建索引以提高查询性能
        const indexes = [
            ['idx_contacts_name', 'CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name)'],
            ['idx_contacts_bookmarked', 'CREATE INDEX IF NOT EXISTS idx_contacts_bookmarked ON contacts(bookmarked)'],
            ['idx_methods_contact_id', 'CREATE INDEX IF NOT EXISTS idx_methods_contact_id ON contact_methods(contact_id)'],
            ['idx_methods_type', 'CREATE INDEX IF NOT EXISTS idx_methods_type ON contact_methods(type)']
        ];

        indexes.forEach(([name, sql]) => {
            db.run(sql, (err) => {
                if (err) {
                    console.error(`❌ 创建索引 ${name} 失败:`, err.message);
                } else {
                    console.log(`✅ 索引 ${name} 已就绪`);
                }
            });
        });

        // 4. 插入一些初始测试数据
        db.get('SELECT COUNT(*) as count FROM contacts', (err, row) => {
            if (err) {
                console.error('❌ 检查数据失败:', err.message);
                return;
            }
            
            if (row.count === 0) {
                console.log('插入初始测试数据...');
                insertInitialData();
            } else {
                console.log(`数据库中已有 ${row.count} 个联系人`);
            }
        });
    });
}

// 插入初始测试数据
function insertInitialData() {
    const initialContacts = [
        {
            id: 'test-001',
            name: '张三',
            notes: '公司同事',
            bookmarked: true
        },
        {
            id: 'test-002',
            name: '李四',
            notes: '大学同学',
            bookmarked: false
        },
        {
            id: 'test-003',
            name: '王五',
            notes: '合作伙伴',
            bookmarked: true
        }
    ];

    const initialMethods = [
        // 张三的联系方式
        { contact_id: 'test-001', type: '手机号码', value: '13800138000' },
        { contact_id: 'test-001', type: '邮箱地址', value: 'zhangsan@example.com' },
        // 李四的联系方式
        { contact_id: 'test-002', type: '手机号码', value: '13900139000' },
        { contact_id: 'test-002', type: '联系地址', value: '北京市朝阳区' },
        // 王五的联系方式
        { contact_id: 'test-003', type: '邮箱地址', value: 'wangwu@example.com' },
        { contact_id: 'test-003', type: '社交账号', value: 'wangwu_wechat' }
    ];

    // 使用事务插入数据
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // 插入联系人
        initialContacts.forEach(contact => {
            db.run(
                `INSERT OR IGNORE INTO contacts (id, name, notes, bookmarked) VALUES (?, ?, ?, ?)`,
                [contact.id, contact.name, contact.notes, contact.bookmarked ? 1 : 0]
            );
        });
        
        // 插入联系方式
        initialMethods.forEach(method => {
            db.run(
                `INSERT OR IGNORE INTO contact_methods (contact_id, type, value) VALUES (?, ?, ?)`,
                [method.contact_id, method.type, method.value]
            );
        });
        
        db.run('COMMIT', (err) => {
            if (err) {
                console.error('❌ 插入初始数据失败:', err.message);
                db.run('ROLLBACK');
            } else {
                console.log('✅ 初始测试数据插入成功');
            }
        });
    });
}

// 数据库操作封装
const dbHelper = {
    // 执行查询，返回所有结果
    all: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('SQL查询错误:', sql, err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    },

    // 执行查询，返回单行结果
    get: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('SQL查询错误:', sql, err.message);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    },

    // 执行更新操作（INSERT, UPDATE, DELETE）
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) {
                    console.error('SQL执行错误:', sql, err.message);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    },

    // 开启事务
    beginTransaction: () => {
        return new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    // 提交事务
    commit: () => {
        return new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    // 回滚事务
    rollback: () => {
        return new Promise((resolve, reject) => {
            db.run('ROLLBACK', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

// 测试数据库连接
db.get("SELECT sqlite_version() as version", (err, row) => {
    if (err) {
        console.error('❌ 获取SQLite版本失败:', err.message);
    } else {
        console.log(`📊 SQLite版本: ${row.version}`);
    }
});

module.exports = { db, dbHelper };