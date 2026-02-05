/**
 * 消息导出工具
 * 支持多种格式导出消息数据
 */

class MessageExporter {
  /**
   * 导出为 JSON 格式
   */
  static exportToJson(messages, options = {}) {
    const exportData = {
      exportTime: new Date().toISOString(),
      messageCount: messages.length,
      filters: options.filters || {},
      messages: messages.map(msg => ({
        topic: msg.topic,
        payload: msg.payload,
        timestamp: msg.timestamp,
        direction: msg.direction
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出为 CSV 格式
   */
  static exportToCsv(messages) {
    if (messages.length === 0) {
      return '';
    }

    // CSV 头部
    const headers = ['Time', 'Topic', 'Direction', 'Message'];

    // 转义 CSV 特殊字符
    const escapeCsv = (text) => {
      if (text.includes(',') || text.includes('\n') || text.includes('"')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    // 构建 CSV 内容
    let csvContent = headers.join(',') + '\n';

    messages.forEach(msg => {
      const time = msg.timestamp || '';
      const topic = msg.topic || '';
      const direction = msg.direction === 'sent' ? '发送' : '接收';
      const payload = msg.payload || '';

      csvContent += [
        escapeCsv(time),
        escapeCsv(topic),
        escapeCsv(direction),
        escapeCsv(payload)
      ].join(',') + '\n';
    });

    return csvContent;
  }

  /**
   * 导出为 TXT 格式
   */
  static exportToTxt(messages) {
    let txtContent = `MQTT 消息导出\n`;
    txtContent += `导出时间: ${new Date().toLocaleString()}\n`;
    txtContent += `消息数量: ${messages.length}\n`;
    txtContent += `${'='.repeat(50)}\n\n`;

    messages.forEach((msg, index) => {
      txtContent += `[${index + 1}]\n`;
      txtContent += `时间: ${msg.timestamp}\n`;
      txtContent += `主题: ${msg.topic}\n`;
      txtContent += `方向: ${msg.direction === 'sent' ? '发送' : '接收'}\n`;
      txtContent += `内容: ${msg.payload}\n`;
      txtContent += `${'-'.repeat(30)}\n`;
    });

    return txtContent;
  }

  /**
   * 导出为 Markdown 格式
   */
  static exportToMarkdown(messages) {
    let mdContent = `# MQTT 消息导出\n\n`;
    mdContent += `**导出时间**: ${new Date().toLocaleString()}\n\n`;
    mdContent += `**消息数量**: ${messages.length}\n\n`;
    mdContent += `---\n\n`;

    messages.forEach((msg, index) => {
      mdContent += `## ${index + 1}. ${msg.topic}\n\n`;
      mdContent += `- **时间**: ${msg.timestamp}\n`;
      mdContent += `- **方向**: ${msg.direction === 'sent' ? '📤 发送' : '📥 接收'}\n`;
      mdContent += `- **内容**:\n\n`;
      mdContent += `\`\`\`\n${msg.payload}\n\`\`\`\n\n`;
    });

    return mdContent;
  }

  /**
   * 保存到剪贴板
   */
  static async copyToClipboard(content) {
    return new Promise((resolve, reject) => {
      wx.setClipboardData({
        data: content,
        success: () => {
          wx.showToast({
            title: '已复制到剪贴板',
            icon: 'success'
          });
          resolve(true);
        },
        fail: reject
      });
    });
  }

  /**
   * 保存到文件
   */
  static async saveToFile(content, filename) {
    try {
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/${filename}`;

      // 确保目录存在
      try {
        fs.accessSync(wx.env.USER_DATA_PATH);
      } catch (e) {
        fs.mkdirSync(wx.env.USER_DATA_PATH, true);
      }

      // 写入文件
      fs.writeFileSync(filePath, content, 'utf8');

      return {
        success: true,
        filePath: filePath
      };
    } catch (e) {
      console.error('Failed to save file:', e);
      return {
        success: false,
        error: e.message
      };
    }
  }

  /**
   * 消息统计
   */
  static getStatistics(messages) {
    const stats = {
      total: messages.length,
      sent: messages.filter(m => m.direction === 'sent').length,
      received: messages.filter(m => m.direction === 'received').length,
      topics: new Set(messages.map(m => m.topic)).size,
      byTopic: {}
    };

    // 按主题统计
    messages.forEach(msg => {
      if (!stats.byTopic[msg.topic]) {
        stats.byTopic[msg.topic] = { total: 0, sent: 0, received: 0 };
      }
      stats.byTopic[msg.topic].total++;
      if (msg.direction === 'sent') {
        stats.byTopic[msg.topic].sent++;
      } else {
        stats.byTopic[msg.topic].received++;
      }
    });

    return stats;
  }

  /**
   * 格式化统计信息
   */
  static formatStatistics(stats) {
    let text = `📊 消息统计\n\n`;
    text += `总消息数: ${stats.total}\n`;
    text += `发送消息: ${stats.sent}\n`;
    text += `接收消息: ${stats.received}\n`;
    text += `涉及主题: ${stats.topics}\n\n`;
    text += `按主题统计:\n`;

    Object.entries(stats.byTopic).forEach(([topic, data]) => {
      text += `\n📌 ${topic}\n`;
      text += `  总计: ${data.total}\n`;
      text += `  发送: ${data.sent}\n`;
      text += `  接收: ${data.received}\n`;
    });

    return text;
  }
}

module.exports = MessageExporter;
