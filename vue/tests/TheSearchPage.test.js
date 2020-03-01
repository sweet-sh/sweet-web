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
  const noQuery = { methods: { startLoading }, propsData: { initialQuery: '' } }
  const dogQuery = { methods: { startLoading }, propsData: { initialQuery: 'dog' } }

  test('receives search query from props', () => {
    let wrapper = mount(searchPage, dogQuery)
    expect(wrapper.vm.query).toBe('dog')
    expect(wrapper.vm.searchBox).toBe('dog')
    wrapper.destroy()

    wrapper = mount(searchPage, noQuery)
    expect(wrapper.vm.query).toBe('')
    expect(wrapper.vm.searchBox).toBe('')
  })

  test('calls infinite scroll and pushes history state when search is submitted', () => {
    const wrapper = mount(searchPage, noQuery)
    wrapper.setData({ searchBox: 'cat' })
    wrapper.find('button').trigger('click')
    expect(startLoading).toBeCalledWith('/showsearch/cat/', false)
    expect(window.location.pathname).toBe('/search/cat')
  })

  test('calls infinite scroll and when started with a query', () => {
    const wrapper = mount(searchPage, dogQuery)
    expect(startLoading).toBeCalledWith('/showsearch/dog/', false)
  })

  test('renders tag result when given tag result object', async () => {
    const wrapper = mount(searchPage, noQuery)
    wrapper.setData({ results: [{ type: 'tag', name: '', posts: 1 }] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(tagResult).exists()).toBe(true)
    wrapper.setData({ results: [{ type: 'tag', name: '', posts: 2 }] })
    await wrapper.vm.$nextTick()
    expect(wrapper.find(tagResult).exists()).toBe(true)
  })

  test('renders user result when given user result object', async () => {
    const wrapper = mount(searchPage, noQuery)
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
    const wrapper = mount(searchPage, noQuery)
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
    const wrapper = mount(searchPage, dogQuery)

    wrapper.setData({ searchBox: 'cat' })
    wrapper.find('button').trigger('click')
    window.onpopstate({ state: { query: 'dog' } }) // jsdom appears to not support history.back() yet so this here's a fake popstate event object
    expect(wrapper.vm.searchBox).toBe('dog')
    expect(wrapper.vm.query).toBe('dog')
    expect(startLoading).toBeCalledWith('/showsearch/dog/', true)
  })
})
