const Autolinker = require('autolinker');
var sanitize = require('mongo-sanitize');
var sanitizeHtml = require('sanitize-html');

module.exports = {
    // Parses new post and new comment content. Input: a text string. Output: a parsed text string.
    parseText: function(rawText, cwsEnabled = false, mentionsEnabled = true, hashtagsEnabled = true, urlsEnabled = true, youtubeEnabled = false) {
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

        parsedContent = this.sanitizeHtmlForSweet(parsedContent);

        //sometimes the editor starts the post content with links that are outside of paragraphs and thus don't look like they're on their own line to the embedding code below, that needs patched for now
        if(parsedContent.substring(0,3) == '<a>'){
            parsedContent += "<p>"
            parsedContent = parsedContent.replace(/<a\/>/,'</a></p>');
        }

        if (youtubeEnabled) {
            //this part is super repetitive but like it's late right now. but if we add any other embeds definitely some stuff should be seperated out into some functions. also someone figure out why we sometimes have video links with <a>s and sometimes just urls to deal with
            var embedsAllowed = 1; //harsh, i know
            var embedsAdded = 0;
            //sometimes when you paste a url into mediumeditor it's immediately a link and sometimes not and i have no clue why so just for now we have to deal with both cases
            var linkFindingRegex = /<p>(<br \/>)*<a href="(.*?)">(.*?)<\/a>(<br \/>)*<\/p>/g //matches all links with a line to themselves. the <br /> only in there bc mediumeditor is being naughty >:(
            var YurlFindingRegex = /<p>((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?<\/p>/g //matches all unlinked youtube urls with a line to themselves
            var VurlFindingRegex = /<p>(http|https)?:\/\/(www\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|)(\d+)(?:|\/\?)<\/p>/g;
            //taken from https://stackoverflow.com/questions/19377262/regex-for-youtube-url
            var youtubeUrlFindingRegex = /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/
            //taken from https://github.com/regexhq/vimeo-regex/blob/master/index.js
            var vimeoUrlFindingRegex = /^(http|https)?:\/\/(www\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|)(\d+)(?:|\/\?)$/

            if (parsedContent.search(linkFindingRegex) != -1) {
                var searchableParsedContent = parsedContent.replace(/&amp;/, '&');
                var r = linkFindingRegex.exec(searchableParsedContent);
                var s = YurlFindingRegex.exec(searchableParsedContent);
                var t = VurlFindingRegex.exec(searchableParsedContent);
                var parsedContentWEmbeds = searchableParsedContent.slice(); //need a copy of searchableParsedContent that we can modify without throwing off lastIndex in RegExp.exec
                while (r && embedsAdded < embedsAllowed) {
                    if (r[2].search(youtubeUrlFindingRegex) != -1 && r[3].search(youtubeUrlFindingRegex) != -1) {
                        var videoid = youtubeUrlFindingRegex.exec(r[2])[5];
                        parsedContentWEmbeds = parsedContentWEmbeds.replace(r[0], '<div class="embedded-video-cont"><iframe class="embedded-video" src="https://www.youtube.com/embed/' + videoid + '" frameborder="0" allowfullscreen></iframe></div>');
                        ++embedsAdded;
                    }else if(r[2].search(vimeoUrlFindingRegex) != -1 && (r[3].substring(0,4)=="http" ? r[3] : "https://"+r[3]).search(vimeoUrlFindingRegex) != -1){
                        var videoid = vimeoUrlFindingRegex.exec(r[2])[4];
                        parsedContentWEmbeds = parsedContentWEmbeds.replace(r[0], '<div class="embedded-video-cont"><iframe class="embedded-video" src="https://player.vimeo.com/video/' + videoid + '" frameborder="0" allowfullscreen></iframe></div>');
                        ++embedsAdded;
                    }
                    r = linkFindingRegex.exec(searchableParsedContent);
                }
                while (s && embedsAdded < embedsAllowed) {
                    var videoid = s[5];
                    parsedContentWEmbeds = parsedContentWEmbeds.replace(s[0], '<div class="embedded-video-cont"><iframe class="embedded-video" src="https://www.youtube.com/embed/' + videoid + '" frameborder="0" allowfullscreen></iframe></div>');
                    ++embedsAdded;
                    s = YurlFindingRegex.exec(searchableParsedContent);
                }
                while(t && embedsAdded < embedsAllowed){
                    var videoid = t[4];
                    parsedContentWEmbeds = parsedContentWEmbeds.replace(t[0], '<div class="embedded-video-cont"><iframe class="embedded-video" src="https://player.vimeo.com/video/' + videoid + '" frameborder="0" allowfullscreen></iframe></div>');
                    ++embedsAdded;
                    t = VurlFindingRegex.exec(searchableParsedContent);
                }
                parsedContent = parsedContentWEmbeds.replace(/&/, '&amp;');
            }
        }

        return {
            text: parsedContent,
            mentions: trimmedMentions,
            tags: trimmedTags
        };
    },
    isEven: function(n) {
        return n % 2 == 0;
    },
    isOdd: function(n) {
        return Math.abs(n % 2) == 1;
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
            allowedTags: ['blockquote', 'ul', 'li', 'i', 'b', 'strong', 'a', 'p', 'br'],
            allowedAttributes: {
                'a': ['href','target']
            },
            transformTags: {
                'a': function(tagName, attribs) {
                    if (!attribs.href.includes('//')) {
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
    }
}

function wordCount(str) {
    return str.split(' ')
        .filter(function(n) {
            return n != ''
        })
        .length;
}