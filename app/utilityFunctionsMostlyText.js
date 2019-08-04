const Autolinker = require('autolinker');
var sanitize = require('mongo-sanitize');
var sanitizeHtml = require('sanitize-html');
const urlp = require('url');
const metascraper = require('metascraper')([
    require('metascraper-description')(),
    require('metascraper-image')(),
    require('metascraper-title')(),
    require('metascraper-url')()
]);
const request = require('request');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path')

//todo: put these in a sensible order
module.exports = {
    // Parses new post and new comment content. Input: a text string. Output: a parsed text string.
    parseText: async function(rawText, cwsEnabled = false, mentionsEnabled = true, hashtagsEnabled = true, urlsEnabled = true) {
        console.log("Parsing content")

        if (rawText.ops) { //
            var parsedDelta = await this.parseDelta(rawText);
            rawText = parsedDelta.text;
            var inlineElements = parsedDelta.inlineElements;
        } else {
            var inlineElements = [];
        }
        let splitContent = rawText.split('</p>');
        let parsedContent = [];
        var mentionRegex = /(^|[^@\w])@([\w-]{1,30})[\b-]*/g
        var mentionReplace = '$1<a href="/$2">@$2</a>';
        var hashtagRegex = /(^|>|\n|\ |\t)#(\w{1,60})\b/g
        var hashtagReplace = '$1<a href="/tag/$2">#$2</a>';
        splitContent.forEach(function(line) {
            line += '</p>'
            if (line.replace(/<[^>]*>/g, "") != "") { // Filters out lines which are just HTML tags
                if (urlsEnabled) {
                    line = Autolinker.link(line);
                }
                if (mentionsEnabled) {
                    line = line.replace(mentionRegex, mentionReplace)
                }
                if (hashtagsEnabled) {
                    line = line.replace(hashtagRegex, hashtagReplace);
                }
                parsedContent.push(line);
            }
        })
        parsedContent = parsedContent.join('');
        parsedContent = sanitize(parsedContent);

        parsedContent = this.sanitizeHtmlForSweet(parsedContent);

        if (!cwsEnabled) {
            let contentWordCount = wordCount(parsedContent);
            if (contentWordCount > 160) {
                parsedContent = '<div class="abbreviated-content">' + parsedContent + '</div><button type="button" class="button grey-button show-more" data-state="contracted">Show more</button>';
            }
        }

        let mentionsArray = Array.from(new Set(rawText.replace(/<[^>]*>/g, " ").match(mentionRegex)))
        let tagsArray = Array.from(new Set(rawText.replace(/<[^>]*>/g, " ").match(hashtagRegex)))
        let trimmedMentions = []
        let trimmedTags = []
        if (mentionsArray) {
            mentionsArray.forEach((el) => {
                trimmedMentions.push(el.replace(/(@|\s)*/i, ''));
            })
        }
        if (tagsArray) {
            tagsArray.forEach((el) => {
                trimmedTags.push(el.replace(/(#|\s)*/i, ''));
            })
        }

        return {
            text: parsedContent,
            mentions: trimmedMentions,
            tags: trimmedTags,
            inlineElements: inlineElements
        };
    },
    //i'm gonna keep it real, i did not expect this to get this complicated
    parseDelta: async function(delta) {
        //taken from https://stackoverflow.com/questions/19377262/regex-for-youtube-url
        var youtubeUrlFindingRegex = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/
        //taken from https://github.com/regexhq/vimeo-regex/blob/master/index.js
        var vimeoUrlFindingRegex = /^(http|https)?:\/\/(www\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|)(\d+)(?:|\/\?)$/
        var linesOfParsedString = ["<p>"];

        var inlineElements = [];
        var imagesAdded = 0;
        var linkPreviewsAdded = 0;
        const imagesAllowed = 4;
        const linkPreviewsAllowed = 4;

        var linesFinished = 0; // the assumption is that the rest of the text parsing (in parseText) will not add or remove any lines
        var withinList = false;
        var lineOpen = true;
        for (op of delta.ops) {
            if (typeof op.insert == "string" && (op.insert !== "" || op.attributes)) {
                op.insert = this.escapeHTMLChars(op.insert);
                lineOpen = true;
                var formattingStartTags = "";
                var formattingEndTags = "";
                if (op.attributes) {
                    // blockquote and list formatted lines end with "\n"s with that formatting attached, that's the only way you can tell what they are
                    if (op.attributes.blockquote) {
                        if (withinList) {
                            withinList = false;
                            linesOfParsedString[linesOfParsedString.length - 2] += "</ul>";
                            linesOfParsedString[linesOfParsedString.length - 1] = "<blockquote>" + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1].length) + "</blockquote>";
                            linesFinished++;
                            linesOfParsedString.push("<p>");
                        } else {
                            linesOfParsedString[linesOfParsedString.length - 1] = "<blockquote>" + linesOfParsedString[linesOfParsedString.length - 1].substring(3, linesOfParsedString[linesOfParsedString.length - 1].length) + "</blockquote>";
                            linesFinished++;
                            linesOfParsedString.push("<p>");
                        }
                        continue;
                    } else if (op.attributes.list == "bullet") {
                        if (!withinList) {
                            withinList = true;
                            linesOfParsedString[linesOfParsedString.length - 1] = "<ul><li>" + linesOfParsedString[linesOfParsedString.length - 1].substring(3, linesOfParsedString[linesOfParsedString.length - 1].length) + "</li>";
                            linesFinished++;
                            linesOfParsedString.push("<li>");
                            continue;
                        } else {
                            linesOfParsedString[linesOfParsedString.length - 1] += "</li>";
                            linesFinished++;
                            linesOfParsedString.push("<li>");
                            continue;
                        }
                    }
                    //other formatting is attached directly to the text it applies to
                    if (op.attributes.bold) {
                        formattingStartTags = "<strong>" + formattingStartTags;
                        formattingEndTags = formattingEndTags + "</strong>";
                    }
                    if (op.attributes.italic) {
                        formattingStartTags = "<em>" + formattingStartTags;
                        formattingEndTags = formattingEndTags + "</em>";
                    }
                    if (op.attributes.link) {
                        formattingStartTags = '<a href="' + op.attributes.link + '" target="_blank">' + formattingStartTags;
                        formattingEndTags = formattingEndTags + "</a>";
                    }
                }
                var lines = op.insert.split('\n');
                linesOfParsedString[linesOfParsedString.length - 1] += formattingStartTags + lines[0] + formattingEndTags;
                for (var i = 1; i < lines.length; i++) {
                    if (withinList) {
                        withinList = false;
                        linesOfParsedString[linesOfParsedString.length - 2] += "</ul>";
                        linesOfParsedString[linesOfParsedString.length - 1] = "<p>" + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1].length);
                    }
                    linesOfParsedString[linesOfParsedString.length - 1] += "</p>";
                    linesFinished++;
                    linesOfParsedString.push("<p>" + formattingStartTags + lines[i] + formattingEndTags);
                }
            } else if (op.insert.LinkPreview && linkPreviewsAdded <= linkPreviewsAllowed) {
                //i'm assuming that there will always be a newline text insert in the text right before an inline embed
                var embed = op.attributes;
                embed.type = "link-preview";
                embed.position = linesFinished;
                embed.linkUrl = (op.insert.LinkPreview.includes("//") ? "" : "//") + op.insert.LinkPreview;
                if (youtubeUrlFindingRegex.test(op.insert.LinkPreview)) {
                    embed.isEmbeddableVideo = true;
                    embed.embedUrl = "https://www.youtube.com/embed/" + youtubeUrlFindingRegex.exec(op.insert.LinkPreview)[5] + "?autoplay=1";
                } else if (vimeoUrlFindingRegex.test(op.insert.LinkPreview)) {
                    embed.isEmbeddableVideo = true;
                    embed.embedUrl = "https://www.youtube.com/embed/" + vimeoUrlFindingRegex.exec(op.insert.LinkPreview)[4] + "?autoplay=1";
                } else {
                    embed.isEmbeddableVideo = false;
                }
                inlineElements.push(embed);
                linkPreviewsAdded++;

                console.log("link preview on line: " + linesFinished);
                console.log("it is to " + op.insert.LinkPreview);
                if (embed.isEmbeddableVideo) {
                    console.log("it is an embeddable video");
                }
            } else if (op.insert.PostImage && imagesAdded <= imagesAllowed && op.attributes.imageURL != "loading...") {
                if (imagesAdded > 0 && inlineElements[inlineElements.length - 1].type == "image(s)" && inlineElements[inlineElements.length - 1].position == linesFinished) {
                    var image = inlineElements[inlineElements.length - 1]; //the below should modify this actual array element
                } else {
                    var image = { images: [], imageDescriptions: [], position: linesFinished, type: "image(s)" };
                    inlineElements.push(image);
                }
                image.images.push(op.attributes.imageURL);
                image.imageDescriptions.push(op.attributes.description);
                imagesAdded++;

                console.log("image on line: " + linesFinished);
                console.log("its file name will be " + op.attributes.imageURL);
                console.log("its description is " + op.attributes.description);
            }
        }
        if (withinList) {
            if (typeof delta.ops[delta.ops.length - 1].insert == "string" && (!delta.ops[delta.ops.length - 1].attributes || !delta.ops[delta.ops.length - 1].attributes.list)) {
                linesOfParsedString[linesOfParsedString.length - 2] += "</ul>";
                linesOfParsedString[linesOfParsedString.length - 1] = "<p>" + linesOfParsedString[linesOfParsedString.length - 1].substring(4, linesOfParsedString[linesOfParsedString.length - 1].length) + "</p>";
            } else {
                linesOfParsedString[linesOfParsedString.length - 2] += "</ul>";
                linesOfParsedString.pop();
            }
        } else {
            if ((typeof delta.ops[delta.ops.length - 1].insert != "string")) {
                linesOfParsedString.pop();
            } else {
                linesOfParsedString[linesOfParsedString.length - 1] += "</p>"
            }
        }
        console.log("finished html:");
        console.log(linesOfParsedString.join("\n"));
        return { text: linesOfParsedString.join(""), inlineElements: inlineElements };
    },
    isEven: function(n) {
        return n % 2 == 0;
    },
    isOdd: function(n) {
        return Math.abs(n % 2) == 1;
    },
    //takes a post or comment, returns the version with updated inlineElements array and cache if needed or nothing if not
    checkLinkPreviews: async function(postOrComment) {
        var changed = false;

        function compareProp(prop) {
            if (l[prop] != meta[prop]) {
                console.log("link preview in document " + postOrComment._id.toString() + " had " + prop + " " + l[prop] + " but the live page for url " + l.linkUrl + " had " + prop + " " + meta[prop]);
                l[prop] = meta[prop];
                changed = true;
                return true;
            }
            return false;
        }
        for (var i = 0; i < postOrComment.inlineElements.length; i++) {
            var l = postOrComment.inlineElements[i];
            if (l.type == "link-preview") {
                try {
                    var meta = await this.getLinkMetadata(l.linkUrl);
                    compareProp('description');
                    compareProp('title');
                    compareProp('image');
                    compareProp('domain');
                } catch (e) {
                    changed = true;
                    postOrComment.inlineElements.splice(i, 1); //remove link preview if metadata cannot be confirmed
                }
            }
            if (changed) {
                return (await this.updateHTMLCache(postOrComment));
            } else {
                return;
            }
        }
    },
    //stolen from mustache.js (https://github.com/janl/mustache.js/blob/master/mustache.js#L73) via stack overflow (https://stackoverflow.com/questions/24816/escaping-html-strings-with-jquery)
    escapeHTMLChars: function(string) {
        var entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;',
            '\t': '&emsp;' //this one is my idea
        };
        return String(string).replace(/[&<>"'`=\/\t]/g, function(s) {
            return entityMap[s];
        });
    },
    slugify: function(string) {
        const a = 'àáäâãåăæçèéëêǵḧìíïîḿńǹñòóöôœṕŕßśșțùúüûǘẃẍÿź·/_,:;'
        const b = 'aaaaaaaaceeeeghiiiimnnnoooooprssstuuuuuwxyz------'
        const p = new RegExp(a.split('').join('|'), 'g')

        return string.toString().toLowerCase()
            .replace(/\s+/g, '-') // Replace spaces with -
            .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
            .replace(/&/g, '-and-') // Replace & with 'and'
            .replace(/[^\w\-]+/g, '') // Remove all non-word characters
            .replace(/\-\-+/g, '-') // Replace multiple - with single -
            .replace(/^-+/, '') // Trim - from start of text
            .replace(/-+$/, '') // Trim - from end of text
    },
    sanitizeHtmlForSweet: function(parsedContent) {
        return sanitizeHtml(parsedContent, {
            allowedTags: ['blockquote', 'ul', 'li', 'em', 'i', 'b', 'strong', 'a', 'p', 'br'],
            allowedAttributes: {
                'a': ['href', 'target']
            },
            transformTags: {
                'a': function(tagName, attribs) {
                    //if a link is not explicitly relative due to an initial / (like mention and hashtag links are) and doesn't already include the // that makes it non-relative
                    if (attribs.href.substring(0, 1) != "/" && !attribs.href.includes('//')) {
                        //make the link explicitly non-relative
                        attribs.href = "//" + attribs.href;
                    }
                    attribs.target = "_blank";
                    return {
                        tagName: 'a',
                        attribs: attribs
                    };
                }
            }
        });
    },
    getLinkMetadata: async function(url) {
        //standardize url protocol so that request() will accept it. (request() will automatically change the http to https if necessary)
        if (!url.includes('//')) {
            url = 'http://' + url;
        } else if (url.substring(0, 2) == "//") {
            url = "http:" + url;
        }
        var urlreq = new Promise(function(resolve, reject) {
            request({ url: url, gzip: true }, function(error, response, body) {
                if (error) {
                    reject();
                } else {
                    resolve(body);
                }
            });
        })
        const html = await urlreq;
        const metadata = await metascraper({ html, url })
        return {
            image: metadata.image,
            title: metadata.title,
            description: metadata.description,
            domain: urlp.parse(url).hostname
        }
    },
    //DEPRECATED
    mixInEmbeds: function(post) { //actually, can also be a comment
        if (post.embeds && post.embeds.length > 0) {
            var index = 0;
            var withEmbeds = "";
            if (post.embeds.length == 1 && typeof post.embeds[0].position == "undefined") { //old, positionless single embed scheme
                return post.parsedContent + post.cachedHTML.embedsHTML[0];
            } else {
                for (var i = 0; i < post.embeds.length; i++) { //new, positioned embed scheme
                    withEmbeds += post.parsedContent.substring(index, post.embeds[i].position);
                    withEmbeds += post.cachedHTML.embedsHTML[i];
                    index = post.embeds[i].position;
                }
                withEmbeds += post.parsedContent.substring(post.embeds[post.embeds.length - 1].position, post.parsedContent.length);
                return withEmbeds;
            }
        }
    },
    //moves them out of temp storage, creates image documents for them in the database, and returns arrays with their horizontality/verticality
    //the non-first arguments are just stored in the image documents in the database. postType is "user" or "community"
    finalizeImages: async function(imageFileNames, postType, posterID, privacy, postImageQuality) {
        var imageIsVertical = [];
        var imageIsHorizontal = [];
        for (const imageFileName of imageFileNames) {
            fs.renameSync("./cdn/images/temp/" + imageFileName, "./cdn/images/" + imageFileName, function(e) {
                if (e) {
                    console.log("could not move " + imageFileName + " out of temp");
                    console.log(e);
                }
            })
            var metadata = await sharp('./cdn/images/' + imageFileName).metadata()
            image = new Image({
                context: postType,
                filename: imageFileName,
                privacy: privacy,
                user: posterID,
                quality: postImageQuality,
                height: metadata.height,
                width: metadata.width
            })
            await image.save();

            if (fs.existsSync(path.resolve('./cdn/images/' + imageFileName))) {
                imageIsVertical.push(((metadata.width / metadata.height) < 0.75) ? "vertical-image" : "");
                imageIsHorizontal.push(((metadata.width / metadata.height) > 1.33) ? "horizontal-image" : "");
            } else {
                console.log("image " + './cdn/images/' + imageFileName + " not found! Oh no")
                imageIsVertical.push("");
                imageIsHorizontal.push("");
            }

        }
        return { imageIsHorizontal: imageIsHorizontal, imageIsVertical: imageIsVertical };
    },
    //returns the postOrComment with the cachedHTML.fullContentHTML field set to its final HTML. also, some extra info in the inlineElements, but that hopefully won't get saved 'cause it's not in the inlineElement schema
    updateHTMLCache: async function(postOrComment) {
        if (postOrComment.inlineElements && postOrComment.inlineElements.length) {
            var lines = [];
            const lineFinder = /<p>.*?<\/p>|(?:<ul><li>|<li>).*?(?:<\/li><\/ul>|<\/li>)/g;
            while (line = lineFinder.exec(postOrComment.parsedContent)) {
                lines.push(line);
            }
            var addedLines = 0;
            for (const il of postOrComment.inlineElements) {
                if (il.type == "link-preview") {
                    if (il.isEmbeddableVideo) {
                        console.log("embed!!!!");
                        il.type = "video"; //the template looks for "video" in this field, like what older posts with embeds have
                    }
                    var html = await hbs.render('./views/partials/embed.handlebars', il);
                    il.type = "link-preview"; //yes, this is dumb. the alternative is to list all the different variables the template expects in the rendering options with type: (isEmbeddableVideo ? "video" : "asdj;lfkfdsajkfl;") or something
                } else if (il.type == "image(s)") {
                    il.contentWarnings = postOrComment.contentWarnings;
                    il.author = { username: (await User.findById(postOrComment.author, { username: 1 })).username };
                    var filenames = il.images;
                    il.images = il.images.map(v => "/api/image/display/" + v);
                    var html = await hbs.render('./views/partials/imagegallery.handlebars', il);
                    il.images = filenames; //yes, this is dumb. the alternative is to specify each variable the template expects individually in the rendering options with like images: fullImagePaths
                }
                lines.splice(il.position + addedLines, 0, html);
                addedLines++;
            }
            if (postOrComment.cachedHTML) {
                postOrComment.cachedHTML.fullContentHTML = lines.join('\n') //\n just makes the result easier to read in case someone wants to look at it;
            } else {
                postOrComment.cachedHTML = { fullContentHTML: lines.join('\n') };
            }
            return postOrComment;
        } else if ((postOrComment.images && postOrComment.images.length) || (postOrComment.embeds && postOrComment.embeds.length)) {
            var endHTML = "";
            if (postOrComment.embeds && postOrComment.embeds.length) {
                //this is a post from before the inlineElements array, render its embed (mandated to be just one) and put it at the end of html
                endHTML += await hbs.render('./views/partials/embed.handlebars', postOrComment.embeds[0])
            }
            if (postOrComment.images && postOrComment.images.length) {
                //this is a post or comment from before the inlineElements array, render its images (with determined full urls) with the parallel arrays and put that at the end of html
                var filenames = postOrComment.images;
                if (!postOrComment.parent && (!postOrComment.imageVersion || postOrComment.imageVersion < 2)) { //if it's not a comment it won't have .parent
                    postOrComment.images = postOrComment.images.map(v => "/public/images/uploads/" + v);
                } else {
                    postOrComment.images = postOrComment.images.map(v => "/api/image/display/" + v);
                }
                endHTML += await hbs.render('./views/partials/imagegallery.handlebars', postOrComment)
                postOrComment.images = filenames; //yes, this is dumb
            }
            if (postOrComment.cachedHTML) {
                postOrComment.cachedHTML.fullContentHTML = postOrComment.parsedContent + endHTML;
            } else {
                postOrComment.cachedHTML = { fullContentHTML: postOrComment.parsedContent + endHTML };
            }
            return postOrComment;
        } else {
            if (postOrComment.cachedHTML) {
                postOrComment.cachedHTML.fullContentHTML = postOrComment.parsedContent;
            } else {
                postOrComment.cachedHTML = { fullContentHTML: postOrComment.parsedContent };
            }
            return postOrComment;
        }
    }
}

function wordCount(str) {
    return str.split(' ').filter(function(n) { return n != '' }).length;
}