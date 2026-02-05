/**
 * 配置管理工具
 * 统一管理应用配置，支持版本控制和导入导出
 */

const CONFIG_VERSION = '1.0.0';
const CONFIG_STORAGE_KEY = 'mqtt_config_manager';

class ConfigManager {
  constructor() {
    this.config = {
      version: CONFIG_VERSION,
      servers: [],
      currentServerIndex: 0,
      defaultQos: 0,
      maxMessageHistory: 100,
      autoReconnect: true,
      reconnectInterval: 5000,
      logging: {
        enabled: true,
        level: 'info' // debug, info, warn, error
      }
    };
  }

  // 加载配置
  load() {
    try {
      const saved = wx.getStorageSync(CONFIG_STORAGE_KEY);
      if (saved) {
        this.config = { ...this.config, ...saved };
        console.log('ConfigManager: Configuration loaded');
      }
    } catch (e) {
      console.error('ConfigManager: Failed to load configuration:', e);
    }
  }

  // 保存配置
  save() {
    try {
      wx.setStorageSync(CONFIG_STORAGE_KEY, this.config);
      console.log('ConfigManager: Configuration saved');
      return true;
    } catch (e) {
      console.error('ConfigManager: Failed to save configuration:', e);
      return false;
    }
  }

  // 获取当前配置
  get() {
    return { ...this.config };
  }

  // 更新配置
  update(key, value) {
    if (key in this.config) {
      this.config[key] = value;
      return this.save();
    }
    console.warn('ConfigManager: Invalid config key:', key);
    return false;
  }

  // 添加服务器配置
  addServer(serverConfig) {
    const { name, broker, port, protocol, clientId, username, password } = serverConfig;

    if (!name || !broker) {
      console.warn('ConfigManager: Invalid server config');
      return false;
    }

    const server = {
      name,
      broker,
      port: port || 8084,
      protocol: protocol || 'wss',
      clientId: clientId || '',
      username: username || '',
      password: password || '',
      createdAt: new Date().toISOString()
    };

    // 检查是否已存在相同的服务器
    const exists = this.config.servers.some(s =>
      s.broker === broker && s.port === server.port
    );

    if (exists) {
      wx.showToast({
        title: '服务器已存在',
        icon: 'none'
      });
      return false;
    }

    this.config.servers.push(server);
    return this.save();
  }

  // 删除服务器配置
  deleteServer(index) {
    if (index >= 0 && index < this.config.servers.length) {
      const deleted = this.config.servers.splice(index, 1)[0];

      // 调整当前服务器索引
      if (this.config.currentServerIndex >= this.config.servers.length) {
        this.config.currentServerIndex = Math.max(0, this.config.servers.length - 1);
      }

      this.save();
      console.log('ConfigManager: Server deleted:', deleted.name);
      return true;
    }
    return false;
  }

  // 获取服务器列表
  getServers() {
    return [...this.config.servers];
  }

  // 设置当前服务器
  setCurrentServer(index) {
    if (index >= 0 && index < this.config.servers.length) {
      this.config.currentServerIndex = index;
      return this.save();
    }
    return false;
  }

  // 获取当前服务器配置
  getCurrentServer() {
    if (this.config.servers.length > 0) {
      return { ...this.config.servers[this.config.currentServerIndex] };
    }
    return null;
  }

  // 导出配置为 JSON
  exportConfig() {
    try {
      const exportData = {
        version: CONFIG_VERSION,
        exportTime: new Date().toISOString(),
        config: this.config
      };
      const jsonString = JSON.stringify(exportData, null, 2);
      return jsonString;
    } catch (e) {
      console.error('ConfigManager: Failed to export config:', e);
      return null;
    }
  }

  // 导入配置
  importConfig(jsonString) {
    try {
      const importData = JSON.parse(jsonString);

      // 验证数据格式
      if (!importData.config || !importData.version) {
        throw new Error('Invalid config format');
      }

      // 合并配置
      this.config = { ...this.config, ...importData.config };

      // 保存并验证
      const saved = this.save();
      if (saved) {
        console.log('ConfigManager: Configuration imported successfully');
        wx.showToast({
          title: '配置导入成功',
          icon: 'success'
        });
      }
      return saved;
    } catch (e) {
      console.error('ConfigManager: Failed to import config:', e);
      wx.showToast({
        title: '配置导入失败',
        icon: 'none'
      });
      return false;
    }
  }

  // 重置为默认配置
  resetToDefault() {
    this.config = {
      version: CONFIG_VERSION,
      servers: [],
      currentServerIndex: 0,
      defaultQos: 0,
      maxMessageHistory: 100,
      autoReconnect: true,
      reconnectInterval: 5000,
      logging: {
        enabled: true,
        level: 'info'
      }
    };
    return this.save();
  }

  // 获取日志配置
  getLoggingConfig() {
    return { ...this.config.logging };
  }

  // 设置日志级别
  setLogLevel(level) {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (validLevels.includes(level)) {
      this.config.logging.level = level;
      return this.save();
    }
    console.warn('ConfigManager: Invalid log level:', level);
    return false;
  }
}

// 导出单例
const configManager = new ConfigManager();
configManager.load();

module.exports = configManager;
