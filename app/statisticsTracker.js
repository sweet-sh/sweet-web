const fs = require('fs');
const path = require('path')
const bcrypt = require('bcrypt-nodejs')

module.exports = function (app, mongoose) {

    //Fun stats tracker. Non-interactive.
    var cameOnlineAt = new Date();
    app.get('/admin/juststats', function (req, res) {
        var currentTime = new Date();
        var uptime = new Date(currentTime - cameOnlineAt).toISOString().slice(11, -1);
        Post.countDocuments({}).then(numberOfPosts => {
            Image.countDocuments({}).then(numberOfImages => {
                mongoose.connection.db.collection('sessions', (err, collection) => {
                    collection.find().toArray(function (err, activeSessions) {
                        var numberOfActiveSessions = activeSessions.length;
                        var activeusers = [];
                        for (sesh of activeSessions) {
                            var activeuser = JSON.parse(sesh.session).passport.user;
                            if (!activeusers.includes(activeuser)) {
                                activeusers.push(activeuser);
                            }
                        }
                        var uniqueActiveSessions = activeusers.length;
                        Post.find({
                            timestamp: {
                                $gte: new Date(new Date().setDate(new Date().getDate() - 1))
                            }
                        }).then(posts => {
                            var daysImages = 0;
                            var daysReplies = 0;
                            posts.forEach(post => {
                                var imageCount = post.images.length;
                                post.comments.forEach(comment => {
                                    if (comment.images) {
                                        imageCount += comment.images.length;
                                    }
                                })
                                daysImages += imageCount;
                                daysReplies += post.comments.length;
                            });
                            var funstats =
                                "<strong>Uptime</strong> " + uptime + "<br>" +
                                "<strong>Active sessions</strong> " + numberOfActiveSessions + "<br>" +
                                "<strong>Unique active users</strong> " + uniqueActiveSessions +
                                "<hr>" +
                                "<h5>Total</h5>" +
                                "<strong>Posts</strong> " + numberOfPosts + "<br>" +
                                "<strong>Images</strong> " + numberOfImages + "<br>" +
                                "<hr>" +
                                "<h5>Last 24 hours</h5>" +
                                "<strong>Posts</strong> " + posts.length + "<br>" +
                                "<strong>Images</strong> " + daysImages + "<br>" +
                                "<strong>Comments</strong> " + daysReplies;
                            "<br>" +
                            res.status(200).send(funstats);
                        })
                    })
                })
            })
        })
    })

    app.get('/admin/stats', function (req, res) {
        if (req.isAuthenticated()) {
            res.render('asyncPage', {
                getUrl: ["/admin/juststats"],
                loggedIn: true,
                loggedInUserData: req.user
            });
        } else {
            res.render('asyncPage', {
                getUrl: ["/admin/juststats"],
                loggedIn: false
            });
        }
    })

    //the graph may take a hot second to render, so when you navigate to the page that displays it
    //you get a little thing that tells you to wait for a second and then the page makes a request to
    //the getUrl path which leads to the route below.
    app.get("/admin/postgraph", function (req, res) {
        if (req.isAuthenticated()) {
            res.render('asyncPage', {
                getUrl: ["/admin/justpostgraph"],
                loggedIn: true,
                loggedInUserData: req.user
            });
        } else {
            res.render('asyncPage', {
                getUrl: ["/admin/justpostgraph"],
                loggedIn: false
            });
        }
    });

    app.get("/admin/usergraph", function (req, res) {
        if (req.isAuthenticated()) {
            res.render('asyncPage', {
                getUrl: ["/admin/justusergraph"],
                loggedIn: true,
                loggedInUserData: req.user
            });
        } else {
            res.render('asyncPage', {
                getUrl: ["/admin/justusergraph"],
                loggedIn: false
            });
        }
    })

    app.get("/admin/allstats", function (req, res) {
        if (req.isAuthenticated()) {
            res.render('asyncPage', {
                getUrl: ["/admin/juststats", "/admin/justpostgraph", "/admin/justusergraph", "/admin/justactiveusersgraph"],
                loggedIn: true,
                loggedInUserData: req.user
            });
        } else {
            res.render('asyncPage', {
                getUrl: ["/admin/juststats", "/admin/justpostgraph", "/admin/justusergraph", "/admin/justactiveusersgraph"],
                loggedIn: false
            });
        }
    })

    //storing a promise for the post table building function out here lets us check if the function is currently running so we don't call it again if it is
    var postTablePromise = null;
    //this function just checks if the file with the post totals by day exists and is up to date and then builds the graph from it if it does and is
    //and calls the function that creates the csv and waits for it to finish if it doesn't or isn't.
    app.get("/admin/justpostgraph", async function (req, res) {
        if (userTablePromise) {
            await userTablePromise;
        }
        var mostRecentDate;
        if (!fs.existsSync(postTableFileName)) {
            if (!postTablePromise) {
                postTablePromise = rebuildPostTable();
            }
            //note that this is an assignment statement, not a comparison. tableNotUpToDate will give us false if it is up to date or the last line
            //of the file (in split/array form) otherwise, which we save in mostRecentDate to pass to rebuildPostTable so it knows where to start building from
        } else if (mostRecentDate = tableNotUpToDate(postTableFileName)) {
            if (!postTablePromise) {
                postTablePromise = rebuildPostTable(mostRecentDate);
            }
        }
        await postTablePromise;
        postTablePromise = null;
        var datapoints = await parseTableForGraph(postTableFileName, Post);
        datapoints.label = "cumulative sweet posts";
        datapoints.color = "rgb(75, 192, 192)";
        var dxdatapoints = getPerDayRate(datapoints);
        dxdatapoints.label = "sweet posts added per day";
        dxdatapoints.color = "rgb(192,75,192)";
        res.render('partials/timeGraph', {
            layout: false,
            chartName: "postGraph",
            datapoint: [datapoints, dxdatapoints]
        })
    })

    //storing a promise for the user table building function out here lets us check if the function is currently running so we don't call it again if it is
    var userTablePromise = null;
    //this function just checks if the file with the user totals by day exists and is up to date and then builds the graph from it if it does and is
    //and calls the function that creates the csv and waits for it to finish if it doesn't or isn't.
    app.get("/admin/justusergraph", async function (req, res) {
        if (postTablePromise) {
            await postTablePromise;
        }
        var mostRecentDate;
        if (!fs.existsSync(userTableFileName)) {
            if (!userTablePromise) {
                userTablePromise = rebuildUserTable();
            }
            //note that this is an assignment statement, not a comparison. tableNotUpToDate will give us false if it is up to date or the last line
            //of the file (in split/array form) otherwise, which we save in mostRecentDate to pass to rebuildUserTable so it knows where to start building from
        } else if (mostRecentDate = tableNotUpToDate(userTableFileName)) {
            if (!userTablePromise) {
                userTablePromise = rebuildUserTable(mostRecentDate);
            }
        }
        await userTablePromise;
        userTablePromise = null;
        var datapoints = await parseTableForGraph(userTableFileName, User);
        datapoints.label = "cumulative sweet users";
        datapoints.color = "rgb(75, 192, 192)";
        var dxdatapoints = getPerDayRate(datapoints);
        dxdatapoints.label = "sweet users added per day";
        dxdatapoints.color = "rgb(192,75,192)";
        res.render('partials/timeGraph', {
            layout: false,
            chartName: "userGraph",
            datapoint: [datapoints, dxdatapoints]
        })
    })

    var activeUsersTablePromise = undefined;
    app.get("/admin/justactiveusersgraph", async function (req, res) {
        var mostRecentDate;
        if (!fs.existsSync(activeUserTableFileName)) {
            if (!activeUsersTablePromise) {
                activeUsersTablePromise = rebuildActiveUsersTable();
            }
            //note that this is an assignment statement, not a comparison. tableNotUpToDate will give us false if it is up to date or the last line
            //of the file (in split/array form) otherwise, which we save in mostRecentDate to pass to rebuildUserTable so it knows where to start building from
        } else if (mostRecentDate = tableNotUpToDate(activeUserTableFileName, 3)) {
            if (!activeUsersTablePromise) {
                activeUsersTablePromise = rebuildActiveUsersTable(mostRecentDate);
            }
        }
        await activeUsersTablePromise;
        activeUsersTablePromise = undefined;
        var datapoints = await parseTableForGraph(activeUserTableFileName, null, getActiveUsersSinceLastSave);
        datapoints.label = "active sweet users during 3-day intervals";
        datapoints.color = "rgb(75, 192, 192)";
        res.render('partials/timeGraph', {
            layout: false,
            chartName: "activeUsersGraph",
            datapoint: [datapoints]
        })
    })

    app.get("/admin/activeusersgraph", function (req, res) {
        if (req.isAuthenticated()) {
            res.render('asyncPage', {
                getUrl: ["/admin/justactiveusersgraph"],
                loggedIn: true,
                loggedInUserData: req.user
            });
        } else {
            res.render('asyncPage', {
                getUrl: ["/admin/justactiveusersgraph"],
                loggedIn: false
            });
        }
    })

    app.get("/admin/resetgraphs/:password", function (req, res) {
        var passwordHash = "$2a$08$RDb0G8GsaJZ0TIC/GcpZY.7eaASgXX0HO6d5RZ7JHMmD8eiJiGaGq"
        if (req.isAuthenticated() && bcrypt.compareSync(req.params.password, passwordHash)) {
            if (!postTablePromise && fs.existsSync(postTableFileName)) {
                fs.unlinkSync(path.resolve(global.appRoot, postTableFileName));
            }
            if (!userTablePromise && fs.existsSync(userTableFileName)) {
                fs.unlinkSync(path.resolve(global.appRoot, userTableFileName));
            }
            if (!activeUsersTablePromise && fs.existsSync(activeUserTableFileName)) {
                fs.unlinkSync(path.resolve(global.appRoot, activeUserTableFileName));
            }

            res.status(200).send("thy will be done");
        } else {
            res.status(200).send("no dice")
        }
    })

    app.get("/admin/secretstuff/:password/lyds.txt", function(req, res) {
        var passwordHash = "$2a$08$RDb0G8GsaJZ0TIC/GcpZY.7eaASgXX0HO6d5RZ7JHMmD8eiJiGaGq";
        if (bcrypt.compareSync(req.params.password, passwordHash) && fs.existsSync(path.resolve(global.appRoot,"lyds.txt"))) {
            res.status(200).sendFile(path.resolve(global.appRoot, "lyds.txt"));
        }
    })
};

var postTableFileName = "postTimeline.csv";
var userTableFileName = "userTimeline.csv";
var activeUserTableFileName = "activeUsersTimeline.csv";

//Checks if the last line of the table file is for a day more recent than dateInterval days ago.
function tableNotUpToDate(tableFilename, dateInterval = 1) {
    var lastLine = "";
    fs.readFileSync(tableFilename, 'utf-8').split('\n').forEach(function (line) {
        if (line && line != "\n") {
            lastLine = line;
        }
    });
    var shouldBeInThere = new Date()
    shouldBeInThere.setDate(shouldBeInThere.getDate() - dateInterval);
    if (new Date(lastLine.split(",")[0]).getTime() > shouldBeInThere.getTime()) {
        return false;
    } else {
        //return the last line so the calling function knows what the most recent date saved is and thus what dates to update with
        return lastLine.split(",");
    }
}

//Creates a file that contains dates and the number of posts that were stored by that date. Starts from the earliest post or the
//last line in the existing file (startDate). This function figures out the date range that our posts are in and then saves the number of posts that
//were created as of that day into the postCountByDay array. Then we write all the dates into our file. Then we're done.
async function rebuildPostTable(startDate) {
    //if we're rebuilding (which means we're starting from the earliest post and don't have a startDate), we throw out any existing old version of the file.
    if (fs.existsSync(postTableFileName) && !startDate) {
        fs.unlinkSync(path.resolve(global.appRoot, postTableFileName));
    }

    var today = new Date(new Date().setDate(new Date().getDate() - 1));
    today.setHours(23)
    today.setMinutes(59);
    today.setSeconds(59);
    today.setMilliseconds(999); //this actually sets today to the last millisecond that counts as yesterday. that's the most recent data we're looking at for end-of-day totals.

    //before will store the end of day time upon which we'll base our first end-of-day total.
    var before;
    if (!startDate) {
        await Post.find({
            timestamp: {
                $exists: true
            }
        }).sort('timestamp').then(async posts => {
            before = new Date(posts[0].timestamp.getFullYear(), posts[0].timestamp.getMonth(), posts[0].timestamp.getDate(), 23, 59, 59, 999);
        })
    } else {
        //if we have it, startDate is passed in as the components of the last line (describing the most recent saved date) from the existing file.
        before = new Date(startDate[1], startDate[2], parseInt(startDate[3]) + 1, 23, 59, 59, 999); //start with the day after the most recently saved one (hence the plus one)
    }

    var totalDays = (today.getTime() - before.getTime()) / (24 * 60 * 60 * 1000) + 1; //it's plus one to account for the day before the date stored by before

    var postCountByDay = [];

    //populate postCountByDay with date objects that also have a property indicating what the post count was at the end of that day
    for (var i = 0; i < totalDays; i++) {
        var sequentialDate = new Date(before);
        await Post.find({
            $or: [{
                timestamp: {
                    $lte: sequentialDate
                }
            }, {
                timestamp: undefined
            }]
        }).then(posts => {
            sequentialDate.postCount = posts.length;
            postCountByDay.push(sequentialDate);
        })
        before.setDate(before.getDate() + 1);
    }

    //Write each line in CSV format (so it can be opened in excel or openoffice calc or gnumeric.)
    //Note that the file always ends with a \n, and this needs to be true for this code to work when appending new lines to the file
    postCountByDay.forEach((date) => {
        fs.appendFileSync(postTableFileName, date.toDateString() + "," + date.getFullYear() + "," + date.getMonth() + "," + date.getDate());
        fs.appendFileSync(postTableFileName, "," + date.postCount);
        fs.appendFileSync(postTableFileName, "\n");
    })

    //make way for next update/rebuild
    postCountByDay = [];
}

//Creates a file that contains dates and the number of users that were stored by that date. Starts from the earliest user or the
//last line in the existing file (startDate). This function figures out the date range that our users are in and then saves the number of users that
//were created as of that day into the userCountByDay array. Then we write all the dates into our file. Then we're done.
async function rebuildUserTable(startDate) {
    //if we're rebuilding (which means we're starting from the earliest user and don't have a startDate), we throw out any existing old version of the file.
    if (fs.existsSync(userTableFileName) && !startDate) {
        fs.unlinkSync(path.resolve(global.appRoot, userTableFileName));
    }

    var today = new Date(new Date().setDate(new Date().getDate() - 1));
    today.setHours(23)
    today.setMinutes(59);
    today.setSeconds(59);
    today.setMilliseconds(999); //this actually sets today to the last millisecond that counts as yesterday. that's the most recent data we're looking at for end-of-day totals.

    //before will store the end of day time upon which we'll base our first end-of-day total.
    var before;
    if (!startDate) {
        await User.find({
            joined: {
                $exists: true
            }
        }).sort('joined').then(async users => {
            before = new Date(users[0].joined.getFullYear(), users[0].joined.getMonth(), users[0].joined.getDate(), 23, 59, 59, 999);
        })
    } else {
        //if we have it, startDate is passed in as the components of the last line (describing the most recent saved date) from the existing file.
        before = new Date(startDate[1], startDate[2], parseInt(startDate[3]) + 1, 23, 59, 59, 999); //start with the day after the most recently saved one (hence the plus one)
    }

    var totalDays = (today.getTime() - before.getTime()) / (24 * 60 * 60 * 1000) + 1; //it's plus one to account for the day before the date stored by before

    var userCountByDay = [];

    //populate userCountByDay with date objects that also have a property indicating what the user count was at the end of that day
    for (var i = 0; i < totalDays; i++) {
        var sequentialDate = new Date(before);
        await User.find({
            $or: [{
                joined: {
                    $lte: sequentialDate
                }
            }, {
                joined: undefined
            }]
        }).then(users => {
            sequentialDate.userCount = users.length;
            userCountByDay.push(sequentialDate);
        })
        before.setDate(before.getDate() + 1);
    }

    //Write each line in CSV format (so it can be opened in excel or openoffice calc or gnumeric.)
    //Note that the file always ends with a \n, and this needs to be true for this code to work when appending new lines to the file
    userCountByDay.forEach((date) => {
        fs.appendFileSync(userTableFileName, date.toDateString() + "," + date.getFullYear() + "," + date.getMonth() + "," + date.getDate());
        fs.appendFileSync(userTableFileName, "," + date.userCount);
        fs.appendFileSync(userTableFileName, "\n");
    })

    //make way for next update/rebuild
    userCountByDay = [];
}

//Creates a file that contains dates and the number of users that made a post or comment during the [interval] day period ending at that date. Starts from the earliest post or the
//last line in the existing file (startDate). This function figures out how many users were active during each [interval] day interval starting at the end of the day that
//the first post was posted on and finishing on the most recent date that's the start date plus a multiple of [interval].
async function rebuildActiveUsersTable(startDate, interval = 3) {
    //if we're rebuilding (which means we're starting from the earliest post and don't have a startDate), we throw out any existing old version of the file.
    if (fs.existsSync(activeUserTableFileName) && !startDate) {
        fs.unlinkSync(path.resolve(global.appRoot, activeUserTableFileName));
    }

    var today = new Date();
    today.setHours(0)
    today.setMinutes(0);
    today.setSeconds(0);
    today.setMilliseconds(0);

    //before will store the time value for the beginning of the first day upon which we have a post
    var before;
    if (!startDate) {
        await Post.find({
            timestamp: {
                $exists: true
            }
        }).sort('timestamp').then(async posts => {
            before = new Date(posts[0].timestamp.getFullYear(), posts[0].timestamp.getMonth(), posts[0].timestamp.getDate(), 0, 0, 0, 0);
        })
    } else {
        //if we have it, startDate is passed in as the components of the last line (describing the most recent saved date) from the existing file.
        before = new Date(startDate[1], startDate[2], parseInt(startDate[3]), 0, 0, 0, 0); //our interval will start with the day most recently saved
    }

    var activeUsersByInterval = [];

    //populate activeUsersByInterval with date objects that also have a property indicating how many active users there were in the three days previous
    while(true) {
        var intervalStart = new Date(before);
        var intervalEnd = new Date(new Date(before).setDate(before.getDate() + interval));
        if(intervalEnd.getTime() >= today.getTime()){
            break;
        }
        intervalEnd.activeUserCount = await getActiveUsersForInterval(intervalStart, intervalEnd);
        activeUsersByInterval.push(intervalEnd);
        before.setDate(before.getDate() + interval);
    }

    //Write each line in CSV format (so it can be opened in excel or openoffice calc or gnumeric.)
    //Note that the file always ends with a \n, and this needs to be true for this code to work when appending new lines to the file
    activeUsersByInterval.forEach((date) => {
        fs.appendFileSync(activeUserTableFileName, date.toDateString() + "," + date.getFullYear() + "," + date.getMonth() + "," + date.getDate());
        fs.appendFileSync(activeUserTableFileName, "," + date.activeUserCount);
        fs.appendFileSync(activeUserTableFileName, "\n");
    })

    //make way for next update/rebuild
    activeUsersByInterval = [];
}

//this is a helper function that gets the number of active users during a time interval. it's called by the above function and also passed to 
//parseTableForGraph so that that function can figure out how many users were active right up until the present moment.
async function getActiveUsersForInterval(intervalStart, intervalEnd) {
        var count = await Post.aggregate([{
                //find posts that either themselves were made during this time interval or have comments that were
                '$match': {
                    '$or': [{
                        '$and': [{
                            'timestamp': {
                                '$gt': intervalStart
                            }
                        }, {
                            'timestamp': {
                                '$lte': intervalEnd
                            }
                        }]
                    }, {
                        '$and': [{
                            'comments.timestamp': {
                                '$gt': intervalStart
                            }
                        }, {
                            'comments.timestamp': {
                                '$lte': intervalEnd
                            }
                        }]
                    }]
                }
            }, {
                //these two stages create an "authors" array consisting of the author of the post and all of the comments, including the timestamp of their acts of authorship
                '$addFields': {
                    'ac': [{
                        'author': '$author',
                        'timestamp': '$timestamp'
                    }]
                }
            }, {
                '$project': {
                    '_id': '$_id',
                    'authors': {
                        '$concatArrays': [
                            '$ac', '$comments'
                        ]
                    }
                }
            }, {
                //make a new document for each act of authorship
                '$unwind': {
                    'path': '$authors'
                }
            },{
                '$match': {
                    //match only the specific acts of authorship that fall within our time interval
                    '$and': [{
                        'authors.timestamp': {
                            '$gt': intervalStart
                        }
                    }, {
                        'authors.timestamp': {
                            '$lt': intervalEnd
                        }
                    }]

                }},
                {
                    //group the matched acts of authorship into one document per author
                    '$group': {
                        '_id': '$authors.author'
                    }
                },
                {
                    //count how many documents we end up with and put it in the "numberOfAuthors" property of the result
                    '$group': {
                        '_id': null,
                        'numberOfAuthors': {
                            '$sum': 1
                        }
                    }
                }]);
            return count.length > 0 ? count[0].numberOfAuthors : 0; //the fact that it's an array isn't relevant, aggregate just assumes it's meant to return an array of documents even though we only want one here
        }

        async function getActiveUsersSinceLastSave() {
            var lastLine = "";
            fs.readFileSync(activeUserTableFileName, 'utf-8').split('\n').forEach(function (line) {
                if (line && line != "\n") {
                    lastLine = line;
                }
            });
            var lastLineSplit = lastLine.split(',');
            var lastSave = new Date(lastLineSplit[1], lastLineSplit[2], lastLineSplit[3], 0, 0, 0, 0);
            return await getActiveUsersForInterval(lastSave, new Date());
        }

        //this is called when the file is finished and it's time to turn it's csv data into json for handlebars to parse. there's probably a
        //decent argument for saving a json file in the first place, huh. this also adds a datapoint representing the current date/time/post count, which
        //should be current every time we build/display the graph. it either uses collection to query for the current y value or the callback we provide
        async function parseTableForGraph(filename, collection, callbackForCurrentY, endOfDay = true) {
            var jsonVersion = [];
            //reads in file values
            for (const line of fs.readFileSync(filename, 'utf-8').split('\n')) {
                if (line && line !== "\n") {
                    var lineComps = line.split(",");
                    jsonVersion.push({
                        label: lineComps[0],
                        year: lineComps[1],
                        month: lineComps[2],
                        date: lineComps[3],
                        hour: endOfDay ? 23 : 0,
                        minute: endOfDay ? 59 : 0,
                        second: endOfDay ? 59 : 0,
                        y: lineComps[4]
                    });
                }
            };
            //add in a datapoint representing the current exact second, if we have a source to obtain it from
            var now = new Date();
            if (collection) {
                var numberOfDocs = await collection.countDocuments();
            } else if (callbackForCurrentY) {
                var numberOfDocs = await callbackForCurrentY();
            } else {
                return jsonVersion;
            }
            jsonVersion.push({
                label: numberOfDocs == 69 ? "nice" : now.toLocaleString(),
                year: now.getFullYear(),
                month: now.getMonth(),
                date: now.getDate(),
                hour: now.getHours(),
                minute: now.getMinutes(),
                second: now.getSeconds(),
                y: numberOfDocs
            });
            return jsonVersion;
        }

        //this takes the datpoints type thing above and takes the derivative by subtracting the last date
        function getPerDayRate(datapoints) {
            var newpoints = [];
            var previousPoint = undefined;
            for (const point of datapoints) {
                var y = point.y;
                if (previousPoint) {
                    y -= previousPoint;
                }
                newpoints.push({
                    label: point.label,
                    year: point.year,
                    month: point.month,
                    date: point.date,
                    hour: point.hour,
                    minute: point.minute,
                    second: point.second,
                    y: y
                });
                previousPoint = point.y;
            }
            return newpoints;
        }