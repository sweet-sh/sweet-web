const Autolinker = require( 'autolinker' );
var sanitize = require('mongo-sanitize');

module.exports = {
  // Parses new post and new comment content. Input: a text string. Output: a parsed text string.
  parseText: function (rawText, cwsEnabled = false, mentionsEnabled = true, hashtagsEnabled = true, urlsEnabled = true, ) {
    let splitContent = rawText.split('</p>');
    let parsedContent = [];
    var mentionRegex   = /(^|[^@\w])@([\w-]{1,30})[\b-]*/g
    var mentionReplace = '$1<a href="/$2">@$2</a>';
    var hashtagRegex   = /(^|[^#\w])#(\w{1,60})\b/g
    var hashtagReplace = '$1<a href="/tag/$2">#$2</a>';
    splitContent.forEach(function (line) {
      line += '</p>'
      if (line.replace(/<[^>]*>/g, "") != ""){ // Filters out lines which are just HTML tags
        if (urlsEnabled){
          line = Autolinker.link( line );
        }
        if (mentionsEnabled){
          line = line.replace( mentionRegex, mentionReplace )
        }
        if (hashtagsEnabled){
          line = line.replace( hashtagRegex, hashtagReplace );
        }
        parsedContent.push(line);
      }
    })
    parsedContent = parsedContent.join('');
    parsedContent = sanitize(parsedContent);

    if (!cwsEnabled){
      let contentWordCount = wordCount(parsedContent);
      if (contentWordCount > 160){
        parsedContent = '<div class="abbreviated-content">' + parsedContent + '</div><a class="show-more" data-state="contracted">Show more</a>';
      }
    }

    let mentionsArray = Array.from(new Set(rawText.replace(/<[^>]*>/g, "").match( mentionRegex )))
    let tagsArray = Array.from(new Set(rawText.replace(/<[^>]*>/g, "").match( hashtagRegex )))
    let trimmedMentions = []
    let trimmedTags = []
    if (mentionsArray){
      mentionsArray.forEach((el) => {
        trimmedMentions.push(el.replace(/(@|\s)*/i, ''));
      })
    }
    if (tagsArray){
      tagsArray.forEach((el) => {
        trimmedTags.push(el.replace(/(#|\s)*/i, ''));
      })
    }
    return {
      text: parsedContent,
      mentions: trimmedMentions,
      tags: trimmedTags
    };
  },
  isEven: function (n) {
    return n % 2 == 0;
  },
  isOdd: function (n) {
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
  }
}

function wordCount(str) {
   return str.split(' ')
    .filter(function(n) { return n != '' })
    .length;
}
