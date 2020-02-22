module.exports = {
    env: {
      browser: true,
      commonjs: true,
      es6: true,
      jest: true
    },
    extends: [
      "plugin:vue/essential",
      "@vue/prettier"
    ],
    globals: {
      Atomics: 'readonly',
      SharedArrayBuffer: 'readonly'
    },
    parserOptions: {
      ecmaVersion: 2018
    },
    rules: {
      'no-useless-escape': 'off'
    },
    "ignorePatterns": ["*.js"]
  }
  