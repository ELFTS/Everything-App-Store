# 万物应用商店样式规范指南 (Style Guide)

本文档定义了万物应用商店的UI设计系统和样式开发规范。

## 1. 设计系统 (Design System)

### 1.1 颜色系统 (Color System)

我们使用CSS变量定义颜色，支持亮色/暗色模式自动切换。

**主色调 (Primary)**
- `var(--color-primary)`: #22c55e (绿色) - 用于主要操作、激活状态
- `var(--color-primary-soft)`: #4ade80 - 浅色变体
- `var(--color-primary-dark)`: #15803d - 深色变体

**功能色 (Functional)**
- `var(--color-status-success)`: #22c55e - 成功
- `var(--color-status-warning)`: #f59e0b - 警告
- `var(--color-status-error)`: #ef4444 - 错误/危险
- `var(--color-status-info)`: #3b82f6 - 信息

**背景与边框 (Background & Border)**
- `var(--color-bg-panel)`: 面板背景 (侧边栏、标题栏)
- `var(--color-bg-card)`: 卡片背景 (列表项、弹窗)
- `var(--color-border-subtle)`: 细微边框
- `var(--color-border-hover)`: 悬停边框

**文字颜色 (Typography Colors)**
- `var(--color-text-main)`: 主要文字 (#555860 / Dark: #f9fafb)
- `var(--color-text-muted)`: 次要文字
- `var(--color-text-light)`: 辅助文字

**特色渐变 (Featured Gradient)**
- 三色垂直渐变: `linear-gradient(to bottom, #A0D605 0%, #19A754 50%, #A0D605 100%)`
- 应用场景: 标题栏、侧边栏、开关控件等主要UI元素
- 用于创造统一的视觉识别和现代感

### 1.2 间距系统 (Spacing System)

采用 **8pt 网格系统**。

- `var(--spacing-xs)`: 4px (0.5x)
- `var(--spacing-sm)`: 8px (1x)
- `var(--spacing-md)`: 16px (2x)
- `var(--spacing-lg)`: 24px (3x)
- `var(--spacing-xl)`: 32px (4x)
- `var(--spacing-xxl)`: 48px (6x)

### 1.3 圆角与阴影 (Radius & Shadows)

**圆角**
- `var(--radius-sm)`: 4px (小组件)
- `var(--radius-md)`: 8px (卡片、按钮)
- `var(--radius-lg)`: 12px (弹窗)
- `var(--radius-full)`: 9999px (胶囊按钮、搜索框)

**阴影**
- `var(--shadow-sm)`: 轻微阴影
- `var(--shadow-md)`: 常规阴影 (悬停)
- `var(--shadow-lg)`: 浮层阴影
- `var(--btn-shadow)`: 拟物化按钮阴影
- `var(--btn-shadow-active)`: 拟物化按钮按压阴影

---

## 2. 组件规范 (Component Specs)

### 2.1 标题栏 (Title Bar)

**设计特色**:
- 采用三色垂直渐变背景
- 高度固定为 `var(--title-bar-height)` (50px)
- 左侧Logo和标题，中间搜索框，右侧功能按钮
- 支持窗口拖拽功能 (`-webkit-app-region: drag`)

**结构**:
```html
<div class="title-bar">
  <div class="title-bar-left">...</div>
  <div class="title-bar-center">...</div>
  <div class="title-bar-right">...</div>
</div>
```

### 2.2 搜索框 (Search Box)

**设计特色**:
- 胶囊形状 (`var(--radius-full)`)
- 紧凑的尺寸和内边距
- 内置搜索图标和清除按钮
- 悬停和聚焦状态的平滑过渡动画
- 支持热门软件弹窗

**结构**:
```html
<div class="title-bar-search">
  <div class="search-wrapper">
    <div class="search-icon">...</div>
    <input type="text" class="search-input" placeholder="搜索应用、游戏和工具...">
    <button class="clear-btn" type="button" title="清除">...</button>
  </div>
  <div class="hot-apps-container">...</div>
</div>
```

**交互规范**:
- 聚焦时显示热门软件弹窗
- 输入时自动显示清除按钮
- 点击清除按钮清空输入并重新聚焦
- 支持回车搜索

### 2.3 热门软件弹窗 (Hot Apps Popup)

**设计特色**:
- 2列网格布局
- 卡片式热门应用项
- 悬停时的流光动画效果
- 平滑的显示/隐藏过渡

**结构**:
```html
<div class="hot-apps-container">
  <div class="hot-apps-title">热门搜索</div>
  <div class="hot-apps-list">
    <div class="hot-app-item">微信</div>
    <div class="hot-app-item">QQ</div>
    <!-- 更多热门应用 -->
  </div>
</div>
```

### 2.4 侧边栏 (Sidebar)

**设计特色**:
- 采用三色垂直渐变背景
- 固定宽度 (220px)
- 分组式菜单结构
- 高亮的激活状态

**结构**:
```html
<div class="sidebar">
  <div class="sidebar-menu-group">
    <div class="sidebar-menu-title">应用商店</div>
    <div class="sidebar-menu-item active" data-page="home-page">首页推荐</div>
    <!-- 更多菜单项 -->
  </div>
  <!-- 更多菜单组 -->
</div>
```

### 2.5 拟物化按钮 (Skeuomorphic Button)

所有功能按钮应继承 `%btn-skeuomorphic` 或使用相关类名。

**特征**:
- 渐变背景 (`--btn-gradient-default`)
- 细微边框
- 柔和阴影 (`--btn-shadow`)
- 按压效果 (Active state: 内阴影)

**使用方式 (SCSS)**:
```scss
.my-button {
  @extend %btn-skeuomorphic;
}
```

**使用方式 (HTML)**:
```html
<button class="btn-skeuomorphic">点击我</button>
```

### 2.6 开关控件 (Toggle Switch)

**设计特色**:
- 圆角矩形设计
- 选中状态使用三色垂直渐变
- 平滑的滑块过渡动画
- 清晰的焦点状态

**结构**:
```html
<label class="switch">
  <input type="checkbox">
  <span class="switch-slider"></span>
</label>
```

### 2.7 列表卡片 (List Item Card)

所有列表项（软件列表、下载列表）应继承 `%list-item-card`。

**特征**:
- 卡片背景
- 8px 圆角
- 16px 内边距
- 悬停浮起效果

**结构**:
```html
<div class="software-item"> <!-- 自动应用样式 -->
  <div class="software-info">...</div>
  <div class="software-actions">...</div>
</div>
```

### 2.8 图标规范 (Iconography)

**基本原则**:
- **格式**: 统一使用内联SVG (`<svg>`) 以实现最佳的清晰度和控制力。
- **基本尺寸**: 图标的基础渲染尺寸为 `16px` x `16px`。
- **视图框 (ViewBox)**: 推荐所有图标使用 `viewBox="0 0 24 24"`，这为描边和细节提供了足够的设计空间。
- **颜色**: 必须使用 `stroke="currentColor"` 或 `fill="currentColor"`，确保颜色可以从父元素继承，从而自动适应主题（如 `color: var(--color-text-main)`）。
- **描边**: 默认描边宽度为 `stroke-width="2"`，端点为 `stroke-linecap="round"`。

**实现**:
- **通用图标**: 应用 `.icon` 类。
  ```html
  <svg class="icon" viewBox="0 0 24 24" ...>
    <!-- paths -->
  </svg>
  ```
- **窗口控制按钮**:
  - 容器使用 `.window-control-btn` 类。
  - 尺寸为 `32px` x `32px`，为点击提供足够的热区。
  - SVG图标尺寸依然为 `16px`。
  - 交互效果:
    - `hover`: 背景变色
    - `active`: `transform: scale(0.9)` 提供按压反馈
    - `disabled`: `opacity: 0.5` 和 `cursor: not-allowed`
  ```html
  <div class="window-control-btn" id="min-btn">
    <svg class="icon" ...></svg>
  </div>
  ```

---

## 3. 开发指南 (Development Guide)

### 3.1 预处理器 (Sass)

本项目使用 SCSS 作为 CSS 预处理器。

- 源文件: `style.scss`
- 编译后: `style.css`

**编译命令**:
```bash
npm run build:scss  # 单次编译
npm run watch:scss  # 监听模式
```

### 3.2 代码规范 (Linting)

本项目使用 **Stylelint** 进行样式检查。

**检查命令**:
```bash
npm run lint:css
```

**配置**:
- 遵循 `stylelint-config-standard`
- 允许自定义 CSS 变量命名
- 允许传统的颜色函数写法

### 3.3 深色模式 (Dark Mode)

深色模式通过 `:root.theme-dark` 类实现。
所有颜色变量在 `.theme-dark` 下都有对应的覆盖值。
**注意**: 严禁在组件内部硬编码颜色值，必须使用 `var(--color-...)` 变量。

### 3.4 动画与过渡 (Animations & Transitions)

**通用原则**:
- 所有交互元素应有平滑的过渡效果
- 推荐使用 `cubic-bezier(0.4, 0, 0.2, 1)` 缓动函数
- 过渡时间一般为 0.2-0.3 秒
- 避免过度使用复杂动画

**常用动画**:
- `fadeIn`: 淡入效果
- `fadeInUp`: 从下往上淡入效果

### 3.5 响应式设计 (Responsive Design)

**设计原则**:
- 采用弹性布局和网格系统
- 确保在不同屏幕尺寸下的可用性
- 优先考虑桌面端体验，同时支持平板设备

**实现方式**:
- 使用CSS Grid和Flexbox进行布局
- 媒体查询断点: 768px (平板), 1024px (桌面)

---

## 4. 版本控制 (Version Control)

- 样式文件的修改应遵循语义化版本控制
- 重大样式变更应在更新日志中记录
- 推荐使用分支开发和Pull Request进行样式修改

## 5. 最佳实践 (Best Practices)

1. **保持一致性**: 遵循本规范，确保所有组件风格统一
2. **优先使用变量**: 所有颜色、间距、圆角等应使用CSS变量
3. **组件化设计**: 将UI拆分为可复用的组件
4. **性能优化**: 避免过度使用复杂动画和渐变
5. **可访问性**: 确保所有交互元素有清晰的状态反馈
6. **代码可读性**: 保持SCSS代码的清晰结构和注释
7. **测试覆盖**: 确保在不同主题和尺寸下测试样式

---

**最后更新**: 2026-01-19
