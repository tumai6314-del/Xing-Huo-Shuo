// src/storage/dataStorage.js

class DataStorage {
  constructor() {
    if (this.constructor === DataStorage) {
      throw new Error('Cannot instantiate abstract class DataStorage');
    }
  }

  // 创建角色（AI助手）
  async createRole(role) {
    throw new Error('createRole method should be implemented');
  }

  // 调用角色（执行角色的任务）
  async callRole(roleId) {
    throw new Error('callRole method should be implemented');
  }

  // 编辑角色（修改角色的部分属性）
  async editRole(roleId, updates) {
    throw new Error('editRole method should be implemented');
  }

  // 删除角色
  async deleteRole(roleId) {
    throw new Error('deleteRole method should be implemented');
  }
}

module.exports = DataStorage;
