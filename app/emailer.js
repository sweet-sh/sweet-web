const nodemailer = require("nodemailer");
const nodemailerHbs = require('nodemailer-express-handlebars');
const path = require('path');
const schedule = require('node-schedule');
const moment = require('moment-timezone');
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

async function sendUpdateEmail(user) {
    email = {};
    if (user.settings.digestEmailFrequency == "daily") {
        email.subject = "sweet daily update 🍭"
    } else if (user.settings.digestEmailFrequency == "weekly") {
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

//do this part every 15 minutes
function searchForUsersToEmail(jobTime) {
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
            var emailTimeComps = user.settings.emailTime.split(':');
            //get the equivalent of jobTime in the user's time zone
            if (user.settings.timezone == "auto") {
                var timeInThatZone = moment(jobTime).tz(user.settings.autoDetectedTimeZone);
            } else {
                var timeInThatZone = moment(jobTime).utcOffset(user.settings.timezone);
            }
            if(timeInThatZone.hour() == emailTimeComps[0] && timeInThatZone.minute()==emailTimeComps[1]){
                if(user.settings.digestEmailFrequency=='daily' || timeInThatZone.format('dddd') == user.settings.emailDay){
                    sendUpdateEmail(user);
                }
            }
        }
    })
}

var rule = new schedule.RecurrenceRule();
rule.minute = [0, 15, 30, 45];
schedule.scheduleJob(rule, function (jobTime) {
    searchForUsersToEmail(jobTime);
});

module.exports.sendUpdateEmail = sendUpdateEmail;