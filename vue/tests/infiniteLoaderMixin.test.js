import infiniteLoaderHost from './infiniteLoaderHost'
import { mount } from '@vue/test-utils'
import $ from 'jquery'
global.$ = global.jQuery = $
var needMoreResultsCounter = 0

describe('infiniteLoaderMixin', () => {
  const needMoreResults = jest.fn(() => {
    needMoreResultsCounter += 1
    return needMoreResultsCounter % 3 !== 0
  })

  test('fetches results when given a new baseURL', () => {
    needMoreResultsCounter = 0
    $.get = jest.fn((url, options, success, dataType) => {
      success({ oldestTimestamp: 10, results: [{ _id: needMoreResultsCounter, type: 'not real' }] })
      return { fail: (failure) => failure() }
    })
    const wrapper = mount(infiniteLoaderHost, { methods: { needMoreResults } })
    wrapper.vm.startLoading('/mock/url/', false)
    expect($.get).toBeCalled()
  })

  test('does not request more results if already loading or if not needed according needMoreResults()', () => {
    $.get = jest.fn(() => null)
    const wrapper = mount(infiniteLoaderHost)
    wrapper.setData({ loading: true })
    wrapper.vm.fetchResults()
    expect($.get).not.toBeCalled()
    wrapper.setMethods({ needMoreResults: () => false })
    wrapper.vm.startLoading('mock/mock/', false)
    expect($.get).not.toBeCalled()
  })

  test('rejects results if the query has changed since they were requested and shows error if oldestTimestamp is missing', () => {
    needMoreResultsCounter = 0
    const errorLogger = jest.spyOn(console, 'error')
    const wrapper = mount(infiniteLoaderHost, { methods: { needMoreResults } })
    const result = { _id: needMoreResultsCounter, type: 'result for old baseURL' }
    $.get = jest.fn((url, options, success, dataType) => {
      wrapper.setData({ baseURL: '/aNewBaseURL' })
      success({ results: [result] })
      return { fail: (failure) => failure() }
    })
    wrapper.vm.startLoading('/mock/url2', false)
    expect(wrapper.vm.results).not.toContain(result)
    expect(errorLogger).toBeCalled()
  })

  test('uses cached results if so prompted', () => {
    $.get = jest.fn(() => { return { fail: () => null } })
    needMoreResultsCounter = 3
    const wrapper = mount(infiniteLoaderHost, { methods: { needMoreResults } })
    const fakeResult = { type: 'not real' }
    wrapper.setData({ resultsHistory: { '/mock/whatever/': { oldestResultLoaded: 10, results: [fakeResult] } } })
    wrapper.vm.startLoading('/mock/whatever/', true)
    expect(wrapper.vm.results).toContain(fakeResult)
    expect(wrapper.vm.oldestResultLoaded).toBe(10)
  })

  test('scroll listener is attached and removed upon creation and destruction', () => {
    needMoreResultsCounter = 0
    $.get = jest.fn(() => { return { fail: () => null } })
    const listenerAdder = jest.spyOn(window, 'addEventListener')
    const listenerRemover = jest.spyOn(window, 'removeEventListener')
    const wrapper = mount(infiniteLoaderHost, { methods: { needMoreResults } })
    wrapper.vm.startLoading('/mock/url/whatever')
    expect(listenerAdder).toBeCalledWith('scroll', wrapper.vm.listener)
    wrapper.destroy()
    expect(listenerRemover).toBeCalledWith('scroll', wrapper.vm.listener)
  })

  test('scroll listener requests results appropriately', async () => {
    needMoreResultsCounter = 0
    $.get = jest.fn(() => { return { fail: () => null } })
    const wrapper = mount(infiniteLoaderHost, { methods: { needMoreResults } })
    wrapper.setData({ baseURL: '/mock/url3' })
    wrapper.vm.listener()
    expect($.get).toBeCalledTimes(1)
    wrapper.setMethods({ needMoreResults: () => false })
    wrapper.vm.listener()
    expect($.get).toHaveBeenCalledTimes(1)
  })
})
