import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // jsBoot 整份源码会被塞进沙箱 iframe 的经典脚本里，modulePaths.js 的函数在同一份文档里先行声明
    files: ['src/services/sandbox/jsBoot.js'],
    languageOptions: {
      globals: { ...globals.browser, rewriteSpecifiers: 'readonly' },
    },
  },
  {
    // previewBoot / previewModules 同理：和 previewPaths.js、previewAutomate.js（都去掉 export）
    // 以及配置常量包在同一个 IIFE 里注入预览 iframe
    files: ['src/services/previewBoot.js', 'src/services/previewModules.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        __XIYUE_PREVIEW__: 'readonly',
        PREVIEW_MESSAGE: 'readonly',
        PREVIEW_REPLY: 'readonly',
        PREVIEW_LEVELS: 'readonly',
        isExternalUrl: 'readonly',
        formatPreviewArg: 'readonly',
        mapModuleUrls: 'readonly',
        buildImportMap: 'readonly',
        loadPreviewModules: 'readonly',
        installAutomation: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // 这几份用例在文件头声明了 @vitest-environment happy-dom，跑的时候有完整的 window / document；
    // 其余用例仍是 node 环境，不给浏览器全局，写错了才报得出来
    files: [
      'tests/previewAutomate.test.js',
      'tests/storeAssets.test.js',
      'tests/storeChat.test.js',
      'tests/storeDream.test.js',
      'tests/storeMemory.test.js',
      'tests/storeSettings.test.js',
      'tests/storeStarry.test.js',
      'tests/storeTopics.test.js',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['public/**/*.js', 'extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.browser, ...globals.webextensions },
    },
  },
]