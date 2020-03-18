// View engine (Handlebars)
const handlebars = require('handlebars')
const expressHandlebars = require('express-handlebars')
const helpers = require('handlebars-helpers')()
const { allowInsecurePrototypeAccess } = require('@handlebars/allow-prototype-access')
const hbs = expressHandlebars.create({
  handlebars: allowInsecurePrototypeAccess(handlebars),
  defaultLayout: 'main',
  partialsDir: ['views/partials/', 'views/partials/scriptPartials/'],
  helpers: {
    ...helpers,
    ...{
      vueTemplate: function (options) {
        return options.fn()
      },
      plural: function (number, text) {
        const singular = number === 1
        // If no text parameter was given, just return a conditional s.
        if (typeof text !== 'string') return singular ? '' : 's'
        // Split with regex into group1/group2 or group1(group3)
        const match = text.match(/^([^()\/]+)(?:\/(.+))?(?:\((\w+)\))?/)
        // If no match, just append a conditional s.
        if (!match) return text + (singular ? '' : 's')
        // We have a good match, so fire away
        return (
        // Singular case
          (singular && match[1]) ||
        // Plural case: 'bagel/bagels' --> bagels
        match[2] ||
        // Plural case: 'bagel(s)' or 'bagel' --> bagels
        match[1] + (match[3] || 's')
        )
      },
      buildComment (comment, depth) {
        if (!depth) depth = 1
        const tree = []
        tree.push({
          comment: comment,
          depth: depth
        })
        comment.replies.forEach((r) => {
          depth = depth + 1
          tree.comment.replies.depth = depth
        })
        return tree
      }
    }
  }
})
module.exports = hbs
