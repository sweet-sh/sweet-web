export default {
  data: function () {
    return {
      loading: false,
      oldestResultLoaded: new Date().getTime(),
      results: [],
      allResultsLoaded: false,
      baseURL: ''
    }
  },
  computed: {
    firstPageFetched: function () {
      return this.results.length > 0
    }
  },
  methods: {
    startLoading: function (baseURL) {
      console.log('started loading w', baseURL)
      this.baseURL = baseURL
      this.oldestResultLoaded = new Date().getTime()
      this.allResultsLoaded = false
      this.results = []
      window.addEventListener('scroll', () => {
        const w = $(window)
        if ($(document).height() - (w.scrollTop() + w.height()) < 400) {
          this.fetchResults()
        }
      })
      this.fetchResults()
    },
    fetchResults: function () {
      if (this.allResultsLoaded || this.loading) {
        return
      }
      this.loading = true
      var vueData = this
      $.get(this.baseURL + this.oldestResultLoaded, null, function (results) {
        vueData.oldestResultLoaded = results.oldestTimestamp
        vueData.results = vueData.results.concat(results.results)
        vueData.loading = false
        // if the page isn't filled up yet, load more
        if ($(document).height() <= $(window).height()) {
          vueData.fetchResults()
        }
      }, 'json').fail(function () { // recieving a 404 response from the server is currently how we find out we're out of results; this should be changed to be less ambiguous
        vueData.allResultsLoaded = true
        vueData.loading = false
      })
    }
  }
}
