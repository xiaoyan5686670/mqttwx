// app.js
App({
  onLaunch() {
    console.log('App launched')
    
    // 清理旧的MQTT服务器配置，确保使用新的默认配置
    try {
      wx.removeStorageSync('mqttServerConfig')
      wx.removeStorageSync('customMqttServers')
      console.log('Cleaned old MQTT server configurations')
    } catch (e) {
      console.log('No old MQTT config to clean')
    }
  },
  globalData: {
    mqttClient: null,
    isConnected: false,
    subscribedTopics: [],
    messages: []
  }
})