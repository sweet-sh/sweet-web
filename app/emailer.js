const nodemailer = require("nodemailer");
const nodemailerHbs = require('nodemailer-express-handlebars');
const path = require('path');
const schedule = require('node-schedule');
const moment = require('moment');
const auth = require(global.appRoot + '/config/auth.js');

// create reusable transporter object using the default SMTP transport
transporter = nodemailer.createTransport({
    host: "box.raphaelkabo.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: 'updates@sweet.sh',
        pass: auth.mailServer
    }
});

nodemailerHbsOptions = {
    viewEngine: {
        extName: ".handlebars",
        partialsDir: global.appRoot + "/views/emails",
        defaultLayout: false // <-----   added this
    },
    viewPath: global.appRoot + "/views/emails",
    extName: ".handlebars"
};

transporter.use('compile', nodemailerHbs(nodemailerHbsOptions));

async function sendUpdateEmail(type, user) {
    email = {};
    if (type == "daily") {
        email.subject = "sweet daily update 🍭"
    } else if (type == "weekly") {
        email.subject = "sweet weekly update 🍭"
    } else {
        return;
    }
    const unreadNotifications = user.notifications.filter(n => n.seen == false);
    if (unreadNotifications && unreadNotifications.length != 0) {
        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: '"sweet 🍬" <updates@sweet.sh>', // sender address
            to: user.email,
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
        console.log("Update email sent to ", user.username, ":", info.messageId);
    }
}

var weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var jobs = {};

function scheduleEmailSendingJob(user) {
    var emailTimeComponents = user.settings.emailTime.split(':');
    if (user.settings.digestEmailFrequency == 'weekly') {
        var weekdayValue = weekdays.indexOf(user.settings.emailDay)+"";
    } else if (user.settings.digestEmailFrequency == 'daily') {
        var weekdayValue = '*'
    }
    jobs[user._id.toString()] = schedule.scheduleJob(emailTimeComponents[1] + emailTimeComponents[0] + "* * " + weekdayValue, () => {
        sendUpdateEmail(user.settings.digestEmailFrequency, user);
    })
}

User.find({
    $or: [{
            'settings.digestEmailFrequency': 'daily'
        },
        {
            'settings.digestEmailFrequency': 'weekly'
        }
    ]
}).then(users => {
    for (user of users) {
        scheduleEmailSendingJob(user);
    }
})

function updateEmailSettings(user) {
    jobs[user._id.toString()].cancel()
    if (user.settings.digestEmailFrequency == "daily" || user.settings.digestEmailFrequency == "weekly") {
        scheduleEmailSendingJob(user);
    } else {
        delete jobs[user._id.toString()];
    }
}

module.exports.sendUpdateEmail = sendUpdateEmail;
module.exports.updateEmailSettings = updateEmailSettings;