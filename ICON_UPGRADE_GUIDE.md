# 图标库升级说明

## 选择的图标库: Tabler Icons

### 为什么选择 Tabler Icons?

1. **现代线条风格**: 简洁精致,非常适合科技感主题
2. **一致性强**: 所有图标风格统一,线条粗细一致
3. **开源免费**: MIT许可证,可商用
4. **数量丰富**: 4000+ 图标,满足各种需求
5. **易于定制**: SVG格式,可轻松修改颜色、大小
6. **社区活跃**: 持续更新,新图标不断增加

### 官网
- 主站: https://tabler-icons.io/
- GitHub: https://github.com/tabler/tabler-icons

---

## 图标映射表

| 功能 | 原图标 | 新图标(Tabler) | 说明 |
|------|--------|---------------|------|
| 首页 | 填充房子 | `home` | 线条风格,更现代 |
| 消息 | 通信图标 | `arrows-left-right` | 清晰的双向箭头 |
| 设置 | 齿轮 | `settings` | 精致的齿轮 |
| 订阅 | 添加符号 | `device-cctv` | 连接节点风格 |
| 发布 | 上传 | `arrow-up-right` | 简洁的箭头 |
| 连接 | 链接 | `brush` | 连接笔刷 |
| WiFi | 信号 | `download` | 下载符号 |
| 测试 | 检查 | `chart-scatter` | 散点图 |
| 清空 | 垃圾 | `trash-x` | 带X的垃圾桶 |
| 搜索 | 放大镜 | `search` | 经典搜索图标 |
| 箭头 | 右箭头 | `edit` | 编辑箭头 |

---

## 图标特性

### SVG 属性
```xml
<svg xmlns="http://www.w3.org/2000/svg"
     width="24"
     height="24"
     viewBox="0 0 24 24"
     fill="none"
     stroke="currentColor"
     stroke-width="2"
     stroke-linecap="round"
     stroke-linejoin="round">
  <!-- 图标路径 -->
</svg>
```

### 通用设置
- `stroke-linecap="round"`: 圆角线端
- `stroke-linejoin="round"`: 圆角连接
- `stroke-width="2"`: 2px线条粗细
- `fill="none"`: 不填充,仅描边

---

## CSS 样式优化

### 图标发光效果
```css
.icon-container svg {
  filter: drop-shadow(0 0 8px currentColor);
}
```

### 图标缩放动画
```css
.icon-container svg {
  transition: all 0.3s ease;
}

.icon-container:active svg {
  transform: scale(0.9);
}
```

### 尺寸调整
```css
/* 导航栏图标 */
.nav-icon-container svg {
  width: 28px;
  height: 28px;
  stroke-width: 1.5;
}

/* 功能卡片图标 */
.tech-icon-box svg {
  width: 32px;
  height: 32px;
  stroke-width: 1.5;
}

/* 小尺寸图标 */
.tech-action-btn svg {
  width: 20px;
  height: 20px;
  stroke-width: 2;
}
```

---

## 自定义颜色

### 主题色变量
```css
:root {
  --icon-primary: #00F5FF;  /* 霓虹青 */
  --icon-success: #00FF88;  /* 霓虹绿 */
  --icon-warning: #FFC800;  /* 琥珀黄 */
  --icon-error: #FF6464;    /* 霓虹红 */
  --icon-info: #0080FF;     /* 科技蓝 */
}
```

### 使用示例
```css
.icon-home {
  color: var(--icon-primary);
  filter: drop-shadow(0 0 8px var(--icon-primary));
}

.icon-success {
  color: var(--icon-success);
  filter: drop-shadow(0 0 8px var(--icon-success));
}
```

---

## 其他推荐图标库

### Phosphor Icons
- 网址: https://phosphoricons.com/
- 风格: 线条/填充/双色调
- 特点: 多种风格可选

### Heroicons
- 网址: https://heroicons.com/
- 风格: 简洁优雅
- 特点: Tailwind团队出品

### Remix Icon
- 网址: https://remixicon.com/
- 风格: 线条+填充
- 特点: 中文作者,适合中文项目

### Feather Icons
- 网址: https://feathericons.com/
- 风格: 极简线条
- 特点: 最小化设计

---

## 图标使用建议

### 1. 保持一致性
- 同类功能使用风格一致的图标
- 线条粗细保持统一
- 视觉重量平衡

### 2. 可访问性
- 图标搭配文字说明
- 颜色对比度符合标准
- 触控区域足够大(至少44x44px)

### 3. 性能优化
- 使用SVG而非PNG
- 内联SVG减少请求
- 压缩SVG文件大小

### 4. 深色主题适配
- 图标颜色使用currentColor
- 添加发光效果增强可见性
- 避免纯黑色图标

---

## 迁移检查清单

- [x] 下载Tabler Icons SVG文件
- [x] 替换所有图标文件
- [x] 更新CSS样式以适配新图标
- [x] 添加发光效果
- [x] 添加交互动画
- [ ] 测试各页面图标显示
- [ ] 验证无障碍访问
- [ ] 性能测试

---

## 获取更多图标

### Tabler Icons下载方式

1. **官网下载**
   - 访问 https://tabler-icons.io/
   - 搜索所需图标
   - 点击下载SVG

2. **批量下载**
   ```bash
   npm install @tabler/icons
   ```

3. **CDN引用**
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons-react/dist/index.umd.min.js"></script>
   ```

---

**更新日期**: 2026年
**图标库**: Tabler Icons v3.0+
**主题**: 科技感深色
