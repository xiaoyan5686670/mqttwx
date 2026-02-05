// app.js
App({
  onLaunch() {
    console.log('App launched')
  },
  globalData: {
    mqttClient: null,
    isConnected: false,
    subscribedTopics: [],
    messages: []
  }
})