module.exports = {
    env: {
      node: true
    },
    extends: [
      "plugin:vue/strongly-recommended",
    ],
    globals: {
      Atomics: 'readonly',
      SharedArrayBuffer: 'readonly',
      attachQuill: 'readonly',
      $: 'readonly'
    },
    parserOptions: {
      ecmaVersion: 2018
    },
    rules: {
       "vue/max-len": ["error", {
        "code": 100,
        "template": 120,
       }
      ],
      "vue/max-attributes-per-line": ["error", {"singleline": 5}]
    },
    "ignorePatterns": ["*.js"]
  }
  