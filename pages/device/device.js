// device.js
const mqttClient = require('../../utils/mqtt.js');

Page({
  data: {
    // 连接状态
    isConnected: false,
    connectionText: '未连接',

    // 设备数据
    deviceData: {
      air_temperature_1: null,
      air_humidity_1: null,
      air_temperature_4: null,
      air_humidity_4: null,
      relay_status: 'off',
      relay_in_status: 'off'
    },

    // 自定义设备名称
    deviceNames: {
      sensor1: '传感器 1',
      sensor4: '传感器 4',
      relay: '主继电器',
      relayIn: '内部继电器'
    },

    // 数据更新时间
    lastUpdateTime: null,
    dataTimeout: false, // 数据超时状态

    // 订阅主题配置
    subscribeTopic: 'device/sensor/data',
    publishRelayTopic: 'pc/1',
    publishRelayInTopic: 'device/relay_in/control',

    // 控制状态
    isSubscribed: false,
    showTopicConfig: false,
    showNameConfig: false,

    // 主题配置输入
    subscribeInput: '',
    publishRelayInput: '',
    publishRelayInInput: '',

    // 名称配置输入
    nameSensor1Input: '',
    nameSensor4Input: '',
    nameRelayInput: '',
    nameRelayInInput: '',

    // 防抖和乐观更新状态
    isRelayChanging: false,
    relayDebounceTimer: null
  },

  onLoad() {
    console.log('Device page loaded');
    this.loadTopicConfig();
    this.loadNameConfig();
    this.setupMQTTCallbacks();
    this.updateConnectionStatus();

    // 自动订阅主题
    if (mqttClient.connected && this.data.subscribeTopic) {
      this.subscribeToDeviceTopic();
    }
  },

  onShow() {
    this.updateConnectionStatus();
  },

  setupMQTTCallbacks() {
    mqttClient.onConnect((success) => {
      if (success) {
        this.setData({ isConnected: true, connectionText: '已连接' });
        // 自动订阅
        if (this.data.subscribeTopic && !this.data.isSubscribed) {
          this.subscribeToDeviceTopic();
        }
      }
    });

    mqttClient.onDisconnect(() => {
      this.setData({
        isConnected: false,
        connectionText: '已断开',
        isSubscribed: false
      });
    });

    mqttClient.onMessageReceived((message) => {
      this.handleDeviceMessage(message);
    });
  },

  loadTopicConfig() {
    try {
      const config = wx.getStorageSync('deviceTopicConfig');
      if (config) {
        this.setData({
          subscribeTopic: config.subscribe || 'device/sensor/data',
          publishRelayTopic: config.publishRelay || 'pc/1',
          publishRelayInTopic: config.publishRelayIn || 'device/relay_in/control',
          subscribeInput: config.subscribe || 'device/sensor/data',
          publishRelayInput: config.publishRelay || 'pc/1',
          publishRelayInInput: config.publishRelayIn || 'device/relay_in/control'
        });
      }
    } catch (e) {
      console.error('Failed to load topic config:', e);
    }
  },

  loadNameConfig() {
    try {
      const config = wx.getStorageSync('deviceNameConfig');
      if (config) {
        this.setData({
          deviceNames: {
            sensor1: config.sensor1 || '传感器 1',
            sensor4: config.sensor4 || '传感器 4',
            relay: config.relay || '主继电器',
            relayIn: config.relayIn || '内部继电器'
          },
          nameSensor1Input: config.sensor1 || '传感器 1',
          nameSensor4Input: config.sensor4 || '传感器 4',
          nameRelayInput: config.relay || '主继电器',
          nameRelayInInput: config.relayIn || '内部继电器'
        });
      }
    } catch (e) {
      console.error('Failed to load name config:', e);
    }
  },

  saveTopicConfig() {
    const config = {
      subscribe: this.data.subscribeTopic,
      publishRelay: this.data.publishRelayTopic,
      publishRelayIn: this.data.publishRelayInTopic
    };
    try {
      wx.setStorageSync('deviceTopicConfig', config);
      wx.showToast({
        title: '配置已保存',
        icon: 'success'
      });
    } catch (e) {
      console.error('Failed to save topic config:', e);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },

  saveNameConfig() {
    const config = {
      sensor1: this.data.deviceNames.sensor1,
      sensor4: this.data.deviceNames.sensor4,
      relay: this.data.deviceNames.relay,
      relayIn: this.data.deviceNames.relayIn
    };
    try {
      wx.setStorageSync('deviceNameConfig', config);
      wx.showToast({
        title: '名称已保存',
        icon: 'success'
      });
    } catch (e) {
      console.error('Failed to save name config:', e);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },

  updateConnectionStatus() {
    this.setData({
      isConnected: mqttClient.connected,
      connectionText: mqttClient.connected ? '已连接' : '未连接'
    });
  },

  subscribeToDeviceTopic() {
    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先连接MQTT服务器',
        icon: 'none'
      });
      return;
    }

    const topic = this.data.subscribeTopic;
    const success = mqttClient.subscribe(topic, 0);

    if (success) {
      this.setData({ isSubscribed: true });
      console.log('Subscribed to device topic:', topic);
    } else {
      wx.showToast({
        title: '订阅失败',
        icon: 'none'
      });
    }
  },

  handleDeviceMessage(message) {
    console.log('Device message received:', message);

    // 检查是否是设备数据主题
    if (message.topic === this.data.subscribeTopic) {
      try {
        const data = JSON.parse(message.payload);

        // 当收到服务器返回的继电器状态时，解除防抖
        if (data.relay_status && this.data.isRelayChanging) {
          console.log('收到服务器状态确认，解除防抖');
          this.setData({ isRelayChanging: false });
        }

        // 兼容服务器错误拼写 realy_in_status
        const relayInStatus = data.relay_in_status || data.realy_in_status || 'off';

        // 更新设备数据
        this.setData({
          deviceData: {
            air_temperature_1: this.formatNumber(data.air_temperature_1),
            air_humidity_1: this.formatNumber(data.air_humidity_1),
            air_temperature_4: this.formatNumber(data.air_temperature_4),
            air_humidity_4: this.formatNumber(data.air_humidity_4),
            relay_status: data.relay_status || 'off',
            relay_in_status: relayInStatus
          },
          lastUpdateTime: new Date().toLocaleTimeString(),
          dataTimeout: false
        });

        // 重置超时检测
        clearTimeout(this.dataTimeoutTimer);
        this.dataTimeoutTimer = setTimeout(() => {
          this.setData({ dataTimeout: true });
        }, 30000); // 30秒无数据视为超时

      } catch (e) {
        console.error('Failed to parse device data:', e);
        console.error('Payload that failed to parse:', message.payload);
        wx.showToast({
          title: '数据解析失败',
          icon: 'none'
        });
      }
    } else if (message.topic === this.data.publishRelayInTopic) {
      // 处理内部继电器状态更新消息
      try {
        const data = JSON.parse(message.payload);
        if (data.realy_in_status) {
          this.setData({
            'deviceData.relay_in_status': data.realy_in_status,
            lastUpdateTime: new Date().toLocaleTimeString()
          });
        }
      } catch (e) {
        console.error('Failed to parse relay_in status:', e);
      }
    }
  },

  formatNumber(value) {
    if (value === null || value === undefined) return null;
    return Math.round(value * 100) / 100;
  },

  // 继电器控制
  toggleRelay() {
    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先连接MQTT服务器',
        icon: 'none'
      });
      return;
    }

    // 防抖：如果正在改变中，忽略点击
    if (this.data.isRelayChanging) {
      console.log('继电器正在改变中，忽略点击');
      return;
    }

    // 清除之前的防抖定时器
    if (this.data.relayDebounceTimer) {
      clearTimeout(this.data.relayDebounceTimer);
    }

    const newStatus = this.data.deviceData.relay_status === 'on' ? 'off' : 'on';

    // 乐观更新：立即更新 UI
    this.setData({
      isRelayChanging: true,
      'deviceData.relay_status': newStatus
    });

    const payload = JSON.stringify({ relay: newStatus });
    const success = mqttClient.publish('pc/1', payload, 0);

    if (success) {
      console.log('继电器控制命令已发送:', newStatus);

      // 防抖定时器：1秒内不允许再次点击
      const timer = setTimeout(() => {
        this.setData({ isRelayChanging: false });
      }, 1000);
      this.setData({ relayDebounceTimer: timer });

      // 乐观更新提示
      wx.showToast({
        title: `继电器已${newStatus === 'on' ? '开启' : '关闭'}`,
        icon: 'success',
        duration: 1500
      });

      // 失败回滚机制：等待2秒后检查服务器返回的状态
      setTimeout(() => {
        // 如果2秒后状态没有同步回来，说明可能失败了，需要回滚
        // 这里不做主动回滚，而是等待服务器返回的真实状态
        console.log('等待服务器状态确认...');
      }, 2000);

    } else {
      // 发送失败，回滚 UI 状态
      this.setData({
        isRelayChanging: false,
        'deviceData.relay_status': this.data.deviceData.relay_status === 'on' ? 'off' : 'on'
      });
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      });
    }
  },

  toggleRelayIn() {
    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先连接MQTT服务器',
        icon: 'none'
      });
      return;
    }

    const newStatus = this.data.deviceData.relay_in_status === 'on' ? 'off' : 'on';
    const payload = JSON.stringify({ relay_in_status: newStatus });

    const success = mqttClient.publish(this.data.publishRelayInTopic, payload, 0);

    if (success) {
      wx.showToast({
        title: `内部继电器已${newStatus === 'on' ? '开启' : '关闭'}`,
        icon: 'success'
      });
    } else {
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      });
    }
  },

  // 主题配置
  showTopicConfigDialog() {
    this.setData({ showTopicConfig: true });
  },

  hideTopicConfigDialog() {
    this.setData({ showTopicConfig: false });
  },

  // 名称配置
  showNameConfigDialog() {
    this.setData({
      showNameConfig: true,
      nameSensor1Input: this.data.deviceNames.sensor1,
      nameSensor4Input: this.data.deviceNames.sensor4,
      nameRelayInput: this.data.deviceNames.relay,
      nameRelayInInput: this.data.deviceNames.relayIn
    });
  },

  hideNameConfigDialog() {
    this.setData({ showNameConfig: false });
  },

  onSubscribeTopicInput(e) {
    this.setData({ subscribeInput: e.detail.value });
  },

  onPublishRelayTopicInput(e) {
    this.setData({ publishRelayInput: e.detail.value });
  },

  onPublishRelayInTopicInput(e) {
    this.setData({ publishRelayInInput: e.detail.value });
  },

  onNameSensor1Input(e) {
    this.setData({ nameSensor1Input: e.detail.value });
  },

  onNameSensor4Input(e) {
    this.setData({ nameSensor4Input: e.detail.value });
  },

  onNameRelayInput(e) {
    this.setData({ nameRelayInput: e.detail.value });
  },

  onNameRelayInInput(e) {
    this.setData({ nameRelayInInput: e.detail.value });
  },

  saveTopicSettings() {
    this.setData({
      subscribeTopic: this.data.subscribeInput,
      publishRelayTopic: this.data.publishRelayInput,
      publishRelayInTopic: this.data.publishRelayInInput,
      showTopicConfig: false
    });
    this.saveTopicConfig();

    // 重新订阅新主题
    if (this.data.isConnected) {
      this.subscribeToDeviceTopic();
    }
  },

  saveNameSettings() {
    this.setData({
      deviceNames: {
        sensor1: this.data.nameSensor1Input || '传感器 1',
        sensor4: this.data.nameSensor4Input || '传感器 4',
        relay: this.data.nameRelayInput || '主继电器',
        relayIn: this.data.nameRelayInInput || '内部继电器'
      },
      showNameConfig: false
    });
    this.saveNameConfig();
  },

  // 刷新数据
  refreshData() {
    if (!this.data.isConnected) {
      wx.showToast({
        title: '请先连接MQTT服务器',
        icon: 'none'
      });
      return;
    }

    if (!this.data.isSubscribed) {
      this.subscribeToDeviceTopic();
    } else {
      wx.showToast({
        title: '正在等待数据更新...',
        icon: 'none'
      });
    }
  },

  onUnload() {
    clearTimeout(this.dataTimeoutTimer);
    clearTimeout(this.data.relayDebounceTimer);
  }
});
