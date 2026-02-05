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

    // UI状态属性
    connectAction: 'connect',
    connectionButtonText: '建立连接',

    // 数据存储
    subscribedTopics: [],
    messages: [],
    filteredMessages: [], // 过滤后的消息
    newTopic: '',
    publishTopic: '',
    publishMessage: '',

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

    // 服务器配置 - 预设为用户私有服务器
    serverConfig: {
      broker: '172.16.208.176',
      port: 8084,
      protocol: 'wss',
      clientId: '',
      username: 'hhb',  // 用户名
      password: '123456'   // 密码
    },
    presetServers: [],
    customServers: [],

    // QoS配置
    subscribeQos: 0,
    publishQos: 0,

    // 统计数据
    receivedMessageCount: 0,
    sentMessageCount: 0
  },

  onLoad() {
    console.log('Enhanced home page loaded');
    this.setupMQTTCallbacks();
    this.loadSavedData();
    this.loadServerConfig();
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
        wx.showToast({
          title: '连接成功',
          icon: 'success'
        });
      } else {
        this.handleConnectionError('连接失败');
      }
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

    mqttClient.onMessageReceived((message) => {
      console.log('Message received:', message);
      this.addMessage(message);
    });
  },

  loadSavedData() {
    try {
      const topics = wx.getStorageSync('subscribedTopics');
      const messages = wx.getStorageSync('messageHistory');

      if (topics) {
        console.log('Loaded subscribed topics:', topics);
        this.setData({
          subscribedTopics: topics
        });
      }

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
      wx.setStorageSync('subscribedTopics', this.data.subscribedTopics);
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

  subscribeTopic() {
    const topic = this.data.newTopic.trim();

    if (!topic) {
      wx.showToast({
        title: '请输入主题名称',
        icon: 'none'
      });
      return;
    }

    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先连接到MQTT服务器',
        icon: 'none'
      });
      return;
    }

    console.log('Subscribing to topic:', topic, 'QoS:', this.data.subscribeQos);

    const success = mqttClient.subscribe(topic, this.data.subscribeQos);

    if (success) {
      const topics = [...this.data.subscribedTopics, topic];
      this.setData({
        subscribedTopics: topics,
        newTopic: '',
        debugInfo: `已订阅主题: ${topic} (QoS ${this.data.subscribeQos})`
      });
      this.saveData();

      wx.showToast({
        title: '订阅成功',
        icon: 'success'
      });
    } else {
      this.setData({
        debugInfo: `订阅主题失败: ${topic}`
      });
      wx.showToast({
        title: '订阅失败',
        icon: 'none'
      });
    }
  },

  unsubscribeTopic(e) {
    const topic = e.currentTarget.dataset.topic;
    
    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先连接到MQTT服务器',
        icon: 'none'
      });
      return;
    }

    console.log('Unsubscribing from topic:', topic);
    
    mqttClient.unsubscribe(topic);
    
    const topics = this.data.subscribedTopics.filter(t => t !== topic);
    this.setData({
      subscribedTopics: topics,
      debugInfo: `已取消订阅: ${topic}`
    });
    this.saveData();
    
    wx.showToast({
      title: '已取消订阅',
      icon: 'success'
    });
  },

  publishMessage() {
    const topic = this.data.publishTopic.trim();
    const message = this.data.publishMessage.trim();

    if (!topic) {
      wx.showToast({
        title: '请输入目标主题',
        icon: 'none'
      });
      return;
    }

    if (!message) {
      wx.showToast({
        title: '请输入消息内容',
        icon: 'none'
      });
      return;
    }

    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先连接到MQTT服务器',
        icon: 'none'
      });
      return;
    }

    console.log('Publishing message to topic:', topic, 'Message:', message, 'QoS:', this.data.publishQos);

    const success = mqttClient.publish(topic, message, this.data.publishQos);

    if (success) {
      this.addMessage({
        topic: topic,
        payload: message,
        timestamp: new Date().toLocaleTimeString(),
        direction: 'sent'
      });

      this.setData({
        publishMessage: '',
        debugInfo: `消息已发送到 ${topic} (QoS ${this.data.publishQos})`
      });

      wx.showToast({
        title: '消息已发送',
        icon: 'success'
      });
    } else {
      this.setData({
        debugInfo: `发送消息失败: ${topic}`
      });
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      });
    }
  },

  // QoS 选择处理
  onSubscribeQosChange(e) {
    this.setData({
      subscribeQos: parseInt(e.detail.value)
    });
  },

  onPublishQosChange(e) {
    this.setData({
      publishQos: parseInt(e.detail.value)
    });
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
    const receivedCount = messages.filter(m => !m.direction || m.direction === 'received').length;
    const sentCount = messages.filter(m => m.direction === 'sent').length;

    this.setData({
      receivedMessageCount: receivedCount,
      sentMessageCount: sentCount
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

  // Input handlers
  onTopicInput(e) {
    this.setData({
      newTopic: e.detail.value
    });
  },

  onPublishTopicInput(e) {
    this.setData({
      publishTopic: e.detail.value
    });
  },

  onPublishMessageInput(e) {
    this.setData({
      publishMessage: e.detail.value
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
