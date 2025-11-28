// src/app.js
/* eslint-disable unicorn/prefer-top-level-await */

const MemoryStorage = require('./storage/memoryStorage');

// 创建内存存储实例
const storage = new MemoryStorage();

// 测试创建角色
async function test() {
  const newRole = {
    description: 'A friendly AI',
    name: 'AI Assistant',
    personality: { trait: 'helpful' },
    role_id: '1',
  };
  await storage.createRole(newRole);
  console.log('Created Role:', newRole);

  // 调用角色
  const result = await storage.callRole('1');
  console.log('Role Called:', result);

  // 编辑角色（修改角色的部分属性）
  const updatedRole = await storage.editRole('1', {
    description: 'An updated friendly AI',
    name: 'Updated AI Assistant',
  });
  console.log('Edited Role:', updatedRole);

  const deleteMessage = await storage.deleteRole('1');
  console.log(deleteMessage);
}

// 运行测试
test().catch(console.error);
