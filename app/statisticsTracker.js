const fs = require('fs');

module.exports = function (app) {

    //Fun stats tracker. Non-interactive.
    var cameOnlineAt = new Date();
    app.get('/admin/sweet-stats', function (req, res) {
        var currentTime = new Date();
        var uptime = new Date(currentTime - cameOnlineAt).toISOString().slice(11, -1);
        Post.countDocuments({}).then(numberOfPosts => {
            Image.countDocuments({}).then(numberOfImages => {
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
                    var funstats = [
                        "uptime " + uptime,
                        "logged in users " + helper.loggedInUsers(),
                        "peak logged in users (since last restart) " + helper.peakLoggedInUsers(),

                        "totals... " +
                        " posts " + numberOfPosts +
                        ", images " + numberOfImages,

                        "last 24 hours... " +
                        " posts " + posts.length +
                        ", images " + daysImages +
                        ", comments " + daysReplies
                    ];
                    if (req.isAuthenticated()) {
                        var loggedInUserData = req.user;
                        res.render('systempost', {
                            postcontent: funstats,
                            loggedIn: true,
                            loggedInUserData: loggedInUserData
                        });
                    } else {
                        res.render('systempost', {
                            postcontent: funstats,
                            loggedIn: false
                        });
                    }
                })
            })
        })
    })

    //the graph may take a hot second to render, so when you navigate to the page that displays it
    //you get a little thing that tells you to wait for a second and then the page makes a request to
    //the getUrl path which leads to the route below.
    app.get("/admin/postgraph", function (req, res) {
        if (req.isAuthenticated()) {
            res.render('asyncPage', {
                getUrl: "/admin/justpostgraph",
                loggedIn: true,
                loggedInUserData: req.user
            });
        } else {
            res.render('asyncPage', {
                getUrl: "/admin/justpostgraph",
                loggedIn: false
            });
        }
    });

    app.get("/admin/usergraph", function (req, res) {
        if (req.isAuthenticated()) {
            res.render('asyncPage', {
                getUrl: "/admin/justusergraph",
                loggedIn: true,
                loggedInUserData: req.user
            });
        } else {
            res.render('asyncPage', {
                getUrl: "/admin/justusergraph",
                loggedIn: false
            });
        }
    })

    //storing a promise for the post table building function out here lets us check if the function is currently running so we don't call it again if it is
    var postTablePromise = null;
    //this function just checks if the file with the post totals by day exists and is up to date and then builds the graph from it if it does and is
    //and calls the function that creates the csv and waits for it to finish if it doesn't or isn't.
    app.get("/admin/justpostgraph", async function (req, res) {
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
        res.render('partials/timeGraph', {
            layout: false,
            label: "cumulative sweet posts",
            datapoint: datapoints
        })
    })

    //storing a promise for the user table building function out here lets us check if the function is currently running so we don't call it again if it is
    var userTablePromise = null;
    //this function just checks if the file with the user totals by day exists and is up to date and then builds the graph from it if it does and is
    //and calls the function that creates the csv and waits for it to finish if it doesn't or isn't.
    app.get("/admin/justusergraph", async function (req, res) {
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
        res.render('partials/timeGraph', {
            layout: false,
            label: "cumulative sweet users",
            datapoint: datapoints
        })
    })
};

var postTableFileName = "postTimeline.csv";
var userTableFileName = "userTimeline.csv";

//Checks if the last line of the table file describes yesterday.
function tableNotUpToDate(tableFilename) {
    var lastLine = "";
    fs.readFileSync(tableFilename, 'utf-8').split('\n').forEach(function (line) {
        if (line && line != "\n") {
            lastLine = line;
        }
    });
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastLine.split(",")[0] == yesterday.toDateString()) {
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
        fs.unlinkSync(postTableFileName);
    }

    var today = new Date(new Date().setDate(new Date().getDate() - 1));
    today.setHours(23)
    today.setMinutes(59);
    today.setSeconds(59);
    today.setMilliseconds(999); //this actually sets today to the last millisecond that counts as yesterday. that's the most recent data we're looking at for end-of-day totals.

    //before will store the end of day time upon which we'll base our first end-of-day total.
    var before;
    if (!startDate) {
        await Post.find({}).sort('timestamp').then(async posts => {
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
            timestamp: {
                $lte: sequentialDate
            }
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
        fs.unlinkSync(userTableFileName);
    }

    var today = new Date(new Date().setDate(new Date().getDate() - 1));
    today.setHours(23)
    today.setMinutes(59);
    today.setSeconds(59);
    today.setMilliseconds(999); //this actually sets today to the last millisecond that counts as yesterday. that's the most recent data we're looking at for end-of-day totals.

    //before will store the end of day time upon which we'll base our first end-of-day total.
    var before;
    if (!startDate) {
        await User.find({}).sort('joined').then(async users => {
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
            joined: {
                $lte: sequentialDate
            }
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

//this is called when the file is finished and it's time to turn it's csv data into json for handlebars to parse. there's probably a
//decent argument for saving a json file in the first place, huh. this also adds a datapoint representing the current date/time/post count, which
//should be current every time we build/display the graph.
async function parseTableForGraph(filename, collection) {
    jsonVersion = [];
    //reads in file values
    fs.readFileSync(filename, 'utf-8').split('\n').forEach(function (line) {
        if (line && line !== "\n") {
            var lineComps = line.split(",");
            jsonVersion.push({
                label: lineComps[0],
                year: lineComps[1],
                month: lineComps[2],
                date: lineComps[3],
                hour: 23,
                minute: 59,
                second: 59,
                y: lineComps[4]
            });
        }
    });
    //add in a datapoint representing the current exact second
    var now = new Date();
    await collection.countDocuments().then((numberOfDocs) => {
        jsonVersion.push({
            label: now.toLocaleString(),
            year: now.getFullYear(),
            month: now.getMonth(),
            date: now.getDate(),
            hour: now.getHours(),
            minute: now.getMinutes(),
            second: now.getSeconds(),
            y: numberOfDocs
        });
    })
    return jsonVersion;
}