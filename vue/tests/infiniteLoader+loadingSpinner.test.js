import { mount } from '@vue/test-utils'
import infiniteLoaderHost from './infiniteLoaderHost'
import loadingSpinner from '../components/SharedSubComponents/loadingSpinner'
import $ from 'jquery'
global.$ = global.jQuery = $

describe('infiniteLoader+loadingSpinner test', () => {
  test('renders loading spinner appropriately', async () => {
    const wrapper = mount(infiniteLoaderHost)

    wrapper.setData({ loading: true, allResultsLoaded: false, results: [] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(loadingSpinner).find('p').exists()).toBe(false)
    expect(wrapper.find(loadingSpinner).find('.loader-ellips').exists()).toBe(true)

    wrapper.setData({ loading: false, allResultsLoaded: true, results: [] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(loadingSpinner).find('p').exists()).toBe(true)
    expect(wrapper.find(loadingSpinner).find('.loader-ellips').exists()).toBe(false)

    wrapper.setData({ loading: false, allResultsLoaded: false, results: [] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(loadingSpinner).exists()).toBe(false)
  })
})
