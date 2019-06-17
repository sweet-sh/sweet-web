const nodemailer = require("nodemailer");
const nodemailerHbs = require('nodemailer-express-handlebars');
const path = require('path');
const schedule = require('node-schedule');
const moment = require('moment');

// create reusable transporter object using the default SMTP transport
transporter = nodemailer.createTransport({
  host: "box.raphaelkabo.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'updates@sweet.sh', // generated ethereal user
    pass: 'sab8=D8ed' // generated ethereal password
  }
});

nodemailerHbsOptions = {
    viewEngine: {
      extName: ".handlebars",
      partialsDir: global.appRoot + "/views/emails",
      defaultLayout: false        // <-----   added this
    },
    viewPath: global.appRoot + "/views/emails",
    extName: ".handlebars"
  };

transporter.use('compile', nodemailerHbs(nodemailerHbsOptions));

async function sendUpdateEmail(type){

    email = {};
    if (type == "daily") {
        email.subject = "sweet daily update 🍭"
    } else if (type == "weekly") {
        email.subject = "sweet weekly update 🍭"
    } else {
        return;
    }

    User.find({
        $or: [
            { 'settings.digestEmailFrequency': 'daily' },
            { 'settings.digestEmailFrequency': 'weekly' }
        ]
    })
    .then(users => {
        users.forEach(async function(user) {
            // Check if current time on server is equivalent to 08:00 in the user's timezone
            if (moment().utcOffset(user.settings.timezone).isSame(moment("08:00","HH:mm"),"hour")) {
                const unreadNotifications = user.notifications.filter(n => n.seen == false);
                if (unreadNotifications && unreadNotifications.length != 0){
                    // send mail with defined transport object
                    let info = await transporter.sendMail({
                      from: '"sweet 🍬" <updates@sweet.sh>', // sender address
                      to: "mail@raphaelkabo.com",
                      subject: email.subject,
                      template: "update",
                      context: {
                          title: 'sweet',
                          content: [
                              'Hi <strong>@' + user.username + '</strong>!',
                              'Here\'s what went down since you last visted sweet:'
                          ],
                          notifications: unreadNotifications,
                          action: {
                              url: 'https://sweet.sh',
                              text: 'Visit sweet'
                          },
                          signoff: '— sweet x'
                      }
                    });
                    console.log("Update email sent: %s", info.messageId);
                }
            }
        })
    })
}

var sendDailyEmail = schedule.scheduleJob('0 * * * *', function(){ // Every hour
    sendUpdateEmail('daily').catch(console.error);
});

var sendWeeklyEmail = schedule.scheduleJob('0 0-23 * * 0', function(){ // Every hour on Sunday
    sendUpdateEmail('weekly').catch(console.error);
});

module.exports.sendUpdateEmail = sendUpdateEmail;
