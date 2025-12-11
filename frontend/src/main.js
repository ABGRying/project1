import { createApp } from "vue"
import App from "./App.vue"

console.log("🚀 开始加载Vue应用...")

// 创建并挂载应用
const app = createApp(App)
app.mount("#app")

console.log("✅ Vue应用挂载成功")

// 全局错误处理
window.addEventListener("error", (event) => {
    console.error("全局错误:", event.error)
})
