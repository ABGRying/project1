<template>
    <div>
        <h1 style="color: green;">✅ Vue加载成功！</h1>
        <p>如果看到这个，说明Vue工作正常</p>
        
        <button @click="count++" style="padding: 10px 20px; background: blue; color: white; border: none; border-radius: 5px; cursor: pointer;">
            点击测试: {{ count }}
        </button>
        <p>点击次数: {{ count }}</p>
        
        <div v-if="count > 0" style="color: green; padding: 10px; background: #f0f9eb; border-radius: 5px;">
            🎉 Vue响应式系统工作正常！
        </div>
        
        <div style="margin-top: 30px; padding: 20px; background: #f5f7fa; border-radius: 8px;">
            <h3>功能测试</h3>
            <button @click="testBackend" style="padding: 10px 20px; background: #67C23A; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 10px;">
                测试后端连接
            </button>
            <p v-if="backendMessage">{{ backendMessage }}</p>
        </div>
    </div>
</template>

<script setup>
import { ref } from "vue"

const count = ref(0)
const backendMessage = ref("")

const testBackend = async () => {
    try {
        const response = await fetch("http://localhost:3000/api/health")
        const data = await response.json()
        backendMessage.value = `✅ 后端正常: ${data.message}`
    } catch (error) {
        backendMessage.value = "❌ 后端连接失败"
    }
}

console.log("✅ App.vue组件加载成功")
</script>
