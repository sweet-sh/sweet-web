const fs = require('fs');
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

module.exports = {
  verifyPushToken: (token) => {
    if (!Expo.isExpoPushToken(token)) {
      console.error(`Push token ${token} is not a valid Expo push token`);
      return false;
    }
    return true;
  },
  sendExpoNotifications: ({ pushTokens, title, body }) => {
    let notifications = [];
    for (let pushToken of pushTokens) {
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
        continue;
      }

      notifications.push({
        to: pushToken,
        sound: "default",
        title: title,
        body: body,
        data: { body }
      });
    }

    let chunks = expo.chunkPushNotifications(notifications);

    (async () => {
      for (const chunk of chunks) {
        try {
          const receipts = await expo.sendPushNotificationsAsync(chunk)
          console.log(receipts)
          fs.writeFile('./exporeceipts.log', receipts, (response) => {
            console.log('Write callback response:', response)
          });
        } catch (error) {
          console.error(error);
        }
      }
    })();
  }
};