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
- `var(--radius-full)`: 9999px (胶囊按钮)

**阴影**
- `var(--shadow-sm)`: 轻微阴影
- `var(--shadow-md)`: 常规阴影 (悬停)
- `var(--shadow-lg)`: 浮层阴影

---

## 2. 组件规范 (Component Specs)

### 2.1 拟物化按钮 (Skeuomorphic Button)

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

### 2.2 列表卡片 (List Item Card)

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

### 2.3 图标规范 (Iconography)

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
