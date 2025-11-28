const express = require('express');

const router = express.Router();
const MemoryStorage = require('../storage/memoryStorage');

const storage = new MemoryStorage();

// 获取所有角色 API
router.get('/', async (req, res) => {
  console.log('Received GET request for /api/roles');
  try {
    const roles = await storage.getAllRoles(); // 获取所有角色，假设存储方法是 getAllRoles
    res.status(200).json(roles);
  } catch (error) {
    res.status(500).json({ error: error.message, message: '获取角色失败' });
  }
});

// 创建角色 API
router.post('/create', async (req, res) => {
  const { role_id, name, description, personality } = req.body;

  // 验证输入数据
  if (!role_id || !name) {
    return res.status(400).json({ message: 'role_id and name are required' });
  }

  try {
    const newRole = { description, name, personality, role_id };
    const createdRole = await storage.createRole(newRole);
    res.status(201).json(createdRole);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 调用角色 API
router.get('/call/:role_id', async (req, res) => {
  const { role_id } = req.params;

  try {
    const result = await storage.callRole(role_id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 编辑角色 API
router.put('/edit/:role_id', async (req, res) => {
  const { role_id } = req.params;
  const { name, description, personality } = req.body;

  try {
    const updatedRole = await storage.editRole(role_id, { description, name, personality });
    res.status(200).json(updatedRole);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 删除角色 API
router.delete('/delete/:role_id', async (req, res) => {
  const { role_id } = req.params;

  try {
    const message = await storage.deleteRole(role_id);
    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
