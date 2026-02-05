// device.js
const mqttClient = require('../../utils/mqtt.js');

Page({
  data: {
    // 连接状态
    isConnected: false,
    connectionText: '未连接',

    // 设备列表
    deviceList: [],
    currentDeviceId: null,

    // 当前设备配置
    currentDeviceName: '',

    // 设备数据 - 动态存储所有传感器数据
    deviceData: {},

    // 继电器状态
    relay_status: 'off',
    relay_in_status: 'off',

    // 传感器配置
    sensorConfig: [],

    // 继电器名称
    relayNames: {
      main: '主继电器',
      internal: '内部继电器'
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
    showSensorManage: false,
    showDeviceManage: false,
    showAddDevice: false,

    // 主题配置输入
    subscribeInput: '',
    publishRelayInput: '',
    publishRelayInInput: '',

    // 继电器名称输入
    nameRelayInput: '',
    nameRelayInInput: '',

    // 新增设备输入
    newDeviceName: '',
    newDeviceTopic: '',

    // 防抖和乐观更新状态
    isRelayChanging: false,
    relayDebounceTimer: null
  },

  // 默认传感器配置（用于还原）
  defaultSensorConfig: [
    { id: 'air_temperature_1', label: '传感器1', type: 'env', tempField: 'air_temperature_1', humidityField: 'air_humidity_1', unit: '°C', visible: true },
    { id: 'air_temperature_4', label: '传感器4', type: 'env', tempField: 'air_temperature_4', humidityField: 'air_humidity_4', unit: '°C', visible: true },
    { id: 'comp1_in', label: '压缩机1进温', type: 'compressor', tempField: 'comp1_in_temperature_F', unit: '°F', visible: false },
    { id: 'comp1_out', label: '压缩机1出温', type: 'compressor', tempField: 'comp1_out_temperature_F', unit: '°F', visible: false },
    { id: 'comp2_in', label: '压缩机2进温', type: 'compressor', tempField: 'comp2_in_temperature_F', unit: '°F', visible: false },
    { id: 'comp2_out', label: '压缩机2出温', type: 'compressor', tempField: 'comp2_out_temperature_F', unit: '°F', visible: false },
  ],

  onLoad() {
    console.log('Device page loaded');
    this.loadDeviceList();
    this.loadSensorConfig();
    this.loadRelayNames();
    this.loadTopicConfig();
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

  loadDeviceList() {
    try {
      const list = wx.getStorageSync('deviceList');
      if (list && list.length > 0) {
        this.setData({ deviceList: list });
        // 加载当前设备
        const currentId = wx.getStorageSync('currentDeviceId');
        console.log('Loaded currentDeviceId from storage:', currentId, 'type:', typeof currentId);
        if (currentId) {
          // 确保转换为字符串进行比较
          this.switchToDevice(String(currentId));
        } else if (list.length > 0) {
          this.switchToDevice(list[0].id);
        }
      } else {
        // 首次使用，创建默认设备
        const defaultDevice = {
          id: Date.now().toString(),
          name: '设备1',
          subscribeTopic: 'device/sensor/data',
          publishRelayTopic: 'pc/1',
          publishRelayInTopic: 'device/relay_in/control',
          createdAt: new Date().toISOString()
        };
        this.setData({
          deviceList: [defaultDevice],
          currentDeviceId: defaultDevice.id,
          currentDeviceName: defaultDevice.name,
          subscribeTopic: defaultDevice.subscribeTopic,
          publishRelayTopic: defaultDevice.publishRelayTopic,
          publishRelayInTopic: defaultDevice.publishRelayInTopic
        });
        this.saveDeviceList();
        wx.setStorageSync('currentDeviceId', defaultDevice.id);
        console.log('Created default device:', defaultDevice.id);
      }
    } catch (e) {
      console.error('Failed to load device list:', e);
    }
  },

  saveDeviceList() {
    try {
      wx.setStorageSync('deviceList', this.data.deviceList);
    } catch (e) {
      console.error('Failed to save device list:', e);
    }
  },

  loadSensorConfig() {
    try {
      const config = wx.getStorageSync('sensorConfig');
      if (config) {
        // 验证 config 是否为有效数据
        if (typeof config === 'string') {
          try {
            this.setData({ sensorConfig: JSON.parse(config) });
          } catch (parseError) {
            console.warn('Failed to parse stored sensorConfig, using default:', parseError);
            this.setData({ sensorConfig: JSON.parse(JSON.stringify(this.defaultSensorConfig)) });
          }
        } else {
          this.setData({ sensorConfig: config });
        }
      } else {
        // 首次加载，使用默认配置
        this.setData({ sensorConfig: JSON.parse(JSON.stringify(this.defaultSensorConfig)) });
      }
    } catch (e) {
      console.error('Failed to load sensor config:', e);
      this.setData({ sensorConfig: JSON.parse(JSON.stringify(this.defaultSensorConfig)) });
    }
  },

  loadRelayNames() {
    try {
      const config = wx.getStorageSync('relayNames');
      if (config) {
        this.setData({
          relayNames: config,
          nameRelayInput: config.main || '主继电器',
          nameRelayInInput: config.internal || '内部继电器'
        });
      }
    } catch (e) {
      console.error('Failed to load relay names:', e);
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

  saveSensorConfig() {
    try {
      wx.setStorageSync(`sensorConfig_${this.data.currentDeviceId}`, this.data.sensorConfig);
      wx.showToast({
        title: '配置已保存',
        icon: 'success'
      });
    } catch (e) {
      console.error('Failed to save sensor config:', e);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },

  saveRelayNames() {
    try {
      wx.setStorageSync(`relayNames_${this.data.currentDeviceId}`, this.data.relayNames);
      wx.showToast({
        title: '名称已保存',
        icon: 'success'
      });
    } catch (e) {
      console.error('Failed to save relay names:', e);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },

  stopPropagation() {
    // 阻止事件冒泡，防止点击对话框内容时关闭对话框
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

        // 更新所有传感器数据
        const newDeviceData = {};
        this.data.sensorConfig.forEach(sensor => {
          if (sensor.type === 'env') {
            newDeviceData[sensor.tempField] = this.formatNumber(data[sensor.tempField]);
            newDeviceData[sensor.humidityField] = this.formatNumber(data[sensor.humidityField]);
          } else {
            newDeviceData[sensor.tempField] = this.formatNumber(data[sensor.tempField]);
          }
        });

        this.setData({
          deviceData: newDeviceData,
          relay_status: data.relay_status || 'off',
          relay_in_status: relayInStatus,
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
            relay_in_status: data.realy_in_status,
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

    const newStatus = this.data.relay_status === 'on' ? 'off' : 'on';

    // 乐观更新：立即更新 UI
    this.setData({
      isRelayChanging: true,
      relay_status: newStatus
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
        relay_status: this.data.relay_status === 'on' ? 'off' : 'on'
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

    const newStatus = this.data.relay_in_status === 'on' ? 'off' : 'on';
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

  // 设备管理
  showDeviceManageDialog() {
    this.setData({ showDeviceManage: true });
  },

  hideDeviceManageDialog() {
    this.setData({ showDeviceManage: false });
  },

  showAddDeviceDialog() {
    this.setData({ showAddDevice: true, newDeviceName: '', newDeviceTopic: '' });
  },

  hideAddDeviceDialog() {
    this.setData({ showAddDevice: false });
  },

  onNewDeviceNameInput(e) {
    this.setData({ newDeviceName: e.detail.value });
  },

  onNewDeviceTopicInput(e) {
    this.setData({ newDeviceTopic: e.detail.value });
  },

  addDevice() {
    if (!this.data.newDeviceName.trim()) {
      wx.showToast({ title: '请输入设备名称', icon: 'none' });
      return;
    }
    if (!this.data.newDeviceTopic.trim()) {
      wx.showToast({ title: '请输入订阅主题', icon: 'none' });
      return;
    }

    const newDevice = {
      id: Date.now().toString(),
      name: this.data.newDeviceName,
      subscribeTopic: this.data.newDeviceTopic,
      publishRelayTopic: 'pc/1',
      publishRelayInTopic: 'device/relay_in/control',
      createdAt: new Date().toISOString()
    };

    this.setData({
      deviceList: [...this.data.deviceList, newDevice],
      showAddDevice: false
    });
    this.saveDeviceList();
    wx.showToast({ title: '设备已添加', icon: 'success' });

    // 切换到新设备
    this.switchToDevice(newDevice.id);
  },

  deleteDevice(event) {
    console.log('=== deleteDevice called ===');
    console.log('Full event object:', JSON.stringify(event));
    
    // 从事件对象中获取 data-id - 尝试多种方式
    let deviceId = null;
    
    // 方式1: 从 currentTarget.dataset.id 获取
    if (event.currentTarget && event.currentTarget.dataset) {
      deviceId = event.currentTarget.dataset.id;
      console.log('Method 1 - currentTarget.dataset.id:', deviceId, 'type:', typeof deviceId);
    }
    
    // 方式2: 从 target.dataset.id 获取
    if ((!deviceId || deviceId === '[object Object]') && event.target && event.target.dataset) {
      deviceId = event.target.dataset.id;
      console.log('Method 2 - target.dataset.id:', deviceId, 'type:', typeof deviceId);
    }
    
    // 方式3: 直接从 dataset 获取
    if ((!deviceId || deviceId === '[object Object]') && event.dataset) {
      deviceId = event.dataset.id;
      console.log('Method 3 - event.dataset.id:', deviceId, 'type:', typeof deviceId);
    }
    
    // 如果 deviceId 是对象，检查它的属性
    if (typeof deviceId === 'object' && deviceId !== null) {
      console.log('deviceId is object with keys:', Object.keys(deviceId));
      if (deviceId.id !== undefined) {
        deviceId = deviceId.id;
        console.log('Extracted deviceId.id:', deviceId);
      } else if (deviceId.value !== undefined) {
        deviceId = deviceId.value;
        console.log('Extracted deviceId.value:', deviceId);
      } else {
        console.log('ERROR: Cannot extract id from object');
        return;
      }
    }
    
    // 参数验证
    if (deviceId === null || deviceId === undefined || deviceId === '') {
      console.log('ERROR: deviceId is invalid:', deviceId);
      return;
    }

    if (this.data.deviceList.length <= 1) {
      wx.showToast({ title: '至少保留一个设备', icon: 'none' });
      return;
    }

    const deleteId = String(deviceId);
    console.log('Final deleteId:', deleteId);
    
    const that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该设备吗？',
      success: function(res) {
        if (res.confirm) {
          const deviceList = that.data.deviceList;
          const newList = [];
          for (let i = 0; i < deviceList.length; i++) {
            if (String(deviceList[i].id) !== deleteId) {
              newList.push(deviceList[i]);
            }
          }
          that.setData({ deviceList: newList });
          that.saveDeviceList();

          // 如果删除的是当前设备，切换到第一个设备
          if (String(that.data.currentDeviceId) === deleteId && newList.length > 0) {
            that.switchToDevice(newList[0].id);
          }
          wx.showToast({ title: '设备已删除', icon: 'success' });
        }
      }
    });
  },

  switchToDevice(event) {
    console.log('=== switchToDevice called ===');
    console.log('Full event object:', JSON.stringify(event));
    
    // 从事件对象中获取 data-id - 尝试多种方式
    let deviceId = null;
    
    // 方式1: 从 currentTarget.dataset.id 获取
    if (event.currentTarget && event.currentTarget.dataset) {
      deviceId = event.currentTarget.dataset.id;
      console.log('Method 1 - currentTarget.dataset.id:', deviceId, 'type:', typeof deviceId);
    }
    
    // 方式2: 从 target.dataset.id 获取
    if ((!deviceId || deviceId === '[object Object]') && event.target && event.target.dataset) {
      deviceId = event.target.dataset.id;
      console.log('Method 2 - target.dataset.id:', deviceId, 'type:', typeof deviceId);
    }
    
    // 方式3: 直接从 dataset 获取（某些情况下 dataset 直接在 event 上）
    if ((!deviceId || deviceId === '[object Object]') && event.dataset) {
      deviceId = event.dataset.id;
      console.log('Method 3 - event.dataset.id:', deviceId, 'type:', typeof deviceId);
    }
    
    // 如果 deviceId 是对象，检查它的属性
    if (typeof deviceId === 'object' && deviceId !== null) {
      console.log('deviceId is object with keys:', Object.keys(deviceId));
      // 尝试提取可能的 id 值
      if (deviceId.id !== undefined) {
        deviceId = deviceId.id;
        console.log('Extracted deviceId.id:', deviceId);
      } else if (deviceId.value !== undefined) {
        deviceId = deviceId.value;
        console.log('Extracted deviceId.value:', deviceId);
      } else {
        console.log('ERROR: Cannot extract id from object');
        return;
      }
    }
    
    // 参数验证
    if (deviceId === null || deviceId === undefined || deviceId === '') {
      console.log('ERROR: deviceId is invalid:', deviceId);
      return;
    }
    
    const searchId = String(deviceId);
    console.log('Final searchId:', searchId);
    
    // 使用 setTimeout 确保在下一个事件循环中执行，避免数据竞争
    const that = this;
    setTimeout(function() {
      const deviceList = that.data.deviceList;
      
      if (!deviceList || deviceList.length === 0) {
        console.log('ERROR: deviceList is empty');
        return;
      }
      
      // 统一使用字符串比较
      let device = null;
      for (let i = 0; i < deviceList.length; i++) {
        const listItemId = String(deviceList[i].id);
        console.log('Comparing:', listItemId, 'with', searchId);
        if (listItemId === searchId) {
          device = deviceList[i];
          console.log('Device found:', device);
          break;
        }
      }
      
      if (!device) {
        console.log('ERROR: Device not found:', searchId);
        return;
      }

      console.log('Switching to device:', device);

      // 取消旧订阅
      if (that.data.isSubscribed && that.data.subscribeTopic !== device.subscribeTopic) {
        try {
          mqttClient.unsubscribe(that.data.subscribeTopic);
        } catch (e) {
          console.error('Failed to unsubscribe:', e);
        }
      }

      const isConnected = that.data.isConnected;

      that.setData({
        currentDeviceId: device.id,
        currentDeviceName: device.name,
        subscribeTopic: device.subscribeTopic,
        publishRelayTopic: device.publishRelayTopic,
        publishRelayInTopic: device.publishRelayInTopic,
        subscribeInput: device.subscribeTopic,
        publishRelayInput: device.publishRelayTopic,
        publishRelayInInput: device.publishRelayInTopic,
        deviceData: {}, // 清空数据
        relay_status: 'off',
        relay_in_status: 'off',
        lastUpdateTime: null,
        isSubscribed: false,
        showDeviceManage: false
      });

      wx.setStorageSync('currentDeviceId', device.id);

      // 重新订阅
      if (isConnected) {
        that.subscribeToDeviceTopic();
      }

      // 加载该设备的配置
      that.loadDeviceConfig(device.id);

      wx.showToast({
        title: `已切换到${device.name}`,
        icon: 'success'
      });
    }, 0);
  },

  loadDeviceConfig(deviceId) {
    // 加载该设备的传感器配置和继电器名称
    try {
      const sensorConfig = wx.getStorageSync(`sensorConfig_${deviceId}`);
      if (sensorConfig) {
        // 验证 sensorConfig 是否为有效数据
        if (typeof sensorConfig === 'string') {
          try {
            this.setData({ sensorConfig: JSON.parse(sensorConfig) });
          } catch (parseError) {
            console.warn('Failed to parse stored sensorConfig, using default:', parseError);
            this.setData({ sensorConfig: JSON.parse(JSON.stringify(this.defaultSensorConfig)) });
          }
        } else {
          this.setData({ sensorConfig });
        }
      } else {
        this.setData({ sensorConfig: JSON.parse(JSON.stringify(this.defaultSensorConfig)) });
      }

      const relayNames = wx.getStorageSync(`relayNames_${deviceId}`);
      if (relayNames) {
        // 验证 relayNames 是否为有效数据
        if (typeof relayNames === 'string') {
          try {
            this.setData({ relayNames: JSON.parse(relayNames) });
          } catch (parseError) {
            console.warn('Failed to parse stored relayNames, using default:', parseError);
            this.setData({ relayNames: { main: '主继电器', internal: '内部继电器' } });
          }
        } else {
          this.setData({ relayNames });
        }
      } else {
        this.setData({
          relayNames: { main: '主继电器', internal: '内部继电器' }
        });
      }
    } catch (e) {
      console.error('Failed to load device config:', e);
      // 发生错误时使用默认值
      this.setData({ 
        sensorConfig: JSON.parse(JSON.stringify(this.defaultSensorConfig)),
        relayNames: { main: '主继电器', internal: '内部继电器' }
      });
    }
  },

  // 传感器管理
  showSensorManageDialog() {
    this.setData({ showSensorManage: true });
  },

  hideSensorManageDialog() {
    this.setData({ showSensorManage: false });
  },

  toggleSensorVisibility(e) {
    const index = e.currentTarget.dataset.index;
    const key = `sensorConfig[${index}].visible`;
    const currentValue = this.data.sensorConfig[index].visible;
    this.setData({ [key]: !currentValue });
  },

  resetSensorConfig() {
    wx.showModal({
      title: '确认还原',
      content: '确定要还原所有传感器配置到默认状态吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            sensorConfig: JSON.parse(JSON.stringify(this.defaultSensorConfig))
          });
          this.saveSensorConfig();
        }
      }
    });
  },

  saveSensorManageSettings() {
    this.setData({ showSensorManage: false });
    this.saveSensorConfig();
  },

  // 名称配置
  showNameConfigDialog() {
    this.setData({
      showNameConfig: true,
      nameRelayInput: this.data.relayNames.main,
      nameRelayInInput: this.data.relayNames.internal
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

  onNameRelayInput(e) {
    this.setData({ nameRelayInput: e.detail.value });
  },

  onNameRelayInInput(e) {
    this.setData({ nameRelayInInput: e.detail.value });
  },

  onSensorLabelInput(e) {
    const index = e.currentTarget.dataset.index;
    const key = `sensorConfig[${index}].label`;
    this.setData({ [key]: e.detail.value });
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
      relayNames: {
        main: this.data.nameRelayInput || '主继电器',
        internal: this.data.nameRelayInInput || '内部继电器'
      },
      showNameConfig: false
    });
    this.saveRelayNames();
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
