import infiniteLoaderHost from './infiniteLoaderHost'
import { mount } from '@vue/test-utils'
import $ from 'jquery'
global.$ = global.jQuery = $
var needMoreResultsCounter = 0

describe('infiniteLoaderMixin', () => {
  // to mock the needMoreResults function, which normally checks to see if the viewport is filled up with posts, we
  // will just make this version that returns true, true, false cyclically.
  const needMoreResults = () => {
    needMoreResultsCounter += 1
    return needMoreResultsCounter % 3 !== 0
  }

  let wrapper

  // set the component wrapper up with basic mocks before each test
  beforeEach(() => {
    needMoreResultsCounter = 0
    $.get = jest.fn(() => { return { fail: () => null } })
    wrapper = mount(infiniteLoaderHost, { methods: { needMoreResults } })
  })

  test('fetches results when given a new baseURL', () => {
    $.get = jest.fn((url, options, success, dataType) => {
      success({ oldestTimestamp: 10, results: [{ _id: needMoreResultsCounter, type: 'not real' }] })
      return { fail: () => null }
    })
    wrapper.vm.startLoading('/mock/url/', false)
    expect(wrapper.vm.baseURL).toBe('/mock/url/')
    expect($.get).toBeCalled()
  })

  test('stops fetching results upon receiving an error', () => {
    $.get = jest.fn(() => { return { fail: (f) => f() } })
    wrapper.vm.startLoading('/mock/url/', false)
    expect($.get).toBeCalledTimes(1)
    expect(wrapper.vm.loading).toBe(false)
    expect(wrapper.vm.allResultsLoaded).toBe(true)
  })

  test('does not request more results if already loading or if not needed according needMoreResults()', () => {
    wrapper.setData({ loading: true })
    wrapper.vm.fetchResults()
    expect($.get).not.toBeCalled()
    wrapper.setMethods({ needMoreResults: () => false })
    wrapper.vm.startLoading('mock/mock/', false)
    expect($.get).not.toBeCalled()
  })

  test('rejects results if the query has changed since they were requested and shows error if oldestTimestamp is missing', () => {
    const errorLogger = jest.spyOn(console, 'error')
    const result = { _id: needMoreResultsCounter, type: 'result for old baseURL' }
    $.get = jest.fn((url, options, success, dataType) => {
      wrapper.setData({ baseURL: '/aNewBaseURL' })
      success({ results: [result] })
      return { fail: () => null }
    })
    wrapper.vm.startLoading('/mock/url2/', false)
    expect(wrapper.vm.results).not.toContain(result)
    expect(errorLogger).toBeCalled()
  })

  test('uses cached results if so prompted', () => {
    needMoreResultsCounter = 3
    const fakeResult = { type: 'not real' }
    wrapper.setData({ resultsHistory: { '/mock/whatever/': { oldestResultLoaded: 10, results: [fakeResult] } } })
    wrapper.vm.startLoading('/mock/whatever/', true)
    expect(wrapper.vm.results).toContain(fakeResult)
    expect(wrapper.vm.oldestResultLoaded).toBe(10)
  })

  test('scroll listener is attached and removed upon creation and destruction', () => {
    const listenerAdder = jest.spyOn(window, 'addEventListener')
    const listenerRemover = jest.spyOn(window, 'removeEventListener')
    wrapper.vm.startLoading('/mock/url/whatever')
    expect(listenerAdder).toBeCalledWith('scroll', wrapper.vm.listener)
    wrapper.destroy()
    expect(listenerRemover).toBeCalledWith('scroll', wrapper.vm.listener)
  })

  test('scroll listener requests results appropriately when called', async () => {
    wrapper.setData({ baseURL: '/mock/url3' })
    wrapper.vm.listener()
    expect($.get).toBeCalledTimes(1)
    wrapper.setMethods({ needMoreResults: () => false })
    wrapper.vm.listener()
    expect($.get).toHaveBeenCalledTimes(1)
  })
})
