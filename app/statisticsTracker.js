const fs = require('fs');

module.exports = function (app) {

    //Fun stats tracker. Non-interactive.
    var cameOnlineAt = new Date();
    app.get('/admin/sweet-stats', function (req, res) {
        var currentTime = new Date();
        var uptime = new Date(currentTime - cameOnlineAt).toISOString().slice(11, -1);
        Post.count().then(numberOfPosts => {
            Image.count().then(numberOfImages => {
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
            var loggedInUserData = req.user;
            res.render('asyncPage', {
                getUrl: "/admin/justpostgraph",
                loggedIn: true,
                loggedInUserData: loggedInUserData
            });
        } else {
            res.render('asyncPage', {
                getUrl: "/admin/justpostgraph",
                loggedIn: false
            });
        }
    });

    var postTablePromise = null;
    //this function just checks if the file with the post totals by day exists and is up to date and then builds the graph from it if it does and is
    //and calls the function that creates the csv and waits for it to finish if it doesn't.
    app.get("/admin/justpostgraph", async function (req, res) {
        var mostRecentDate;
        if (!fs.existsSync("postTimeline.csv")) {
            if (!postTablePromise) {
                postTablePromise = rebuildPostTable();
            }
        } else if (mostRecentDate = postTableNotUpToDate()) {
            if (!postTablePromise) {
                console.log("table not up to date");
                postTablePromise = rebuildPostTable(mostRecentDate);
            }
        }
        await postTablePromise;
        postTablePromise = null;
        parseTableForGraph("postTimeline.csv").then((datapoints) => {
            res.render('partials/timeGraph', {
                layout: false,
                label: "cumulative sweet posts",
                datapoint: datapoints
            })
        })
    })
};

var postCountByDay = [];
var rebuildingPostTable = false;
var postTableFileName = "postTimeline.csv";

//Checks if the last line of the post table file describes yesterday.
function postTableNotUpToDate() {
    var lastLine = "";
    fs.readFileSync(postTableFileName, 'utf-8').split('\n').forEach(function (line) {
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

//Creates a file that contains dates and the number of posts that were stored by that date. Starts from the earliest post or the last line in the existing file (startDate).
//This function figures out the date range that our posts are in and then calls getPostsAtEndOfDay for each day, which saves the number of posts that
//were created as of that day into the postCountByDay array (not necessarily in chronological order, because the .find function is
//async and just kind of finishes whenever each time you call it.) We also tell getPostsAtEndOfDay how many days we're doing this with, and when
//postCountByDay has that many post counts stored, sortCounts is called to write all those dates into our file in order. Then we're done.
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
    //sets startdate to the date of the oldest post with a timestamp
    if (!startDate) {
        await Post.find({}).sort('timestamp').then(async posts => {
            startDate = posts[0].timestamp;
        })
    } else {
        //if we have it, startDate is passed in as the components of the last line (describing the most recent saved date) from the existing file.
        startDate = new Date(startDate[1], startDate[2], startDate[3]);
    }
    //set before to the last millisecond of the day of the oldest recorded post timestamp; the time on which we'll base our first end-of-day total.
    var before = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59, 999);

    getPostsAtEndOfDay(new Date(before)); //result saved in postCountByDay

    var totalDays = (today.getTime() - before.getTime()) / (24 * 60 * 60 * 1000) + 1; //it's plus one to account for the day before the date stored by before

    for (var i = 0; i < totalDays - 1; i++) { // it's minus one bc we already called getPostsAtEndOfDay on the first date we're looking at, the one before the date stored by before
        before.setDate(before.getDate() + 1); //the last date it loops to should be equal to the today variable. assert this maybe?
        await getPostsAtEndOfDay(new Date(before), totalDays);
    }

}

//finds how many posts were created by the end of day and calls the .find, which, when it completes, will push that day with its postCount
//property set to postCountByDay. totalDays tells the function how many days we're doing this with; when we've saved that many days into postCountByDay,
//we're assumed to be done and can call sortCounts to write all this data into our file.
async function getPostsAtEndOfDay(day, totalDays) {
    await Post.find({
        timestamp: {
            $lte: day
        }
    }).then(posts => {
        day.postCount = posts.length;
        postCountByDay.push(day);

        if (postCountByDay.length == totalDays) {
            sortCounts(postTableFileName, postCountByDay);
        }
    })
}

//this function writes the data the above functions collect about how many posts were made by such-and-such a date into a file in order. when the writing is complete,
//we are no longer rebuilding the post table and it can be accessed for creating a graph from it.
function sortCounts(filename, countByDay) {
    countByDay.sort(function (a, b) {
        return a - b
    });

    //write data in csv form, so it can be opened in excel or openoffice calc or gnumeric
    countByDay.forEach((date) => {
        fs.appendFileSync(filename, date.toDateString() + "," + date.getFullYear() + "," + date.getMonth() + "," + date.getDate());
        fs.appendFileSync(filename, "," + date.postCount);
        fs.appendFileSync(filename, "\n");
    })

    //make way for next update/rebuild
    postCountByDay = [];
}

//this is called when the file is finished and it's time to turn it's csv data into json for handlebars to parse. there's probably a
//decent argument for saving a json file in the first place, huh. this also adds a datapoint representing the current date/time/post count, which
//should be current every time we build/display the graph.
async function parseTableForGraph(filename) {
    jsonVersion = [];
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
                postcount: lineComps[4]
            });
        }
    });
    var now = new Date();
    await Post.count().then((numberOfPosts) => {
        jsonVersion.push({
            label: now.toLocaleString(),
            year: now.getFullYear(),
            month: now.getMonth(),
            date: now.getDate(),
            hour: now.getHours(),
            minute: now.getMinutes(),
            second: now.getSeconds(),
            postcount: numberOfPosts
        });
    })
    return jsonVersion;
}