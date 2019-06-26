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

var scheduledEmails = {};

function emailScheduler(user, justSentOne = false) {
    //usersLocalTime starts out as just the current time in the user's time zone and then we change it piece by piece to be the time that we send the next email at!
    if (user.settings.timezone == "auto") {
        var usersLocalTime = moment().tz(user.settings.autoDetectedTimeZone);
    } else {
        var usersLocalTime = moment().utcOffset(user.settings.timezone);
    }
    
    var emailTimeComps = user.settings.emailTime.split(':');
    
    //set usersLocalTime's day to that of the next email:
    if (user.settings.digestEmailFrequency == 'daily') {
        // if we're not sending today's email (so, either we've just sent it or the time at which we're supposed to send the email today has past)
        if (justSentOne || (usersLocalTime.hour() > emailTimeComps[0]) || ( usersLocalTime.hour() == emailTimeComps[1] && usersLocalTime.minute() > emailTimeComps[1])) { 
            usersLocalTime.add(1, "d");  //then make this moment take place tomorrow
        }
    } else {
        var weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        usersLocalTime.day(user.settings.emailDay);
        var emailDayIndex = weekdays.indexOf(user.settings.emailDay);
        //if we aren't sending this week's email (either we just sent one or the point at which we're supposed to send it this week has past)
        if (justSentOne || (usersLocalTime.day() > emailDayIndex) || (usersLocalTime.day() == emailDayIndex && usersLocalTime.hour() > emailTimeComps[0]) || (usersLocalTime.day() == emailDayIndex && usersLocalTime.hour() == emailTimeComps[0] && usersLocalTime.minute() > emailTimeComps[1])) {
            usersLocalTime.add(7,'d'); //then make this moment take place next week
        }
    }

    //set its hour and minutes (the seconds and milliseconds are just gonna be what they're gonna be):
    usersLocalTime.hour(emailTimeComps[0]).minute(emailTimeComps[1]); //now usersLocalTime stores the time at which the next email will be sent
    var msTillSendingTime = usersLocalTime.diff(moment()); //find the difference between that time and the current time
    scheduledEmails[user._id.toString()] = setTimeout(() => { //schedule an email sending at that time
        sendUpdateEmail(user);
        emailScheduler(user, true); //schedule their next email
    }, msTillSendingTime);
}

//whenever the server boots, schedule some mf emails
User.find({
    $or: [{
            'settings.digestEmailFrequency': 'daily'
        },
        {
            'settings.digestEmailFrequency': 'weekly'
        }
    ]
}).then(users => {
    for(user of users){
        emailScheduler(user);
    }
})

//this is called over in the settings changing code whenever a setting related to emails changes
function emailRescheduler(user){
    if(scheduledEmails[user._id.toString()]){
        clearTimeout(scheduledEmails[user._id.toString()]);
    }
    emailScheduler(user);
}

module.exports.sendUpdateEmail = sendUpdateEmail;
module.exports.emailRescheduler = emailRescheduler;