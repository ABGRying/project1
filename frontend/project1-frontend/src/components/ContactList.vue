<template>
  <div class="contact-list">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="searchText"
        placeholder="搜索联系人..."
        clearable
        style="width: 300px;"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      
      <el-button-group style="margin-left: 20px;">
        <el-button 
          :type="filterType === 'all' ? 'primary' : ''"
          @click="filterType = 'all'"
        >
          全部联系人
        </el-button>
        <el-button 
          :type="filterType === 'bookmarked' ? 'primary' : ''"
          @click="filterType = 'bookmarked'"
        >
          收藏联系人
        </el-button>
      </el-button-group>
      
      <el-button 
        type="primary" 
        @click="showAddDialog = true"
        style="margin-left: auto;"
      >
        <el-icon><Plus /></el-icon>
        添加联系人
      </el-button>
    </div>
    
    <!-- 联系人卡片列表 -->
    <div v-loading="loading" class="contacts-container">
      <el-empty v-if="filteredContacts.length === 0" description="暂无联系人" />
      
      <el-row :gutter="20">
        <el-col 
          v-for="contact in filteredContacts" 
          :key="contact.id"
          :xs="24" :sm="12" :md="8" :lg="6"
        >
          <el-card class="contact-card" shadow="hover">
            <template #header>
              <div class="card-header">
                <div class="contact-info">
                  <el-avatar :size="40" :src="contact.avatar">
                    {{ contact.name.charAt(0) }}
                  </el-avatar>
                  <span class="contact-name">{{ contact.name }}</span>
                </div>
                <el-button 
                  circle 
                  size="small"
                  :type="contact.is_bookmarked ? 'warning' : ''"
                  @click="toggleBookmark(contact)"
                >
                  <el-icon><Star /></el-icon>
                </el-button>
              </div>
            </template>
            
            <!-- 联系方式 -->
            <div class="contact-methods">
              <div 
                v-for="method in contact.methods" 
                :key="method.value"
                class="method-item"
              >
                <el-tag size="small" :type="getMethodType(method.type)">
                  {{ getMethodLabel(method.type) }}
                </el-tag>
                <span class="method-value">{{ method.value }}</span>
              </div>
            </div>
            
            <!-- 操作按钮 -->
            <template #footer>
              <el-button-group>
                <el-button type="danger" size="small" @click="deleteContact(contact.id)">
                  删除
                </el-button>
              </el-button-group>
            </template>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { 
  Search, Plus, Star, Delete 
} from '@element-plus/icons-vue'
import axios from 'axios'

const loading = ref(false)
const contacts = ref([])
const searchText = ref('')
const filterType = ref('all')
const showAddDialog = ref(false)

// 获取联系人列表
const fetchContacts = async () => {
  loading.value = true
  try {
    const response = await axios.get('http://localhost:3000/api/contacts')
    if (response.data.success) {
      contacts.value = response.data.data
    }
  } catch (error) {
    console.error('获取联系人失败:', error)
    ElMessage.error('获取联系人失败')
  } finally {
    loading.value = false
  }
}

// 切换收藏状态
const toggleBookmark = async (contact) => {
  try {
    const newStatus = !contact.is_bookmarked
    await axios.patch(`http://localhost:3000/api/contacts/${contact.id}/bookmark`, {
      is_bookmarked: newStatus
    })
    
    contact.is_bookmarked = newStatus
    ElMessage.success(newStatus ? '已添加到收藏' : '已取消收藏')
  } catch (error) {
    console.error('更新收藏状态失败:', error)
    ElMessage.error('操作失败')
  }
}

// 删除联系人
const deleteContact = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除此联系人吗？', '警告', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    
    await axios.delete(`http://localhost:3000/api/contacts/${id}`)
    contacts.value = contacts.value.filter(c => c.id !== id)
    ElMessage.success('删除成功')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 辅助函数
const getMethodLabel = (type) => {
  const labels = {
    phone: '电话',
    email: '邮箱',
    address: '地址',
    social: '社交',
    other: '其他'
  }
  return labels[type] || type
}

const getMethodType = (type) => {
  const types = {
    phone: 'success',
    email: 'warning',
    address: 'info',
    social: 'danger',
    other: ''
  }
  return types[type] || ''
}

// 计算属性：筛选联系人
const filteredContacts = computed(() => {
  let result = contacts.value
  
  // 按收藏筛选
  if (filterType.value === 'bookmarked') {
    result = result.filter(c => c.is_bookmarked)
  }
  
  // 按搜索词筛选
  if (searchText.value) {
    const keyword = searchText.value.toLowerCase()
    result = result.filter(c => 
      c.name.toLowerCase().includes(keyword) ||
      c.methods.some(m => 
        m.value.toLowerCase().includes(keyword) ||
        (m.label && m.label.toLowerCase().includes(keyword))
      )
    )
  }
  
  return result
})

// 组件挂载时加载数据
onMounted(() => {
  fetchContacts()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  padding: 20px;
  background: white;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.contacts-container {
  min-height: 400px;
  padding: 10px;
}

.contact-card {
  margin-bottom: 20px;
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.contact-info {
  display: flex;
  align-items: center;
}

.contact-name {
  margin-left: 10px;
  font-weight: bold;
  font-size: 16px;
}

.contact-methods {
  margin: 10px 0;
}

.method-item {
  display: flex;
  align-items: center;
  margin: 8px 0;
}

.method-value {
  margin-left: 10px;
  color: #666;
  font-size: 14px;
}
</style>