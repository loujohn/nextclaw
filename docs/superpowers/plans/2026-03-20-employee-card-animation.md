# 数字员工卡片动画实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将员工卡片顶部的渐变 banner 替换为带动画的办公工作场景。

**Architecture:** 纯 CSS 动画实现办公场景（桌面+显示器+人物剪影），使用 transform 和 opacity 保证性能。场景高度从 72px 调整为 100px，确保头像不被遮挡。

**Tech Stack:** Vue 3 + Tailwind CSS + 纯 CSS keyframes 动画

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/pages/employees/index.vue` | 修改 | 替换 banner 区域为办公场景 |

---

### Task 1: 添加 CSS 动画 keyframes

**Files:**
- Modify: `app/pages/employees/index.vue` (style 部分)

- [ ] **Step 1: 在 `<style scoped>` 中添加动画定义**

在现有 style 部分末尾添加以下 keyframes：

```css
/* === 员工卡片工作场景动画 === */

/* 人物浮动 */
@keyframes subtle-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

/* 头部晃动 */
@keyframes head-move {
  0%, 100% { transform: rotate(0deg); }
  30% { transform: rotate(2deg); }
  70% { transform: rotate(-2deg); }
}

/* 左手臂敲键盘 */
@keyframes arm-type-left {
  0%, 100% { transform: rotate(0deg); }
  30% { transform: rotate(-15deg); }
  60% { transform: rotate(-5deg); }
}

/* 右手臂敲键盘 */
@keyframes arm-type-right {
  0%, 100% { transform: rotate(0deg); }
  30% { transform: rotate(5deg); }
  60% { transform: rotate(15deg); }
}

/* 显示器光晕 */
@keyframes screen-glow {
  0%, 100% { box-shadow: 0 0 15px rgba(59, 130, 246, 0.15); }
  50% { box-shadow: 0 0 25px rgba(59, 130, 246, 0.25); }
}

/* 光标闪烁 */
@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 植物摇摆 */
@keyframes plant-sway {
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(2deg); }
}
```

- [ ] **Step 2: 提交**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/index.vue
git commit -m "feat: 添加员工卡片工作场景动画 keyframes"
```

---

### Task 2: 替换 Banner 区域为办公场景

**Files:**
- Modify: `app/pages/employees/index.vue:536-551` (template 部分)

- [ ] **Step 1: 替换 banner 区域模板**

找到以下代码块（约 536-551 行）：

```html
        <!-- ① 渐变 Banner —— 每位员工唯一色系 -->
        <div class="relative h-[72px] overflow-hidden" :style="getBannerStyle(emp.name)">
          <!-- 装饰圆圈 -->
          <div class="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 pointer-events-none" />
          <div class="absolute right-10 top-3 h-12 w-12 rounded-full bg-white/10 pointer-events-none" />
          <div class="absolute left-3 -bottom-5 h-16 w-16 rounded-full bg-black/8 pointer-events-none" />

          <!-- 健康状态徽章（右上） -->
          <span class="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/25 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white">
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="resolveHealth(emp).lastStatus === 'failed' ? 'bg-red-300 animate-pulse' : resolveHealth(emp).lastStatus === 'healthy' ? 'bg-green-300 animate-pulse' : 'bg-yellow-200'"
            />
            {{ resolveHealth(emp).label }}
          </span>
        </div>
```

替换为：

```html
        <!-- ① 办公工作场景 -->
        <div class="relative h-[100px] overflow-hidden bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300">
          <!-- 天花板灯带 -->
          <div class="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-transparent via-amber-100 to-transparent opacity-80" />

          <!-- 隔断墙 -->
          <div class="absolute top-0 left-0 w-[60px] h-full bg-gradient-to-r from-slate-200 to-slate-300" />
          <div class="absolute top-0 right-0 w-[60px] h-full bg-gradient-to-l from-slate-200 to-slate-300" />

          <!-- 植物装饰 -->
          <div class="absolute bottom-[45px] left-2 text-base opacity-90 origin-bottom animate-[plant-sway_4s_ease-in-out_infinite]">🪴</div>
          <div class="absolute bottom-[45px] right-2 text-sm opacity-80">🌿</div>

          <!-- 桌面 -->
          <div class="absolute bottom-0 left-0 right-0 h-[42px] bg-gradient-to-b from-gray-500 to-gray-600" />

          <!-- 显示器 -->
          <div class="absolute bottom-[28px] left-1/2 -translate-x-1/2 w-[80px] h-[52px] bg-slate-800 rounded border-2 border-slate-600 animate-[screen-glow_3s_infinite]">
            <!-- 屏幕内容 -->
            <div class="m-[5px] h-[calc(100%-10px)] bg-white rounded-sm overflow-hidden">
              <!-- 工具栏 -->
              <div class="h-[6px] bg-slate-100 flex gap-[2px] p-[2px] items-center">
                <div class="w-[2px] h-[2px] bg-red-500 rounded-full" />
                <div class="w-[2px] h-[2px] bg-yellow-500 rounded-full" />
                <div class="w-[2px] h-[2px] bg-green-500 rounded-full" />
              </div>
              <!-- 文档 -->
              <div class="p-[4px]">
                <div class="h-[2px] bg-blue-500 rounded-[1px] w-[50%]" />
                <div class="h-[2px] bg-slate-200 rounded-[1px] w-[80%] mt-[3px]" />
                <div class="h-[2px] bg-slate-200 rounded-[1px] w-[70%] mt-[2px]" />
                <div class="inline-block w-[2px] h-[3px] bg-blue-500 mt-[2px] animate-[cursor-blink_1s_infinite]" />
              </div>
            </div>
            <!-- 底座 -->
            <div class="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-[14px] h-[6px] bg-slate-600" />
            <div class="absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-[35px] h-[2px] bg-slate-600 rounded-[1px]" />
          </div>

          <!-- 人物剪影 -->
          <div class="absolute bottom-[42px] left-1/2 -translate-x-1/2 animate-[subtle-float_3s_ease-in-out_infinite]">
            <!-- 头部 -->
            <div class="relative w-[20px] h-[22px] bg-[#fcd9b6] rounded-[50%_50%_45%_45%] mx-auto animate-[head-move_4s_ease-in-out_infinite]">
              <!-- 头发 -->
              <div class="absolute -top-[2px] -left-[1px] -right-[1px] h-[10px] bg-[#4a3728] rounded-[10px_10px_0_0]" />
            </div>
            <!-- 身体 -->
            <div class="w-[32px] h-[20px] bg-blue-500 rounded-t-[6px] -mt-[3px] relative">
              <!-- 衣领 -->
              <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[8px] h-[4px] bg-blue-400 rounded-b-[4px]" />
              <!-- 左手臂 -->
              <div class="absolute -left-[4px] bottom-0 w-[7px] h-[16px] bg-[#fcd9b6] rounded-[3px] origin-top animate-[arm-type-left_0.6s_ease-in-out_infinite]" />
              <!-- 右手臂 -->
              <div class="absolute -right-[4px] bottom-0 w-[7px] h-[16px] bg-[#fcd9b6] rounded-[3px] origin-top animate-[arm-type-right_0.6s_ease-in-out_infinite_0.3s]" />
            </div>
          </div>

          <!-- 键盘 -->
          <div class="absolute bottom-[42px] left-1/2 -translate-x-1/2 w-[50px] h-[7px] bg-slate-600 rounded-[2px]" />

          <!-- 健康状态徽章 -->
          <span class="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[9px] text-slate-700">
            <span
              class="h-[5px] w-[5px] rounded-full"
              :class="resolveHealth(emp).lastStatus === 'failed' ? 'bg-red-500' : resolveHealth(emp).lastStatus === 'healthy' ? 'bg-green-500' : 'bg-yellow-500'"
            />
            {{ resolveHealth(emp).label }}
          </span>
        </div>
```

- [ ] **Step 2: 调整头像区域的 margin**

找到头像区域（约 554 行）：

```html
        <!-- ② 头像（从 banner 露出） + 模型标签 -->
        <div class="-mt-6 flex items-end justify-between px-4">
```

将 `-mt-6` 调整为 `-mt-5`：

```html
        <!-- ② 头像（从 banner 露出） + 模型标签 -->
        <div class="-mt-5 flex items-end justify-between px-4">
```

- [ ] **Step 3: 本地启动验证效果**

```bash
cd packages/nextclaw-digital-employee && npm run dev
```

访问 http://localhost:3000/employees 确认：
- [ ] 办公场景正确渲染
- [ ] 人物有颜色（肤色 + 蓝衬衫）
- [ ] 手臂打字动画运行
- [ ] 显示器光晕动画运行
- [ ] 光标闪烁动画运行
- [ ] 植物摇摆动画运行
- [ ] 头像完全可见，不被遮挡

- [ ] **Step 4: 提交**

```bash
git add packages/nextclaw-digital-employee/app/pages/employees/index.vue
git commit -m "feat: 员工卡片替换为办公工作场景动画

- 将渐变 banner 替换为办公场景（桌面+显示器+人物）
- 人物着色：肤色头部 + 棕色头发 + 蓝色衬衫
- 添加打字动画、显示器光晕、光标闪烁、植物摇摆
- 场景高度 100px，确保头像不被遮挡"
```

---

### Task 3: 验收测试

**Files:**
- None (手动验证)

- [ ] **Step 1: 桌面端验证**

访问员工列表页面，确认：
- [ ] 卡片布局正常，场景高度 100px
- [ ] 办公场景背景渲染正确（灰白渐变 + 隔断墙 + 植物）
- [ ] 显示器显示文档界面（工具栏 + 文档内容）
- [ ] 人物着色正确（肤色 + 棕发 + 蓝衬衫）
- [ ] 所有动画流畅运行
- [ ] 头像完全露出，不被场景遮挡
- [ ] 卡片 hover 效果正常
- [ ] 点击"进入工作台"正常跳转

- [ ] **Step 2: 移动端验证**

调整浏览器窗口为移动端尺寸，确认：
- [ ] 卡片在小屏幕下正常显示
- [ ] 场景不会溢出或变形
- [ ] 头像仍然可见

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: 完成员工卡片办公场景动画实现"
```

---

## 验收标准

- [ ] 办公场景正确渲染
- [ ] 人物有颜色（肤色 + 衬衫）
- [ ] 所有动画流畅运行
- [ ] 头像完全可见，不被遮挡
- [ ] 不影响卡片其他功能（点击、编辑等）
- [ ] 移动端显示正常