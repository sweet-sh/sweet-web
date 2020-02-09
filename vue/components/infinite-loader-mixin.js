export default {
  data: function () {
    return {
      loading: false,
      oldestResultLoaded: new Date().getTime(),
      results: [],
      allResultsLoaded: false,
      baseURL: '',
      listener: () => {
        const w = $(window)
        if ($(document).height() - (w.scrollTop() + w.height()) < 400) {
          this.fetchResults()
        }
      }
    }
  },
  computed: {
    firstPageFetched: function () {
      return this.results.length > 0
    }
  },
  destroyed: function () {
    window.removeEventListener('scroll', this.listener)
  },
  methods: {
    startLoading: function (baseURL) {
      this.loading = false
      this.baseURL = baseURL
      this.oldestResultLoaded = new Date().getTime()
      this.allResultsLoaded = false
      this.results = []
      window.addEventListener('scroll', this.listener)
      this.fetchResults()
    },
    fetchResults: function () {
      if (this.allResultsLoaded || this.loading) {
        return
      }
      this.loading = true
      var vueData = this
      const thisReqsBaseURL = this.baseURL
      $.get(thisReqsBaseURL + this.oldestResultLoaded, null, function (results) {
        if (!results.oldestTimestamp) {
          console.error('oldestTimestamp not present in items loaded by infinite-loader')
        }
        if (vueData.baseURL !== thisReqsBaseURL) {
          console.log('old results rejected')
          return // this means that the query has changed since the request was made
        }
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
