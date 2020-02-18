import searchPage from '../components/TheSearchPage'
import searchResult from '../components/SearchPageComponents/searchResultOutline'
import tagResult from '../components/SearchPageComponents/tagResult'
import userResult from '../components/SearchPageComponents/userResult'
import communityResult from '../components/SearchPageComponents/communityResult'
import { mount } from '@vue/test-utils'
import $ from 'jquery'
global.$ = global.jQuery = $

describe('TheSearchPage', () => {
  const startLoading = jest.fn()
  const mountOptions = { methods: { startLoading } }

  test('pulls search query out of url', () => {
    window.history.pushState({}, 'sweet', '/search/dog')
    let wrapper = mount(searchPage)
    expect(wrapper.vm.query).toBe('dog')
    expect(wrapper.vm.searchBox).toBe('dog')
    wrapper.destroy()

    window.history.pushState({}, 'sweet', '/search/')
    wrapper = mount(searchPage)
    expect(wrapper.vm.query).toBe('')
    expect(wrapper.vm.searchBox).toBe('')
  })

  test('calls infinite scroll and pushes history state when search is submitted', () => {
    const wrapper = mount(searchPage, mountOptions)
    wrapper.setData({ searchBox: 'cat' })
    wrapper.find('button').trigger('click')
    expect(startLoading).toBeCalledWith('/showsearch/cat/', false)
    expect(window.location.pathname).toBe('/search/cat')
  })

  test('calls infinite scroll and when started with a query in the url', () => {
    window.history.pushState({}, 'sweet', '/search/dog')
    const wrapper = mount(searchPage, mountOptions)
    expect(startLoading).toBeCalledWith('/showsearch/dog/', false)
  })

  test('renders tag result when given tag result object', async () => {
    const wrapper = mount(searchPage)
    wrapper.setData({ results: [{ type: 'tag', name: '', posts: 1 }] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(tagResult).exists()).toBe(true)
    wrapper.setData({ results: [{ type: 'tag', name: '', posts: 2 }] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(tagResult).exists()).toBe(true)
  })

  test('renders user result when given user result object', async () => {
    const wrapper = mount(searchPage)
    wrapper.setData({ results: [{ type: 'user', imageEnabled: false, aboutParsed: '', username: 'a', flagged: false }] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(userResult).exists()).toBe(true)
    wrapper.setData({ results: [{ type: 'user', imageEnabled: true, image: 'image.jpg', aboutParsed: '<p>hi</p>', displayName: 'b', username: 'c', flagged: true }] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(userResult).exists()).toBe(true)
    expect(wrapper.find(userResult).find(searchResult).vm.image).toEqual(expect.stringContaining('image.jpg'))
    expect(wrapper.find('.text-danger').exists()).toBe(true)
    expect(wrapper.html()).toEqual(expect.stringContaining('<p>hi</p>'))
  })

  test('renders community result when given community result object', async () => {
    const wrapper = mount(searchPage)
    wrapper.setData({ results: [{ type: 'community', name: '', membersCount: 1, imageEnabled: false, descriptionParsed: '', slug: '' }] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(communityResult).exists()).toBe(true)
    wrapper.setData({ results: [{ type: 'community', name: '', membersCount: 2, imageEnabled: true, image: 'image.jpg', descriptionParsed: '<p>hello</p>', slug: '' }] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(communityResult).exists()).toBe(true)
    expect(wrapper.find(communityResult).find(searchResult).vm.image).toEqual(expect.stringContaining('image.jpg'))
    expect(wrapper.html()).toEqual(expect.stringContaining('<p>hello</p>'))
  })

  test('restores state after history events', async () => {
    window.history.replaceState({}, 'sweet', '/search/cat')
    const wrapper = mount(searchPage, mountOptions)

    wrapper.setData({ searchBox: 'dog' })
    wrapper.find('button').trigger('click')
    window.onpopstate({ state: { query: 'cat' } }) // jsdom appears to not support history.back() yet so this here's a fake popstate event object
    expect(wrapper.vm.searchBox).toBe('cat')
    expect(wrapper.vm.query).toBe('cat')
    expect(startLoading).toBeCalledWith('/showsearch/cat/', true)
  })
})
