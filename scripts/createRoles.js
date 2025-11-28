// createRoles.js
/* eslint-disable unicorn/prefer-top-level-await */

const axios = require('axios');

async function createRoles() {
  const roles = [
    {
      description: 'A friendly AI assistant',
      name: '张三',
      personality: { trait: 'helpful' },
      role_id: 1,
    },
    {
      description: 'A customer support bot',
      name: '李四',
      personality: { trait: 'polite' },
      role_id: 2,
    },
    {
      description: 'An assistant for data analysis',
      name: '王五',
      personality: { trait: 'analytical' },
      role_id: 3,
    },
    {
      description: 'A creative content assistant',
      name: '刘六',
      personality: { trait: 'creative' },
      role_id: 4,
    },
    {
      description: 'A financial advisor assistant',
      name: '陈七',
      personality: { trait: 'professional' },
      role_id: 5,
    },
  ];

  // 循环创建角色
  for (const role of roles) {
    try {
      const response = await axios.post('http://localhost:3000/api/roles/create', role);
      console.log(`角色创建成功: ${response.data.name}`);
    } catch (error) {
      console.error(`创建角色失败: ${error.response ? error.response.data : error.message}`);
    }
  }
}

createRoles();
