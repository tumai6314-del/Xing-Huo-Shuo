// src/server.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const rolesRouter = require('./api/roles');

const app = express();

// CORS 必须在路由之前挂载
app.use(cors());

// 中间件
app.use(bodyParser.json()); // 解析 JSON 请求体

// API 路由
app.use('/api/roles', rolesRouter);

// 启动服务器（注意：这是独立于 Next.js 的辅助 API 服务，仅用于角色 JSON 存取）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
