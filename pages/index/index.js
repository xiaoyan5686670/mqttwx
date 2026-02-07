// index.js
const mqttClient = require('../../utils/mqtt.js');
const messageExporter = require('../../utils/messageExporter');

Page({
  data: {
    // 基础连接状态
    isConnected: false,
    isConnecting: false,
    connectionStatus: 'disconnected',
    connectionText: '未连接',

    // 压缩机温度和风扇状态
    comp1InTemp: null,
    comp1OutTemp: null,
    tempDiff: null,
    fanStatus: 'unknown', // 'running', 'stopped', 'unknown'
    tempDiffThreshold: 10, // 温度差阈值，大于此值风扇停转

    // 设备管理
    deviceList: [],
    currentDeviceId: null,
    currentDeviceName: '',
    currentDeviceTopic: 'device/sensor/data',

    // UI状态属性
    connectAction: 'connect',
    connectionButtonText: '建立连接',

    // 数据存储 - 只保留消息历史，移除订阅和发布相关
    messages: [],
    filteredMessages: [], // 过滤后的消息

    // 状态和错误信息
    errorMessage: '',
    debugInfo: '',
    connectionAttempts: 0,

    // UI控制状态
    showAdvancedTest: false,
    showServerConfig: false,
    showTestDialog: false,
    showPassword: false, // 密码可见性控制
    activeTab: 'home', // 当前激活的选项卡: home, messages, settings

    // 消息过滤相关
    filterKeyword: '', // 搜索关键词
    filterTopic: '', // 主题过滤
    messageType: 'all', // 消息类型: all, received, sent

    // 服务器配置 - 使用用户内网服务器
    serverConfig: {
      broker: '192.168.1.3',
      port: 8083,  // 内网服务器非加密端口
      protocol: 'ws',   // 使用ws而不是wss避免SSL证书问题
      clientId: '',
      username: 'qxy1',  // 用户内网服务器认证
      password: '5686670'  // 用户内网服务器认证
    },
    presetServers: [],
    customServers: [],

    // 统计数据 - 简化统计
    messageCount: 0
  },

  onLoad() {
    console.log('Enhanced home page loaded');
    this.setupMQTTCallbacks();
    this.loadSavedData();
    this.loadServerConfig();
    this.initDefaultDeviceList(); // 初始化默认设备
    this.loadDeviceList();
    this.generateClientId();
    this.applyMessageFilter(); // 初始化时应用过滤
  },

  onShow() {
    this.updateConnectionStatus();
  },

  setupMQTTCallbacks() {
    mqttClient.onConnect((success) => {
      console.log('MQTT connection callback:', success);
      if (success) {
        // 先更新连接状态
        this.setData({
          isConnected: true,
          isConnecting: false,
          connectionStatus: 'connected',
          connectionText: '已连接',
          connectAction: 'disconnect',
          connectionButtonText: '断开连接',
          errorMessage: '',
          debugInfo: '连接成功',
          connectionAttempts: 0
        });
        
        // 连接成功后订阅当前设备的主题
        if (this.data.currentDeviceTopic) {
          const success = mqttClient.subscribe(this.data.currentDeviceTopic, 0);
          if (success) {
            console.log('Auto-subscribed to device topic:', this.data.currentDeviceTopic);
            this.setData({
              debugInfo: `连接成功，已订阅: ${this.data.currentDeviceTopic}`
            });
          } else {
            console.error('Failed to auto-subscribe to topic:', this.data.currentDeviceTopic);
            this.setData({
              debugInfo: `连接成功，但订阅失败: ${this.data.currentDeviceTopic}`
            });
          }
        }
        
        wx.showToast({
          title: '连接成功',
          icon: 'success'
        });
      } else {
        this.handleConnectionError('连接失败');
      }
    });

    // 添加消息接收回调来处理设备数据和消息历史
    mqttClient.onMessageReceived((message) => {
      console.log('Message received:', message);
      this.addMessage(message);
      
      // 处理设备传感器数据
      this.handleDeviceDataMessage(message);
    });

    mqttClient.onDisconnect(() => {
      console.log('MQTT disconnect callback triggered');
      this.setData({
        isConnected: false,
        isConnecting: false,
        connectionStatus: 'disconnected',
        connectionText: '已断开',
        connectAction: 'connect',
        connectionButtonText: '建立连接',
        debugInfo: '连接已断开'
      });
      wx.showToast({
        title: '已断开连接',
        icon: 'none'
      });
    });
  },

  loadSavedData() {
    try {
      const messages = wx.getStorageSync('messageHistory');

      if (messages) {
        console.log('Loaded message history:', messages.length, 'messages');
        this.setData({
          messages: messages
        });
        this.updateMessageStats(); // 加载后更新统计
      }
    } catch (e) {
      console.error('Failed to load saved data:', e);
      wx.showToast({
        title: '加载数据失败',
        icon: 'none'
      });
    }
  },

  loadServerConfig() {
    // 加载预设服务器列表
    const presetServers = mqttClient.getPresetServers();
    
    // 加载当前配置
    const currentConfig = mqttClient.getCurrentConfig();
    
    // 加载自定义服务器列表
    let customServers = [];
    try {
      customServers = wx.getStorageSync('customMqttServers') || [];
    } catch (e) {
      console.error('Failed to load custom servers:', e);
    }
    
    this.setData({
      presetServers: presetServers,
      serverConfig: {
        broker: currentConfig.broker,
        port: currentConfig.port,
        protocol: currentConfig.protocol,
        clientId: currentConfig.clientId,
        username: currentConfig.username || '',
        password: currentConfig.password || ''
      },
      customServers: customServers
    });
  },

  saveData() {
    try {
      wx.setStorageSync('messageHistory', this.data.messages);
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  },

  updateConnectionStatus() {
    const connected = mqttClient.connected;
    console.log('Updating connection status. Connected:', connected);
    
    this.setData({
      isConnected: connected,
      connectionStatus: connected ? 'connected' : 'disconnected',
      connectionText: connected ? '已连接' : '未连接',
      connectAction: connected ? 'disconnect' : 'connect',
      connectionButtonText: connected ? '断开连接' : '建立连接'
    });
  },

  handleConnectionError(errorMsg) {
    console.error('Connection error:', errorMsg);
    const attempts = this.data.connectionAttempts + 1;

    this.setData({
      isConnected: false,
      isConnecting: false,
      connectionStatus: 'disconnected',
      connectionText: '连接失败',
      connectAction: 'connect',
      connectionButtonText: '建立连接',
      errorMessage: errorMsg,
      debugInfo: `连接错误 (${attempts}次尝试): ${errorMsg}`,
      connectionAttempts: attempts
    });

    let content = errorMsg;
    if (attempts > 1) {
      content += `\n\n这是第${attempts}次连接尝试。`;
    }
    content += '\n\n可能的原因:\n• 网络连接问题\n• 服务器不可用\n• 防火墙阻止连接\n• 域名未添加到合法域名列表';

    wx.showModal({
      title: '连接失败',
      content: content,
      showCancel: true,
      cancelText: '取消重连',
      confirmText: '重试',
      success: (res) => {
        if (res.confirm) {
          this.retryConnection();
        } else {
          // 用户取消，停止自动重连
          mqttClient.cancelReconnect();
          wx.showToast({
            title: '已取消重连',
            icon: 'none'
          });
        }
      }
    });
  },

  // 初始化默认设备列表
  initDefaultDeviceList() {
    const defaultDevices = [
      {
        id: 1,
        name: 'STM32设备',
        subscribeTopic: 'stm32/1',
        publishTopic: 'stm32/control',
        createdAt: new Date().toISOString()
      }
    ];
    
    try {
      const existingList = wx.getStorageSync('deviceList');
      if (!existingList || !Array.isArray(existingList) || existingList.length === 0) {
        wx.setStorageSync('deviceList', defaultDevices);
        wx.setStorageSync('currentDeviceId', 1);
        console.log('Initialized default device list');
      }
    } catch (e) {
      console.error('Failed to initialize device list:', e);
      // 直接在内存中设置默认值
      this.setData({
        deviceList: defaultDevices,
        currentDeviceId: 1,
        currentDeviceName: '默认设备',
        currentDeviceTopic: 'device/sensor/data'
      });
    }
  },

  async connect() {
    if (this.data.isConnected || this.data.isConnecting) {
      console.log('Connection already in progress or established');
      return;
    }

    console.log('Attempting to connect to MQTT broker');

    // 重置重连标志，允许自动重连
    mqttClient.resetReconnectFlag();

    this.setData({
      isConnecting: true,
      connectionStatus: 'connecting',
      connectionText: '连接中...',
      connectAction: 'connect',
      connectionButtonText: '连接中...',
      errorMessage: '',
      debugInfo: '正在建立连接...'
    });

    wx.showLoading({
      title: '连接中...',
      mask: true
    });

    try {
      await mqttClient.connect();
      // Success handled by callback
    } catch (error) {
      console.error('Connection promise rejected:', error);
      const errorMsg = error.message || '未知错误';
      this.handleConnectionError(errorMsg);
    } finally {
      wx.hideLoading();
    }
  },

  disconnect() {
    if (!this.data.isConnected) {
      console.log('Not connected, nothing to disconnect');
      // 即使未连接，也要停止可能的自动重连
      mqttClient.cancelReconnect();
      return;
    }

    console.log('Disconnecting from MQTT broker');

    this.setData({
      connectionStatus: 'disconnecting',
      connectionText: '断开中...',
      connectAction: 'connect',
      connectionButtonText: '断开中...',
      debugInfo: '正在断开连接...'
    });

    mqttClient.disconnect();

    setTimeout(() => {
      this.setData({
        isConnected: false,
        isConnecting: false,
        connectionStatus: 'disconnected',
        connectionText: '已断开',
        connectAction: 'connect',
        connectionButtonText: '建立连接',
        debugInfo: '已断开连接'
      });
    }, 1000);
  },

  // 服务器配置相关方法
  toggleServerConfig() {
    this.setData({
      showServerConfig: !this.data.showServerConfig
    });
  },

  showServerConfigDialog() {
    this.setData({
      showServerConfig: true
    });
  },

  hideServerConfigDialog() {
    this.setData({
      showServerConfig: false
    });
  },

  // 选择预设服务器
  selectPresetServer(e) {
    const index = e.currentTarget.dataset.index;
    const server = this.data.presetServers[index];
    
    this.setData({
      serverConfig: {
        broker: server.broker,
        port: server.port,
        protocol: server.protocol,
        clientId: 'miniprogram_' + Math.random().toString(16).substr(2, 8)
      }
    });
    
    wx.showToast({
      title: `已选择: ${server.name}`,
      icon: 'success'
    });
  },

  // 选择自定义服务器
  selectCustomServer(e) {
    const index = e.currentTarget.dataset.index;
    const server = this.data.customServers[index];
    
    this.setData({
      serverConfig: {
        broker: server.broker,
        port: server.port,
        protocol: server.protocol,
        clientId: server.clientId || 'miniprogram_' + Math.random().toString(16).substr(2, 8)
      }
    });
    
    wx.showToast({
      title: '已选择自定义服务器',
      icon: 'success'
    });
  },

  // 输入框处理
  onBrokerInput(e) {
    this.setData({
      'serverConfig.broker': e.detail.value
    });
  },

  onPortInput(e) {
    this.setData({
      'serverConfig.port': parseInt(e.detail.value) || 8084
    });
  },

  onProtocolChange(e) {
    this.setData({
      'serverConfig.protocol': e.detail.value
    });
  },

  onClientIdInput(e) {
    this.setData({
      'serverConfig.clientId': e.detail.value
    });
  },

  // 新增的用户名密码输入处理
  onUsernameInput(e) {
    this.setData({
      'serverConfig.username': e.detail.value
    });
  },

  onPasswordInput(e) {
    this.setData({
      'serverConfig.password': e.detail.value
    });
  },

  // 密码可见性切换
  togglePasswordVisibility() {
    this.setData({
      showPassword: !this.data.showPassword
    });
  },

  // 保存服务器配置
  saveServerConfig() {
    const config = this.data.serverConfig;
    
    if (!config.broker) {
      wx.showToast({
        title: '请输入服务器地址',
        icon: 'none'
      });
      return;
    }
    
    if (!config.clientId) {
      this.generateClientId();
    }
    
    const success = mqttClient.saveCustomConfig(config);
    
    if (success) {
      this.setData({
        showServerConfig: false,
        debugInfo: `服务器配置已保存: ${config.broker}:${config.port}`
      });
      
      wx.showToast({
        title: '配置保存成功',
        icon: 'success'
      });
    } else {
      wx.showToast({
        title: '配置保存失败',
        icon: 'none'
      });
    }
  },

  // 重置为默认配置
  resetToDefault() {
    wx.showModal({
      title: '确认重置',
      content: '确定要重置为默认服务器配置吗？',
      success: (res) => {
        if (res.confirm) {
          const success = mqttClient.resetToDefault();
          if (success) {
            const defaultConfig = mqttClient.getCurrentConfig();
            this.setData({
              serverConfig: {
                broker: defaultConfig.broker,
                port: defaultConfig.port,
                protocol: defaultConfig.protocol,
                clientId: defaultConfig.clientId,
                username: defaultConfig.username || '',
                password: defaultConfig.password || ''
              },
              debugInfo: '已重置为默认配置'
            });
            
            wx.showToast({
              title: '已重置为默认配置',
              icon: 'success'
            });
          }
        }
      }
    });
  },

  // 添加自定义服务器到列表
  addCustomServer() {
    const config = this.data.serverConfig;
    
    if (!config.broker) {
      wx.showToast({
        title: '请输入服务器地址',
        icon: 'none'
      });
      return;
    }
    
    const newServer = {
      name: `${config.broker}:${config.port}`,
      broker: config.broker,
      port: config.port,
      protocol: config.protocol,
      clientId: config.clientId || 'miniprogram_' + Math.random().toString(16).substr(2, 8),
      createdAt: new Date().toISOString()
    };
    
    const customServers = [...this.data.customServers, newServer];
    
    try {
      wx.setStorageSync('customMqttServers', customServers);
      this.setData({
        customServers: customServers
      });
      
      wx.showToast({
        title: '已添加到自定义服务器列表',
        icon: 'success'
      });
    } catch (e) {
      console.error('Failed to save custom server:', e);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },

  // 删除自定义服务器
  deleteCustomServer(e) {
    const index = e.currentTarget.dataset.index;
    const customServers = this.data.customServers.filter((_, i) => i !== index);
    
    try {
      wx.setStorageSync('customMqttServers', customServers);
      this.setData({
        customServers: customServers
      });
      
      wx.showToast({
        title: '已删除',
        icon: 'success'
      });
    } catch (e) {
      console.error('Failed to delete custom server:', e);
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },









  addMessage(message) {
    if (!message.direction) {
      message.direction = 'received';
    }

    const messages = [message, ...this.data.messages];

    if (messages.length > 100) {
      messages.length = 100;
    }

    this.setData({
      messages: messages
    });
    this.updateMessageStats(); // 更新统计数据
    this.applyMessageFilter(); // 应用消息过滤
    this.saveData();
  },

  // 更新消息统计数据
  updateMessageStats() {
    const messages = this.data.messages;
    const messageCount = messages.length;

    this.setData({
      messageCount: messageCount
    });
  },

  // 应用消息过滤
  applyMessageFilter() {
    const { messages, filterKeyword, filterTopic, messageType } = this.data;

    let filtered = messages;

    // 按关键词过滤
    if (filterKeyword) {
      const keyword = filterKeyword.toLowerCase();
      filtered = filtered.filter(msg =>
        msg.topic.toLowerCase().includes(keyword) ||
        msg.payload.toLowerCase().includes(keyword)
      );
    }

    // 按主题过滤
    if (filterTopic) {
      filtered = filtered.filter(msg => msg.topic === filterTopic);
    }

    // 按消息类型过滤
    if (messageType !== 'all') {
      filtered = filtered.filter(msg => msg.direction === messageType);
    }

    this.setData({
      filteredMessages: filtered
    });
  },

  // 过滤器输入处理
  onFilterKeywordInput(e) {
    this.setData({
      filterKeyword: e.detail.value
    });
    this.applyMessageFilter();
  },

  onFilterTopicInput(e) {
    this.setData({
      filterTopic: e.detail.value
    });
    this.applyMessageFilter();
  },

  onMessageTypeChange(e) {
    this.setData({
      messageType: e.detail.value
    });
    this.applyMessageFilter();
  },

  // 清除过滤
  clearFilters() {
    this.setData({
      filterKeyword: '',
      filterTopic: '',
      messageType: 'all'
    });
    this.applyMessageFilter();
    wx.showToast({
      title: '已清除过滤',
      icon: 'success'
    });
  },

  // 导出消息为 JSON
  exportMessagesAsJson() {
    const { filteredMessages } = this.data;

    if (filteredMessages.length === 0) {
      wx.showToast({
        title: '无消息可导出',
        icon: 'none'
      });
      return;
    }

    try {
      const jsonString = messageExporter.exportToJson(filteredMessages, {
        filters: {
          keyword: this.data.filterKeyword,
          topic: this.data.filterTopic,
          type: this.data.messageType
        }
      });

      wx.showModal({
        title: '导出成功',
        content: `已导出 ${filteredMessages.length} 条消息`,
        confirmText: '复制内容',
        success: (res) => {
          if (res.confirm) {
            messageExporter.copyToClipboard(jsonString);
          }
        }
      });
    } catch (e) {
      console.error('Export failed:', e);
      wx.showToast({
        title: '导出失败',
        icon: 'none'
      });
    }
  },

  // 导出消息为 CSV
  exportMessagesAsCsv() {
    const { filteredMessages } = this.data;

    if (filteredMessages.length === 0) {
      wx.showToast({
        title: '无消息可导出',
        icon: 'none'
      });
      return;
    }

    try {
      const csvContent = messageExporter.exportToCsv(filteredMessages);
      messageExporter.copyToClipboard(csvContent);
    } catch (e) {
      console.error('Export CSV failed:', e);
      wx.showToast({
        title: '导出失败',
        icon: 'none'
      });
    }
  },

  // 显示消息统计
  showMessageStats() {
    const { filteredMessages } = this.data;

    if (filteredMessages.length === 0) {
      wx.showToast({
        title: '暂无消息统计',
        icon: 'none'
      });
      return;
    }

    const stats = messageExporter.getStatistics(filteredMessages);
    const statsText = messageExporter.formatStatistics(stats);

    wx.showModal({
      title: '消息统计',
      content: statsText,
      showCancel: true,
      cancelText: '关闭',
      confirmText: '复制统计',
      success: (res) => {
        if (res.confirm) {
          messageExporter.copyToClipboard(statsText);
        }
      }
    });
  },

  clearMessages() {
    wx.showModal({
      title: '确认',
      content: '确定要清空所有消息记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            messages: [],
            receivedMessageCount: 0,
            sentMessageCount: 0,
            debugInfo: '消息记录已清空'
          });
          this.saveData();

          wx.showToast({
            title: '已清空',
            icon: 'success'
          });
        }
      }
    });
  },



  // 过滤标签点击
  onFilterTagTap(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      messageType: type
    });
    this.applyMessageFilter();
  },

  retryConnection() {
    console.log('Retrying connection');
    this.setData({
      debugInfo: '正在重试连接...'
    });
    this.connect();
  },

  testConnection() {
    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先连接MQTT服务器',
        icon: 'none'
      });
      return;
    }

    // Publish a test message
    const testTopic = 'test/connection';
    const testMessage = `连接测试消息 - ${new Date().toLocaleString()}`;
    
    const success = mqttClient.publish(testTopic, testMessage);
    if (success) {
      this.setData({
        debugInfo: `测试消息已发送到 ${testTopic}`
      });
      wx.showToast({
        title: '测试消息已发送',
        icon: 'success'
      });
    } else {
      this.setData({
        debugInfo: '测试消息发送失败'
      });
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      });
    }
  },

  resetConnection() {
    this.setData({
      connectionAttempts: 0,
      debugInfo: '连接尝试次数已重置'
    });
    wx.showToast({
      title: '已重置',
      icon: 'success'
    });
  },

  // 防止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  },

  // 设备管理相关方法
  loadDeviceList() {
    try {
      const list = wx.getStorageSync('deviceList');
      const currentId = wx.getStorageSync('currentDeviceId');
      
      if (list && Array.isArray(list)) {
        this.setData({ 
          deviceList: list,
          currentDeviceId: currentId || (list.length > 0 ? list[0].id : null)
        });
        
        if (this.data.currentDeviceId) {
          this.updateCurrentDeviceInfo();
        }
        console.log('Loaded device list:', list.length, 'devices');
      } else {
        this.setData({ 
          deviceList: [],
          currentDeviceId: null,
          currentDeviceName: ''
        });
      }
    } catch (e) {
      console.error('Failed to load device list:', e);
      this.setData({ 
        deviceList: [],
        currentDeviceId: null,
        currentDeviceName: ''
      });
    }
  },

  saveDeviceList() {
    try {
      wx.setStorageSync('deviceList', this.data.deviceList);
    } catch (e) {
      console.error('Failed to save device list:', e);
    }
  },

  updateCurrentDeviceInfo() {
    const { deviceList, currentDeviceId } = this.data;
    if (deviceList.length > 0 && currentDeviceId) {
      const device = deviceList.find(d => d.id == currentDeviceId);
      if (device) {
        this.setData({
          currentDeviceName: device.name,
          currentDeviceTopic: device.subscribeTopic || 'device/sensor/data'
        });
        console.log('Current device:', device.name, 'Topic:', this.data.currentDeviceTopic);
      }
    }
  },

  // 设备选择列表 - 为 tap 事件设计
  switchDevice(e) {
    const deviceId = e.currentTarget.dataset.id;
    this.handleDeviceSwitch(deviceId);
  },

  // 设备选择 - 为 picker change 事件设计
  onDeviceSelect(e) {
    const index = e.detail.value;
    const deviceList = this.data.deviceList;
    if (deviceList && deviceList[index]) {
      const deviceId = deviceList[index].id;
      this.handleDeviceSwitch(deviceId);
    }
  },

  // 统一的设备切换处理逻辑
  handleDeviceSwitch(deviceId) {
    const deviceList = this.data.deviceList;
    
    if (!deviceList || deviceList.length === 0) {
      console.log('No devices available');
      return;
    }
    
    const device = deviceList.find(d => d.id == deviceId);
    if (!device) {
      console.log('Device not found:', deviceId);
      return;
    }
    
    // 更新当前设备
    this.setData({
      currentDeviceId: device.id,
      currentDeviceName: device.name,
      currentDeviceTopic: device.subscribeTopic || 'device/sensor/data',
      deviceData: {}, // 清空旧数据
      comp1InTemp: null,
      comp1OutTemp: null,
      tempDiff: null,
      fanStatus: 'unknown'
    });
    
    // 保存选择到本地存储
    wx.setStorageSync('currentDeviceId', device.id);
    
    // 如果已连接，重新订阅新设备的主题
    if (this.data.isConnected && this.data.currentDeviceTopic) {
      // 取消之前的订阅
      try {
        // 如果有之前的主题就取消订阅，否则跳过
        if (this.data.currentDeviceTopic && this.data.currentDeviceTopic !== device.subscribeTopic) {
          mqttClient.unsubscribe(this.data.currentDeviceTopic);
        }
      } catch (e) {
        console.error('Failed to unsubscribe:', e);
      }
      
      // 订阅新设备的主题
      const success = mqttClient.subscribe(device.subscribeTopic, 0);
      if (success) {
        console.log('Subscribed to device topic:', device.subscribeTopic);
        this.setData({
          debugInfo: `已切换到设备: ${device.name}`
        });
        wx.showToast({
          title: `切换到${device.name}`,
          icon: 'success'
        });
      } else {
        console.error('Failed to subscribe to topic:', device.subscribeTopic);
        this.setData({
          debugInfo: `订阅设备主题失败: ${device.name}`
        });
      }
    }
    
    console.log('Switched to device:', device.name);
  },

  // 处理设备数据消息
  handleDeviceDataMessage(message) {
    try {
      // 检查是否是STM32设备数据主题
      if (message.topic === 'stm32/1') {
        const data = JSON.parse(message.payload);
        console.log('Parsed STM32 data:', data);
        
        // 提取压缩机1的进出口温度（华氏度）- 支持多种可能的字段名格式
        let comp1InTemp = data.comp1_in_temperature_F || data.comp1_in?.temperature_F || data.compressor1_in_temp_F;
        let comp1OutTemp = data.comp1_out_temperature_F || data.comp1_out?.temperature_F || data.compressor1_out_temp_F;
        
        // 如果数据是数字数组格式，尝试解析
        if (Array.isArray(data) && data.length >= 2) {
          comp1InTemp = data[0];
          comp1OutTemp = data[1];
        }
        
        // 如果数据是对象且包含数组形式的温度数据
        if (data.temperatures && Array.isArray(data.temperatures)) {
          comp1InTemp = data.temperatures[0];
          comp1OutTemp = data.temperatures[1];
        }
        
        // 如果数据是简单的键值对，尝试常见格式
        if (data.in_temp !== undefined && data.out_temp !== undefined) {
          comp1InTemp = data.in_temp;
          comp1OutTemp = data.out_temp;
        }
        
        // 如果数据是嵌套对象格式
        if (data.sensors && data.sensors.compressor) {
          comp1InTemp = data.sensors.compressor.in_temp;
          comp1OutTemp = data.sensors.compressor.out_temp;
        }
        
        console.log('Extracted temperatures - In:', comp1InTemp, 'Out:', comp1OutTemp);
        
        if (comp1InTemp !== undefined && comp1OutTemp !== undefined && comp1InTemp !== null && comp1OutTemp !== null) {
          // 确保是数字类型
          comp1InTemp = Number(comp1InTemp);
          comp1OutTemp = Number(comp1OutTemp);
          
          // 转换为摄氏度计算差值 (°C = (°F - 32) × 5/9)
          const comp1InTempC = (comp1InTemp - 32) * 5/9;
          const comp1OutTempC = (comp1OutTemp - 32) * 5/9;
          const tempDiff = Math.abs(comp1OutTempC - comp1InTempC);
          
          // 判断风扇状态：温度差大于阈值则风扇停转，否则风扇运转
          const fanStatus = tempDiff > this.data.tempDiffThreshold ? 'stopped' : 'running';
          
          this.setData({
            comp1InTemp: comp1InTemp,
            comp1OutTemp: comp1OutTemp,
            tempDiff: parseFloat(tempDiff.toFixed(1)),
            fanStatus: fanStatus
          });
          
          console.log(`压缩机温度差: ${tempDiff.toFixed(1)}°C (进: ${comp1InTemp}°F, 出: ${comp1OutTemp}°F), 风扇状态: ${fanStatus}`);
        } else {
          console.log('Temperature data not found in expected format. Available keys:', Object.keys(data));
          // 打印完整数据用于调试
          console.log('Full STM32 data:', JSON.stringify(data));
        }
      }
    } catch (e) {
      console.error('Failed to parse STM32 data in index:', e);
    }
  },

  // 切换选项卡
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab || 'home';
    this.setData({
      activeTab: tab
    });
  },

  // 导航到设备页面
  navigateToDevice() {
    wx.navigateTo({
      url: '/pages/device/device'
    });
  },

  // 新增的首页功能方法
  toggleAdvancedTest() {
    this.setData({
      showAdvancedTest: !this.data.showAdvancedTest
    });
  },

  showTestDialog() {
    if (!this.data.isConnected) {
      this.showConnectFirst();
      return;
    }
    this.setData({
      showTestDialog: true
    });
  },

  hideTestDialog() {
    this.setData({
      showTestDialog: false
    });
  },

  showConnectFirst() {
    wx.showToast({
      title: '请先连接MQTT服务器',
      icon: 'none'
    });
  },

  // 测试消息发送
  sendQuickTest() {
    const testTopic = 'test/quick';
    const testMessage = `快速测试消息 - ${new Date().toLocaleString()}`;
    this.sendTestMessage(testTopic, testMessage);
    this.hideTestDialog();
  },

  sendJsonTest() {
    const testTopic = 'test/json';
    const testMessage = JSON.stringify({
      type: 'test',
      timestamp: new Date().toISOString(),
      data: {
        temperature: Math.random() * 30 + 10,
        humidity: Math.random() * 50 + 30
      }
    }, null, 2);
    this.sendTestMessage(testTopic, testMessage);
    this.hideTestDialog();
  },

  sendCustomTest() {
    const testTopic = 'test/custom';
    const testMessage = `自定义测试消息 - ${new Date().toLocaleString()}\n这是一条用户自定义的测试消息。`;
    this.sendTestMessage(testTopic, testMessage);
    this.hideTestDialog();
  },

  sendTestMessage(topic, message) {
    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先连接MQTT服务器',
        icon: 'none'
      });
      return;
    }

    const success = mqttClient.publish(topic, message, this.data.publishQos);
    if (success) {
      this.addMessage({
        topic: topic,
        payload: message,
        timestamp: new Date().toLocaleTimeString(),
        direction: 'sent'
      });

      this.setData({
        debugInfo: `测试消息已发送到 ${topic}`
      });

      wx.showToast({
        title: '测试消息已发送',
        icon: 'success'
      });
    } else {
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      });
    }
  },

  // 页面导航
  navigateToFullMessageView() {
    this.setData({
      showAdvancedTest: true
    });
    // 滚动到消息历史区域
    wx.pageScrollTo({
      selector: '.full-history-section',
      duration: 300
    });
  },

  // 设置温差阈值
  setTempDiffThreshold(e) {
    const threshold = parseInt(e.currentTarget.dataset.value);
    this.setData({
      tempDiffThreshold: threshold,
      debugInfo: `风扇保护温差已设置为 ${threshold}°C`
    });
    wx.showToast({
      title: `已设置为${threshold}°C`,
      icon: 'success'
    });
  },

  // 显示自定义温差输入
  showCustomThreshold() {
    wx.showModal({
      title: '自定义温差',
      content: '请输入风扇保护温差值（°C）',
      editable: true,
      placeholderText: String(this.data.tempDiffThreshold),
      success: (res) => {
        if (res.confirm && res.content) {
          const value = parseInt(res.content);
          if (!isNaN(value) && value > 0 && value <= 50) {
            this.setData({
              tempDiffThreshold: value,
              debugInfo: `风扇保护温差已设置为 ${value}°C`
            });
            wx.showToast({
              title: `已设置为${value}°C`,
              icon: 'success'
            });
          } else {
            wx.showToast({
              title: '请输入有效数值(1-50)',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 其他实用功能
  generateClientId() {
    const clientId = 'miniprogram_' + Math.random().toString(16).substr(2, 8);
    this.setData({
      'serverConfig.clientId': clientId
    });
    return clientId;
  },

  onUnload() {
    this.saveData();
    if (this.data.isConnected) {
      mqttClient.disconnect();
    }
  },

  onShareAppMessage() {
    return {
      title: '物联网控制中心',
      path: '/pages/index/index'
    };
  }
});
