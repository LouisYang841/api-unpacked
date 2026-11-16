# 把 API 讲明白

面向只用过聊天客户端的新手的中文交互教学页面。介绍 API、HTTP 请求和大模型 API 请求，通过三关逐步练习：填写 UI 表单、拖拽卡片补全 JSON、直接编辑 JSON 骨架。

每关只需补三个关键空位。全部请求在浏览器内模拟，无需密钥，不会调用外部模型。

## 网站

https://louisyang841.github.io/api-unpacked/

## 部署

推送到 `main` 后，GitHub Actions 会先检查教学逻辑和 JavaScript 语法，再将 `dist/` 发布到 GitHub Pages。也可以在 Actions 中手动运行 `Deploy GitHub Pages`。

仓库 Settings → Pages 的发布来源须为 **GitHub Actions**。

## 本地检查

需要 Node.js，无需安装依赖：

```sh
node check.cjs
node --check dist/app.js
node --check dist/lesson.js
```

用任意静态服务器提供 `dist/`，或直接打开 `dist/index.html` 查看页面。在线字体加载失败时会回退到系统字体。

教学交互参考：https://louisyang841.github.io/na2o2-chemistry/peiping.html
