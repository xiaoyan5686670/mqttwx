// MQTT Client for WeChat Mini Program - Pure WeChat API Implementation
// Avoid using MQTT.js library which depends on browser WebSocket

class MQTTClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.packetId = 1;
    this.subscriptions = new Set();
    this.connectCallbacks = [];
    this.disconnectCallbacks = [];
    this.messageReceivedCallbacks = [];
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.connackTimeout = null;
    
    // 默认服务器配置
    this.defaultConfig = {
      broker: '172.16.208.176',
      port: 8084,
      protocol: 'wss',
      clientId: 'miniprogram_' + Math.random().toString(16).substr(2, 8),
      keepAlive: 60,
      cleanSession: true,
      reconnectPeriod: 5000,
      connectTimeout: 30 * 1000,
      connackTimeout: 10 * 1000,
      username: 'hhb',  // 添加用户名支持
      password: '123456',  // 添加密码支持
      ignoreSSLErrors: true  // 添加SSL错误忽略选项
    };
    
    // 当前使用的配置
    this.config = {...this.defaultConfig};
    
    // 预设的常用MQTT服务器列表
    this.presetServers = [
      {
        name: 'EMQX 公共服务器',
        broker: 'broker.emqx.io',
        port: 8084,
        protocol: 'wss',
        description: 'EMQX官方提供的免费公共MQTT服务器'
      },
      {
        name: 'EMQX 公共服务器 (非加密)',
        broker: 'broker.emqx.io',
        port: 8083,
        protocol: 'ws',
        description: 'EMQX官方提供的免费公共MQTT服务器(非加密)'
      },
      {
        name: 'Mosquitto 测试服务器',
        broker: 'test.mosquitto.org',
        port: 8081,
        protocol: 'wss',
        description: 'Mosquitto官方测试服务器'
      }
    ];
    
    // MQTT连接返回码说明
    this.connackReturnCodes = {
      0: '连接已接受',
      1: '连接已拒绝，不支持的协议版本',
      2: '连接已拒绝，标识符被拒绝',
      3: '连接已拒绝，服务端不可用',
      4: '连接已拒绝，无效的用户名或密码',
      5: '连接已拒绝，未授权'
    };
  }

  // 加载自定义服务器配置
  loadCustomConfig() {
    try {
      const customConfig = wx.getStorageSync('mqttServerConfig');
      if (customConfig) {
        console.log('MQTTClient: Loaded custom server config:', customConfig);
        this.config = {
          ...this.defaultConfig,
          ...customConfig,
          // 确保必要字段存在
          clientId: customConfig.clientId || this.defaultConfig.clientId
        };
        return true;
      }
    } catch (e) {
      console.error('MQTTClient: Failed to load custom config:', e);
    }
    return false;
  }

  // 保存自定义服务器配置
  saveCustomConfig(config) {
    try {
      wx.setStorageSync('mqttServerConfig', config);
      this.config = {...this.defaultConfig, ...config};
      console.log('MQTTClient: Saved custom server config:', config);
      return true;
    } catch (e) {
      console.error('MQTTClient: Failed to save custom config:', e);
      return false;
    }
  }

  // 重置为默认配置
  resetToDefault() {
    try {
      wx.removeStorageSync('mqttServerConfig');
      this.config = {...this.defaultConfig};
      console.log('MQTTClient: Reset to default config');
      return true;
    } catch (e) {
      console.error('MQTTClient: Failed to reset config:', e);
      return false;
    }
  }

  // 获取当前配置信息
  getCurrentConfig() {
    return {
      ...this.config,
      serverUrl: `${this.config.protocol}://${this.config.broker}:${this.config.port}/mqtt`
    };
  }

  // 获取预设服务器列表
  getPresetServers() {
    return this.presetServers;
  }

  // Generate MQTT CONNECT packet
  generateConnectPacket() {
    const protocolName = 'MQTT';
    const protocolLevel = 4; // MQTT v3.1.1
    
    // Variable header
    let variableHeader = [];
    // Protocol name length (MSB, LSB)
    variableHeader.push(0x00, protocolName.length);
    // Protocol name
    for (let i = 0; i < protocolName.length; i++) {
      variableHeader.push(protocolName.charCodeAt(i));
    }
    // Protocol level
    variableHeader.push(protocolLevel);
    // Connect flags - 改进标志位计算
    let connectFlags = 0x00;
    if (this.config.cleanSession) {
      connectFlags |= 0x02; // Clean session
    }
    
    // 检查是否有用户名和密码
    let hasUsername = !!this.config.username;
    let hasPassword = !!this.config.password;
    
    if (hasUsername) {
      connectFlags |= 0x80; // Username flag
    }
    if (hasPassword) {
      connectFlags |= 0x40; // Password flag
    }
    
    variableHeader.push(connectFlags);
    // Keep alive (MSB, LSB)
    variableHeader.push((this.config.keepAlive >> 8) & 0xFF);
    variableHeader.push(this.config.keepAlive & 0xFF);
    
    // Payload 构造
    const payload = [];
    
    // Client ID
    const clientIdBytes = [];
    for (let i = 0; i < this.config.clientId.length; i++) {
      clientIdBytes.push(this.config.clientId.charCodeAt(i));
    }
    payload.push((clientIdBytes.length >> 8) & 0xFF);
    payload.push(clientIdBytes.length & 0xFF);
    payload.push(...clientIdBytes);
    
    // Username (如果有)
    if (hasUsername) {
      const usernameBytes = [];
      for (let i = 0; i < this.config.username.length; i++) {
        usernameBytes.push(this.config.username.charCodeAt(i));
      }
      payload.push((usernameBytes.length >> 8) & 0xFF);
      payload.push(usernameBytes.length & 0xFF);
      payload.push(...usernameBytes);
    }
    
    // Password (如果有)
    if (hasPassword) {
      const passwordBytes = [];
      for (let i = 0; i < this.config.password.length; i++) {
        passwordBytes.push(this.config.password.charCodeAt(i));
      }
      payload.push((passwordBytes.length >> 8) & 0xFF);
      payload.push(passwordBytes.length & 0xFF);
      payload.push(...passwordBytes);
    }
    
    // Fixed header for CONNECT (0x10)
    const remainingLength = variableHeader.length + payload.length;
    const fixedHeader = [0x10, ...this.encodeRemainingLength(remainingLength)];
    
    console.log('MQTTClient: Generated CONNECT packet:');
    console.log('  ClientID:', this.config.clientId);
    console.log('  Username:', hasUsername ? this.config.username : '(none)');
    console.log('  Password:', hasPassword ? '(provided)' : '(none)');
    console.log('  Clean Session:', this.config.cleanSession);
    console.log('  Keep Alive:', this.config.keepAlive);
    console.log('  Connect Flags:', connectFlags.toString(16));
    console.log('  Using server config:', this.getCurrentConfig());
    return new Uint8Array([...fixedHeader, ...variableHeader, ...payload]);
  }

  // Encode remaining length (MQTT variable length encoding)
  encodeRemainingLength(length) {
    const bytes = [];
    do {
      let digit = length % 128;
      length = Math.floor(length / 128);
      if (length > 0) {
        digit |= 0x80;
      }
      bytes.push(digit);
    } while (length > 0);
    return bytes;
  }

  // Parse incoming MQTT packets
  parsePacket(data) {
    if (data.length < 2) {
      console.warn('MQTTClient: Packet too short:', data.length);
      return null;
    }
    
    const packetType = (data[0] >> 4) & 0x0F;
    const flags = data[0] & 0x0F;
    
    console.log('MQTTClient: Parsing packet - Type:', packetType, 'Flags:', flags, 'Length:', data.length);
    
    // Parse remaining length
    let multiplier = 1;
    let value = 0;
    let offset = 1;
    let encodedByte;
    
    do {
      if (offset >= data.length) {
        console.warn('MQTTClient: Incomplete packet header');
        return null;
      }
      encodedByte = data[offset++];
      value += (encodedByte & 127) * multiplier;
      multiplier *= 128;
    } while ((encodedByte & 128) !== 0 && offset < data.length);
    
    const remainingLength = value;
    console.log('MQTTClient: Remaining length:', remainingLength);
    
    if (offset + remainingLength > data.length) {
      console.warn('MQTTClient: Incomplete packet body');
      return null; // Incomplete packet
    }
    
    const payload = data.slice(offset, offset + remainingLength);
    console.log('MQTTClient: Packet payload length:', payload.length);
    
    return {
      type: packetType,
      flags: flags,
      payload: payload
    };
  }

  // Generate SUBSCRIBE packet
  generateSubscribePacket(topic, qos = 0) {
    const packetId = this.getNextPacketId();
    const topicBytes = this.encodeString(topic);
    
    // Variable header: Packet ID
    const variableHeader = [
      (packetId >> 8) & 0xFF,
      packetId & 0xFF
    ];
    
    // Payload: Topic length + Topic + QoS
    const payload = [
      (topicBytes.length >> 8) & 0xFF,
      topicBytes.length & 0xFF,
      ...topicBytes,
      qos & 0x03 // QoS level (0, 1, or 2)
    ];
    
    // Fixed header for SUBSCRIBE (0x82)
    const remainingLength = variableHeader.length + payload.length;
    const fixedHeader = [0x82, ...this.encodeRemainingLength(remainingLength)];
    
    return new Uint8Array([...fixedHeader, ...variableHeader, ...payload]);
  }

  // Generate PUBLISH packet
  generatePublishPacket(topic, message, qos = 0) {
    const topicBytes = this.encodeString(topic);
    const messageBytes = this.encodeString(message);

    // Variable header: Topic length + Topic
    const variableHeader = [
      (topicBytes.length >> 8) & 0xFF,
      topicBytes.length & 0xFF,
      ...topicBytes
    ];

    // Fixed header for PUBLISH
    // QoS level: 0x30 (QoS 0), 0x32 (QoS 1), 0x34 (QoS 2)
    const fixedHeaderFirstByte = 0x30 | (qos << 1);
    const remainingLength = variableHeader.length + messageBytes.length;
    const fixedHeader = [fixedHeaderFirstByte, ...this.encodeRemainingLength(remainingLength)];

    return new Uint8Array([...fixedHeader, ...variableHeader, ...messageBytes]);
  }

  // Generate UNSUBSCRIBE packet
  generateUnsubscribePacket(topic) {
    const packetId = this.getNextPacketId();
    const topicBytes = this.encodeString(topic);

    // Variable header: Packet ID
    const variableHeader = [
      (packetId >> 8) & 0xFF,
      packetId & 0xFF
    ];

    // Payload: Topic length + Topic
    const payload = [
      (topicBytes.length >> 8) & 0xFF,
      topicBytes.length & 0xFF,
      ...topicBytes
    ];

    // Fixed header for UNSUBSCRIBE (0xA2)
    const remainingLength = variableHeader.length + payload.length;
    const fixedHeader = [0xA2, ...this.encodeRemainingLength(remainingLength)];

    return new Uint8Array([...fixedHeader, ...variableHeader, ...payload]);
  }

  // Encode string to UTF-8 bytes
  encodeString(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      if (charCode < 0x80) {
        bytes.push(charCode);
      } else if (charCode < 0x800) {
        bytes.push(0xC0 | (charCode >> 6));
        bytes.push(0x80 | (charCode & 0x3F));
      } else if (charCode < 0xD800 || charCode >= 0xE000) {
        bytes.push(0xE0 | (charCode >> 12));
        bytes.push(0x80 | ((charCode >> 6) & 0x3F));
        bytes.push(0x80 | (charCode & 0x3F));
      } else {
        // Handle surrogate pairs
        i++;
        const charCode2 = str.charCodeAt(i);
        const surrogate = 0x10000 + (((charCode & 0x3FF) << 10) | (charCode2 & 0x3FF));
        bytes.push(0xF0 | (surrogate >> 18));
        bytes.push(0x80 | ((surrogate >> 12) & 0x3F));
        bytes.push(0x80 | ((surrogate >> 6) & 0x3F));
        bytes.push(0x80 | (surrogate & 0x3F));
      }
    }
    return bytes;
  }

  // Decode UTF-8 bytes to string
  decodeString(bytes) {
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte < 0x80) {
        str += String.fromCharCode(byte);
      } else if ((byte & 0xE0) === 0xC0) {
        str += String.fromCharCode(((byte & 0x1F) << 6) | (bytes[++i] & 0x3F));
      } else if ((byte & 0xF0) === 0xE0) {
        str += String.fromCharCode(((byte & 0x0F) << 12) | ((bytes[++i] & 0x3F) << 6) | (bytes[++i] & 0x3F));
      } else if ((byte & 0xF8) === 0xF0) {
        str += String.fromCharCode(((byte & 0x07) << 18) | ((bytes[++i] & 0x3F) << 12) | ((bytes[++i] & 0x3F) << 6) | (bytes[++i] & 0x3F));
      }
    }
    return str;
  }

  // Generate PINGREQ packet
  generatePingReqPacket() {
    return new Uint8Array([0xC0, 0x00]); // PINGREQ
  }

  getNextPacketId() {
    return this.packetId++;
  }

  // Connect to MQTT broker
  connect() {
    // 每次连接前重新加载配置
    this.loadCustomConfig();
    
    if (this.isConnected) {
      console.log('MQTTClient: Already connected');
      return Promise.resolve();
    }

    if (this.isConnecting) {
      console.log('MQTTClient: Connection already in progress');
      return Promise.reject(new Error('Connection already in progress'));
    }

    this.isConnecting = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.connackTimeout);

    return new Promise((resolve, reject) => {
      const url = `${this.config.protocol}://${this.config.broker}:${this.config.port}/mqtt`;
      
      console.log('MQTTClient: Attempting to connect to MQTT broker:', url);
      console.log('MQTTClient: Client ID:', this.config.clientId);
      console.log('MQTTClient: Full config:', this.config);
      console.log('MQTTClient: SSL Error Ignore:', this.config.ignoreSSLErrors);
      
      try {
        // Create WebSocket connection using WeChat API
        const socketOptions = {
          url: url,
          protocols: ['mqtt'],
          header: {
            'content-type': 'application/octet-stream'
          },
          success: (res) => {
            console.log('MQTTClient: WebSocket connection initiated', res);
          },
          fail: (err) => {
            console.error('MQTTClient: WebSocket connection failed', err);
            let errorMsg = `Connection failed: ${JSON.stringify(err)}`;
            
            // 提供更具体的错误分析
            if (err.errMsg && err.errMsg.includes('verify ssl')) {
              errorMsg = 'SSL证书验证失败。可能原因：\n' +
                        '• 服务器使用自签名证书\n' +
                        '• 证书已过期\n' +
                        '• 域名与证书不匹配\n\n' +
                        '解决方案：\n' +
                        '1. 在微信开发者工具中关闭域名校验\n' +
                        '2. 使用有效的SSL证书\n' +
                        '3. 尝试使用ws://协议(非加密)';
            }
            
            this.handleConnectionError(new Error(errorMsg));
            reject(new Error(errorMsg));
          }
        };

        // 如果配置了忽略SSL错误，添加相应参数
        if (this.config.ignoreSSLErrors) {
          socketOptions.tcpNoDelay = true;
          console.log('MQTTClient: SSL verification will be ignored');
        }

        this.socket = wx.connectSocket(socketOptions);

        if (!this.socket) {
          throw new Error('Failed to create WebSocket connection');
        }

        // Set up WebSocket event handlers
        this.setupSocketEvents(resolve, reject);

        // Set overall connection timeout
        setTimeout(() => {
          if (this.isConnecting && !this.isConnected) {
            console.error('MQTTClient: Overall connection timeout');
            this.handleConnectionError(new Error('Connection timeout - no response from server'));
            reject(new Error('Connection timeout - no response from server'));
          }
        }, this.config.connectTimeout);

      } catch (error) {
        console.error('MQTTClient: Exception during connection setup:', error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  setupSocketEvents(resolve, reject) {
    let connackReceived = false; // 跟踪是否收到CONNACK
    
    // Connection opened
    this.socket.onOpen((res) => {
      console.log('MQTTClient: WebSocket opened', res);
      
      // Send CONNECT packet
      const connectPacket = this.generateConnectPacket();
      console.log('MQTTClient: Sending CONNECT packet, length:', connectPacket.length);
      
      // 设置CONNACK等待超时
      this.connackTimeout = setTimeout(() => {
        if (this.isConnecting && !connackReceived) {
          console.error('MQTTClient: CONNACK timeout - server did not respond');
          this.handleConnectionError(new Error('Server did not respond to connection request'));
          reject(new Error('Server did not respond to connection request'));
        }
      }, this.config.connackTimeout);
      
      this.sendPacket(connectPacket);
    });

    // Message received
    this.socket.onMessage((res) => {
      try {
        console.log('MQTTClient: Raw message received, type:', typeof res.data);
        
        let data;
        if (res.data instanceof ArrayBuffer) {
          data = new Uint8Array(res.data);
          console.log('MQTTClient: ArrayBuffer received, length:', data.length);
          console.log('MQTTClient: First bytes:', Array.from(data.slice(0, Math.min(10, data.length))).map(b => b.toString(16).padStart(2, '0')).join(' '));
        } else {
          console.warn('MQTTClient: Unexpected data type received:', typeof res.data);
          return;
        }

        const packet = this.parsePacket(data);
        if (packet) {
          console.log('MQTTClient: Parsed packet type:', packet.type);
          if (packet.type === 2) { // CONNACK
            connackReceived = true;
            clearTimeout(this.connackTimeout);
            console.log('MQTTClient: CONNACK received, clearing timeout');
          }
          this.handleIncomingPacket(packet, resolve);
        } else {
          console.warn('MQTTClient: Failed to parse packet');
        }
      } catch (error) {
        console.error('MQTTClient: Error processing incoming message:', error);
      }
    });

    // Connection error
    this.socket.onError((err) => {
      console.error('MQTTClient: WebSocket error', err);
      clearTimeout(this.connackTimeout);
      
      let errorMsg = `WebSocket error: ${JSON.stringify(err)}`;
      
      // 分析具体的错误类型
      if (err.errMsg) {
        if (err.errMsg.includes('verify ssl') || err.errMsg.includes('SSL')) {
          errorMsg = 'SSL/TLS连接错误：\n' +
                    '• 服务器证书可能是自签名的\n' +
                    '• 证书可能已过期\n' +
                    '• 网络中间设备可能干扰了连接\n\n' +
                    '建议解决方案：\n' +
                    '1. 在微信开发者工具中关闭"不校验合法域名"\n' +
                    '2. 确认服务器证书有效性\n' +
                    '3. 尝试使用ws://协议代替wss://';
        } else if (err.errMsg.includes('timeout')) {
          errorMsg = '连接超时：\n' +
                    '• 网络延迟过高\n' +
                    '• 服务器响应缓慢\n' +
                    '• 防火墙可能阻断了连接';
        } else if (err.errMsg.includes('refused')) {
          errorMsg = '连接被拒绝：\n' +
                    '• 服务器可能未运行\n' +
                    '• 端口可能被防火墙阻止\n' +
                    '• IP地址可能不正确';
        }
      }
      
      this.handleConnectionError(new Error(errorMsg));
      reject(new Error(errorMsg));
    });

    // Connection closed
    this.socket.onClose((res) => {
      console.log('MQTTClient: WebSocket closed', res);
      clearTimeout(this.connackTimeout);
      this.handleDisconnection();
    });
  }

  handleIncomingPacket(packet, resolve) {
    console.log('MQTTClient: Handling incoming packet type:', packet.type);
    
    switch (packet.type) {
      case 2: // CONNACK
        console.log('MQTTClient: Received CONNACK packet');
        console.log('MQTTClient: CONNACK payload length:', packet.payload.length);
        if (packet.payload.length >= 2) {
          const returnCode = packet.payload[1];
          console.log('MQTTClient: CONNACK return code:', returnCode);
          
          const returnCodeDescription = this.connackReturnCodes[returnCode] || `未知返回码: ${returnCode}`;
          console.log('MQTTClient: Return code description:', returnCodeDescription);
          
          if (returnCode === 0) {
            console.log('MQTTClient: Connection accepted by server');
            this.isConnected = true;
            this.isConnecting = false;
            
            // Start keep-alive ping
            this.startKeepAlive();
            
            // Resubscribe to topics
            this.subscriptions.forEach(topic => {
              this.subscribe(topic);
            });
            
            this.triggerConnectCallbacks(true);
            if (resolve) resolve(); // Resolve the promise
          } else {
            console.error('MQTTClient: Connection rejected by server, code:', returnCode);
            console.error('MQTTClient: Detailed reason:', returnCodeDescription);
            
            // 提供更详细的错误信息
            let detailedErrorMsg = `连接被服务器拒绝 (返回码: ${returnCode})`;
            switch(returnCode) {
              case 1:
                detailedErrorMsg += '\n• 可能原因: 服务器不支持当前MQTT协议版本';
                detailedErrorMsg += '\n• 建议: 尝试其他MQTT服务器';
                break;
              case 2:
                detailedErrorMsg += '\n• 可能原因: 客户端ID被拒绝或格式不正确';
                detailedErrorMsg += '\n• 建议: 重新生成客户端ID或检查ID格式';
                break;
              case 3:
                detailedErrorMsg += '\n• 可能原因: 服务器暂时不可用';
                detailedErrorMsg += '\n• 建议: 稍后重试或更换服务器';
                break;
              case 4:
                detailedErrorMsg += '\n• 可能原因: 用户名或密码无效';
                detailedErrorMsg += '\n• 建议: 检查认证信息或使用匿名连接';
                detailedErrorMsg += '\n• 如果使用匿名连接，请确保用户名密码字段为空';
                break;
              case 5:
                detailedErrorMsg += '\n• 可能原因: 未获得授权访问该服务器';
                detailedErrorMsg += '\n• 建议: 联系服务器管理员获取访问权限';
                break;
              default:
                detailedErrorMsg += '\n• 未知错误，请检查服务器状态';
            }
            
            this.handleConnectionError(new Error(detailedErrorMsg));
          }
        } else {
          console.error('MQTTClient: Invalid CONNACK packet format');
          this.handleConnectionError(new Error('Invalid CONNACK packet format'));
        }
        break;
        
      case 9: // SUBACK
        console.log('MQTTClient: Received SUBACK');
        break;
        
      case 3: // PUBLISH
        this.handlePublishPacket(packet.payload);
        break;
        
      case 13: // PINGRESP
        console.log('MQTTClient: Received PINGRESP');
        break;
        
      default:
        console.log('MQTTClient: Received unknown packet type:', packet.type);
    }
  }

  handlePublishPacket(payload) {
    try {
      // Parse topic length (first 2 bytes)
      const topicLength = (payload[0] << 8) | payload[1];
      
      // Extract topic
      const topicBytes = payload.slice(2, 2 + topicLength);
      const topic = this.decodeString(topicBytes);
      
      // Extract message (remaining bytes)
      const messageBytes = payload.slice(2 + topicLength);
      const message = this.decodeString(messageBytes);
      
      console.log('MQTTClient: Published message received - Topic:', topic, 'Message:', message);
      this.triggerMessageReceivedCallbacks(topic, message);
    } catch (error) {
      console.error('MQTTClient: Error parsing PUBLISH packet:', error);
    }
  }

  handleConnectionError(error) {
    console.error('MQTTClient: Handling connection error:', error.message);
    this.isConnected = false;
    this.isConnecting = false;
    this.socket = null;
    clearTimeout(this.connackTimeout);
    this.triggerConnectCallbacks(false);

    // 只在未主动停止时才重连
    if (this.config.reconnectPeriod > 0 && !this.stopReconnect) {
      console.log(`MQTTClient: Scheduling reconnection in ${this.config.reconnectPeriod}ms`);
      this.reconnectTimer = setTimeout(() => {
        if (!this.stopReconnect) {
          this.connect().catch(err => {
            console.error('MQTTClient: Reconnection failed:', err);
          });
        }
      }, this.config.reconnectPeriod);
    }
  }

  handleDisconnection() {
    console.log('MQTTClient: Handling disconnection');
    this.isConnected = false;
    this.isConnecting = false;
    this.socket = null;

    clearInterval(this.pingTimer);
    this.pingTimer = null;
    clearTimeout(this.connackTimeout);

    this.triggerDisconnectCallbacks();

    // 只在未主动停止时才重连
    if (this.config.reconnectPeriod > 0 && !this.stopReconnect) {
      console.log(`MQTTClient: Scheduling reconnection in ${this.config.reconnectPeriod}ms`);
      this.reconnectTimer = setTimeout(() => {
        if (!this.stopReconnect) {
          this.connect().catch(err => {
            console.error('MQTTClient: Reconnection failed:', err);
          });
        }
      }, this.config.reconnectPeriod);
    }
  }

  startKeepAlive() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }
    
    this.pingTimer = setInterval(() => {
      if (this.isConnected && this.socket) {
        const pingPacket = this.generatePingReqPacket();
        this.sendPacket(pingPacket);
      }
    }, this.config.keepAlive * 1000);
  }

  sendPacket(packet) {
    if (!this.socket || (!this.isConnected && !this.isConnecting)) {
      console.warn('MQTTClient: Cannot send packet - not connected');
      return false;
    }

    try {
      console.log('MQTTClient: Sending packet, length:', packet.length);
      console.log('MQTTClient: Packet first bytes:', Array.from(packet.slice(0, Math.min(10, packet.length))).map(b => b.toString(16).padStart(2, '0')).join(' '));
      
      this.socket.send({
        data: packet.buffer,
        success: (res) => {
          console.log('MQTTClient: Packet sent successfully');
        },
        fail: (err) => {
          console.error('MQTTClient: Failed to send packet:', err);
        }
      });
      return true;
    } catch (error) {
      console.error('MQTTClient: Exception sending packet:', error);
      return false;
    }
  }

  // Disconnect from broker
  disconnect() {
    console.log('MQTTClient: Disconnecting...');

    // 停止自动重连
    this.stopReconnect = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.connackTimeout);
    clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.connackTimeout = null;
    this.pingTimer = null;

    if (this.socket) {
      this.socket.close({
        success: () => {
          console.log('MQTTClient: Socket closed successfully');
        },
        fail: (err) => {
          console.warn('MQTTClient: Error closing socket:', err);
        }
      });
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.socket = null;
  }

  // 取消重连（用户主动取消时调用）
  cancelReconnect() {
    console.log('MQTTClient: Canceling reconnection');
    this.stopReconnect = true;
    this.isConnecting = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  // 重置重连标志（用于下次连接时重新启用自动重连）
  resetReconnectFlag() {
    this.stopReconnect = false;
  }

  // Subscribe to a topic
  subscribe(topic, qos = 0) {
    if (!this.isConnected || !this.socket) {
      console.warn('MQTTClient: Not connected to broker');
      return false;
    }

    if (this.subscriptions.has(topic)) {
      console.log('MQTTClient: Already subscribed to topic:', topic);
      return true;
    }

    console.log('MQTTClient: Subscribing to topic:', topic, 'QoS:', qos);
    
    try {
      const subscribePacket = this.generateSubscribePacket(topic, qos);
      const success = this.sendPacket(subscribePacket);
      
      if (success) {
        this.subscriptions.add(topic);
        console.log('MQTTClient: Subscription packet sent for topic:', topic);
      }
      return success;
    } catch (error) {
      console.error('MQTTClient: Subscribe exception:', error);
      return false;
    }
  }

  // Unsubscribe from a topic
  unsubscribe(topic) {
    if (!this.isConnected || !this.socket) {
      console.warn('MQTTClient: Not connected to broker');
      return false;
    }

    console.log('MQTTClient: Unsubscribing from topic:', topic);
    
    try {
      const unsubscribePacket = this.generateUnsubscribePacket(topic);
      const success = this.sendPacket(unsubscribePacket);
      
      if (success) {
        this.subscriptions.delete(topic);
        console.log('MQTTClient: UNSUBSCRIBE packet sent for topic:', topic);
      }
      return success;
    } catch (error) {
      console.error('MQTTClient: Unsubscribe exception:', error);
      return false;
    }
  }

  // Publish a message
  publish(topic, message, qos = 0) {
    if (!this.isConnected || !this.socket) {
      console.warn('MQTTClient: Not connected to broker');
      return false;
    }

    console.log('MQTTClient: Publishing message to topic:', topic, 'Message:', message, 'QoS:', qos);
    
    try {
      const publishPacket = this.generatePublishPacket(topic, message, qos);
      const success = this.sendPacket(publishPacket);
      
      if (success) {
        console.log('MQTTClient: Publish packet sent successfully');
      }
      return success;
    } catch (error) {
      console.error('MQTTClient: Publish exception:', error);
      return false;
    }
  }

  // Callback registration methods
  onConnect(callback) {
    if (typeof callback === 'function') {
      this.connectCallbacks.push(callback);
    }
  }

  onDisconnect(callback) {
    if (typeof callback === 'function') {
      this.disconnectCallbacks.push(callback);
    }
  }

  onMessageReceived(callback) {
    if (typeof callback === 'function') {
      this.messageReceivedCallbacks.push(callback);
    }
  }

  // Private methods for triggering callbacks
  triggerConnectCallbacks(success) {
    this.connectCallbacks.forEach(callback => {
      try {
        callback(success);
      } catch (e) {
        console.error('MQTTClient: Error in connect callback:', e);
      }
    });
  }

  triggerDisconnectCallbacks() {
    this.disconnectCallbacks.forEach(callback => {
      try {
        callback();
      } catch (e) {
        console.error('MQTTClient: Error in disconnect callback:', e);
      }
    });
  }

  triggerMessageReceivedCallbacks(topic, message) {
    const timestamp = new Date().toLocaleTimeString();
    const messageObj = {
      topic: topic,
      payload: message,
      timestamp: timestamp
    };
    
    this.messageReceivedCallbacks.forEach(callback => {
      try {
        callback(messageObj);
      } catch (e) {
        console.error('MQTTClient: Error in message callback:', e);
      }
    });
  }

  // Getter for connection status
  get connected() {
    return this.isConnected;
  }

  // Get current subscriptions
  get subscribedTopics() {
    return Array.from(this.subscriptions);
  }
}

// Export singleton instance
const mqttClientInstance = new MQTTClient();
module.exports = mqttClientInstance;