const scrollThreshold = 400

// infinite-loader-mixin: add to your component, call startLoading(string baseURL, boolean useHistory) to (re)start it as many times as you want, and access
// the results through the results array and access the loading state, if you want to display it, through loading (boolean) and allResultsLoaded (boolean).
// overwrite the getNextRequestURL(string baseURL) method to use non-oldest-result-loaded-timestamp-based pagination methods.
// Accessing or modifying the state through any other means is done completely at your own risk.
export default {
  data: function () {
    return {
      loading: false,
      oldestResultLoaded: new Date().getTime(),
      results: [],
      allResultsLoaded: false,
      baseURL: '',
      // this is implemented as an arrow function so `this` refers to the current component and so there will be a new instance of the function generated
      // once per component, so this can be attached as an event listener once per component (js won't attach the same instance of the function twice)
      listener: () => {
        if (this.needMoreResults()) {
          this.fetchResults()
        }
      },
      resultsHistory: {} // caches fetched results. uses format: { '/example/base/url/': { oldestDateLoaded: timestamp, results: [] } }
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
    needMoreResults () {
      const w = $(window)
      const d = $(document)
      return d.height() - (w.scrollTop() + w.height()) < scrollThreshold || w.height() < d.height()
    },
    getNextRequestURL: function (baseURL) {
      return baseURL + this.oldestResultLoaded
    },
    startLoading: function (baseURL, useCachedResults = true) {
      this.loading = false
      this.baseURL = baseURL
      this.oldestResultLoaded = new Date().getTime()
      this.allResultsLoaded = false
      this.results = []
      window.addEventListener('scroll', this.listener)
      if (useCachedResults && this.resultsHistory[baseURL]) {
        this.oldestResultLoaded = this.resultsHistory[baseURL].oldestResultLoaded
        this.results = this.resultsHistory[baseURL].results
      }
      if (this.needMoreResults()) {
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
      $.get(this.getNextRequestURL(thisReqsBaseURL), null, function (results) {
        if (!results.oldestTimestamp) {
          console.error('oldestTimestamp not present in items loaded by infinite-loader')
        }
        if (!vueData.resultsHistory[thisReqsBaseURL]) {
          vueData.resultsHistory[thisReqsBaseURL] = {}
        }
        vueData.resultsHistory[thisReqsBaseURL].oldestResultLoaded = results.oldestTimestamp
        vueData.resultsHistory[thisReqsBaseURL].results = vueData.results.concat(results.results)
        if (vueData.baseURL !== thisReqsBaseURL) {
          console.log('old results rejected')
          return // this means that the currently active query has changed since the request was made
        }
        vueData.oldestResultLoaded = results.oldestTimestamp
        vueData.results = vueData.results.concat(results.results)
        vueData.loading = false
        // if the page isn't filled up yet, load more
        if (vueData.needMoreResults()) {
          vueData.fetchResults()
        }
      }, 'json').fail(function () { // recieving a 404 response from the server is currently how we find out we're out of results; this should be changed to be less ambiguous
        vueData.allResultsLoaded = true
        vueData.loading = false
      })
    }
  }
}
