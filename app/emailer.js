const nodemailer = require("nodemailer");
const nodemailerHbs = require('nodemailer-express-handlebars');
const path = require('path');
const schedule = require('node-schedule'); //no longer used!
const fs = require('fs');
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

function emailLog(message) {
    console.log(message);
    fs.appendFileSync("emailLog.txt", message + '\n');
}

var scheduledEmails = {}; //will store timeout objects representing scheduled calls to sendUpdateEmail and execution of next email scheduling code
var logFormat = "dddd, MMMM Do YYYY, h:mm a";

//utility function. note that this transforms the input object "in place", rather than returning the changed version
function putInUsersLocalTime(momentObject, user) {
    if (user.settings.timezone == "auto") {
        momentObject.tz(user.settings.autoDetectedTimeZone);
    } else {
        momentObject.utcOffset(user.settings.timezone);
    }
}

//whenever the server boots, schedule some mf emails
emailLog('\n\n---------server booting up ' + moment().format(logFormat) + ', all above log entries can be considered null and void---------\n');
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
        emailScheduler(user);
    }
})

//So. When the server boots, emailScheduler is called (above) for every user that's signed up for weekly or daily emails, and that function
//schedules a call to sendUpdateEmail for each signed-up user to be executed at the next time that they're supposed to get an email. After the call to sendUpdateEmail
//executes, emailScheduler is called for that user again to schedule the new next email they're supposed to get.
//Scheduling is done with setTimeout, and the timeout object it returns is stored in scheduledEmails. If a user changes their email settings,
//emailRescheduler is called, it cancels the timeout object stored for them in scheduledEmails, and emailScheduler is called for them
//(if they currently want emails according to the new settings.)

function emailScheduler(user, justSentOne = false) {
    //usersLocalTime starts out as just the current time in the user's time zone and then we change it piece by piece to be the time that we send the next email at!

    var usersLocalTime = moment(); //not actually in user's local time yet
    putInUsersLocalTime(usersLocalTime, user); //there we go

    var emailTimeComps = user.settings.emailTime.split(':').map(v => {
        return parseInt(v)
    });

    //set usersLocalTime's day to that of the next email:
    if (user.settings.digestEmailFrequency == 'daily') {
        // if we're not sending today's email (so, either we've just sent it or the time at which we're supposed to send the email today has past)
        if (justSentOne || (usersLocalTime.hour() > emailTimeComps[0]) || (usersLocalTime.hour() == emailTimeComps[0] && usersLocalTime.minute() > emailTimeComps[1])) {
            usersLocalTime.add(1, "d"); //then make this moment take place tomorrow
        }
    } else {
        var weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        var emailDayIndex = weekdays.indexOf(user.settings.emailDay);
        //if we aren't sending this week's email (either we just sent one or the point at which we're supposed to send it this week has past)
        if (justSentOne || (usersLocalTime.day() > emailDayIndex) || (usersLocalTime.day() == emailDayIndex && usersLocalTime.hour() > emailTimeComps[0]) || (usersLocalTime.day() == emailDayIndex && usersLocalTime.hour() == emailTimeComps[0] && usersLocalTime.minute() > emailTimeComps[1])) {
            usersLocalTime.day(user.settings.emailDay); //set the day of the week
            usersLocalTime.add(7, 'd'); //then make this moment take place next week
        } else {
            usersLocalTime.day(user.settings.emailDay); //if we're sending this week's email, we just need to set the day of the week
        }
    }

    //set its hour and minutes (the seconds and milliseconds are just gonna be what they're gonna be):
    usersLocalTime.hour(emailTimeComps[0]).minute(emailTimeComps[1]); //now usersLocalTime stores the time at which the next email will be sent
    var msTillSendingTime = usersLocalTime.diff(moment()); //find the difference between that time and the current time
    scheduledEmails[user._id.toString()] = setTimeout(() => { //schedule an email sending at that time
        sendUpdateEmail(user);
        var emailSentTime = moment();
        emailLog("sendUpdateEmail ran for " + user.username + " on " + emailSentTime.format(logFormat) + " our time, our time zone being UTC" + emailSentTime.format('Z z'));
        putInUsersLocalTime(emailSentTime, user);
        emailLog("that is equivalent to " + emailSentTime.format(logFormat) + " their time!");
        emailLog("their email time is: " + (user.settings.digestEmailFrequency == "weekly" ? user.settings.emailDay + ', ' : '') + user.settings.emailTime);
        emailLog("their time zone is: " + (user.settings.timezone == "auto" ? user.settings.autoDetectedTimeZone : user.settings.timezone));
        emailLog("their email frequency preference is: " + user.settings.digestEmailFrequency);
        emailLog('\n');
        emailScheduler(user, true); //schedule their next email
    }, msTillSendingTime);
    var nextEmailTime = moment().add(msTillSendingTime, 'ms');
    emailLog("scheduled email for user " + user.username + " to be sent on " + nextEmailTime.format(logFormat) + " our time, our time zone being UTC" + nextEmailTime.format('Z z'));
    putInUsersLocalTime(nextEmailTime, user);
    emailLog("that is equivalent to " + nextEmailTime.format(logFormat) + " their time!");
    emailLog("their email time is: " + (user.settings.digestEmailFrequency == "weekly" ? user.settings.emailDay + ', ' : '') + user.settings.emailTime);
    emailLog("their time zone is: " + (user.settings.timezone == "auto" ? user.settings.autoDetectedTimeZone : user.settings.timezone));
    emailLog("their email frequency preference is: " + user.settings.digestEmailFrequency);
    emailLog('\n');
}

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
        let info = {
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
        };
        await transporter.sendMail(info).catch(reason => {
            emailLog('could not send email to ' + user.username + '! reason given:');
            emailLog(reason)
        });
        emailLog('---email sent to '+user.username+'! contained '+unreadNotifications.length+' unread notifications---');
        /*
        //not for production, i only have this here bc i can't actually send emails and then look at them:
        console.log(info);
        var emailHTML = await hbs.render('./views/emails/update.handlebars', info.context);
        fs.writeFile(user.username + 'Email.html', emailHTML, err => {
            if (err) {
                emailLog('could not log text of email that was just sent to ' + user.username);
                emailLog('reason given: ' + err);
            }
        });
        */
    }
}

//this is called over in the settings changing code in personalAccountActions.js whenever a setting related to emails changes
function emailRescheduler(user) {
    if (scheduledEmails[user._id.toString()]) {
        clearTimeout(scheduledEmails[user._id.toString()]);
        emailLog('cancelled emails for ' + user.username + '!');
    }
    if(user.settings.digestEmailFrequency != "none"){
        emailScheduler(user);
    }
}

module.exports.sendUpdateEmail = sendUpdateEmail;
//export this so it can be called upon email settings changing
module.exports.emailRescheduler = emailRescheduler;