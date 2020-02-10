const scrollThreshold = 400
function needMoreResults () {
  const w = $(window)
  const d = $(document)
  return d.height() - (w.scrollTop() + w.height()) < scrollThreshold || w.height() < d.height()
}
export default {
  data: function () {
    return {
      loading: false,
      oldestResultLoaded: new Date().getTime(),
      results: [],
      allResultsLoaded: false,
      baseURL: '',
      listener: () => {
        if (needMoreResults()) {
          this.fetchResults()
        }
      },
      resultsHistory: {}
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
    startLoading: function (baseURL, useHistory = true) {
      this.loading = false
      this.baseURL = baseURL
      this.oldestResultLoaded = new Date().getTime()
      this.allResultsLoaded = false
      this.results = []
      window.addEventListener('scroll', this.listener)
      if (useHistory && this.resultsHistory[baseURL]) {
        this.oldestResultLoaded = this.resultsHistory[baseURL].oldestResultLoaded
        this.results = this.resultsHistory[baseURL].results
      }
      if (needMoreResults()) {
        this.fetchResults()
      }
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
        !vueData.resultsHistory[thisReqsBaseURL] && (vueData.resultsHistory[thisReqsBaseURL] = {})
        vueData.resultsHistory[thisReqsBaseURL].oldestResultLoaded = results.oldestTimestamp
        vueData.resultsHistory[thisReqsBaseURL].results = vueData.results.concat(results.results)
        if (vueData.baseURL !== thisReqsBaseURL) {
          console.log('old results rejected')
          return // this means that the query has changed since the request was made
        }
        vueData.oldestResultLoaded = results.oldestTimestamp
        vueData.results = vueData.results.concat(results.results)
        vueData.loading = false
        // if the page isn't filled up yet, load more
        if (needMoreResults()) {
          vueData.fetchResults()
        }
      }, 'json').fail(function () { // recieving a 404 response from the server is currently how we find out we're out of results; this should be changed to be less ambiguous
        vueData.allResultsLoaded = true
        vueData.loading = false
      })
    }
  }
}
