const fs = require('node:fs');
const path = require('node:path');
const DataStorage = require('./dataStorage');

class MemoryStorage extends DataStorage {
  constructor() {
    super();
    this.roles = this.loadData(); // 从文件加载数据
  }

  // 从文件加载数据
  loadData() {
    const filePath = path.join(__dirname, 'roles.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      const parsedData = JSON.parse(data);
      return Array.isArray(parsedData) ? parsedData : []; // 确保返回一个数组
    }
    return []; // 如果文件不存在，返回空数组
  }

  // 将数据保存到文件
  saveData() {
    const filePath = path.join(__dirname, 'roles.json');
    fs.writeFileSync(filePath, JSON.stringify(this.roles, null, 2));
  }

  // 获取所有角色
  getAllRoles() {
    return this.roles; // 返回角色数组
  }

  // 创建角色
  async createRole(role) {
    this.roles.push(role); // 将新角色推送到数组中
    this.saveData(); // 保存数据到文件
    return role;
  }

  // 调用角色（执行角色的任务）
  async callRole(roleId) {
    const role = this.roles.find((r) => r.role_id === roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    // 模拟角色执行某个行为
    return this.executeRoleBehavior(role);
  }

  // 执行角色的行为（模拟角色的任务）
  executeRoleBehavior(role) {
    return {
      message: `Role ${role.name} is now executing its task.`,
      task: 'Performing AI assistant tasks...',
    };
  }

  // 编辑角色（只修改角色的部分属性）
  async editRole(roleId, updates) {
    const role = this.roles.find((r) => r.role_id === roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    // 只修改部分角色属性
    Object.assign(role, updates); // 通过 Object.assign 合并更新数据
    this.saveData(); // 保存数据到文件
    return role; // 返回更新后的角色
  }

  // 删除角色
  async deleteRole(roleId) {
    const index = this.roles.findIndex((r) => r.role_id === roleId);
    if (index !== -1) {
      this.roles.splice(index, 1); // 从数组中删除角色
      this.saveData(); // 保存数据到文件
      return { message: 'Role deleted successfully' };
    }
    throw new Error('Role not found');
  }
}

module.exports = MemoryStorage;
