import { createI18n } from 'vue-i18n'

const messages = {
  en: {
    nav: {
      features: 'Features',
      download: 'Download',
      github: 'GitHub',
      getStarted: 'Get Started'
    },
    hero: {
      newVersion: 'v1.0.0 Now Available',
      title: 'Your Clipboard,',
      subtitle: 'Supercharged.',
      description: 'Never lose a copied item again. ClipHist is the lightweight, fast, and privacy-focused clipboard manager for developers and power users.',
      downloadWindows: 'Download for Windows',
      downloadMac: 'Download for macOS',
      preview: 'App Screenshot Preview',
      previewPlaceholder: 'Place screenshot here'
    },
    features: {
      title: 'Everything you need',
      subtitle: 'Powerful features wrapped in a minimal, unobtrusive interface designed for efficiency.',
      list: {
        history: {
          title: 'Clipboard History',
          desc: 'Keep track of everything you copy. Text, images, links, and files are all stored securely.'
        },
        search: {
          title: 'Instant Search',
          desc: 'Find any copied item instantly with powerful fuzzy search. Just type to filter.'
        },
        image: {
          title: 'Image Support',
          desc: 'Preview copied images directly in the history list. Drag and drop to use them anywhere.'
        },
        keyboard: {
          title: 'Keyboard First',
          desc: 'Navigate, search, and paste without lifting your hands from the keyboard. Customizable shortcuts.'
        },
        crossPlatform: {
          title: 'Cross Platform',
          desc: 'Available for Windows and macOS. Seamless experience across your devices.'
        },
        privacy: {
          title: 'Private & Secure',
          desc: 'Your data stays on your device. No cloud sync, no tracking, complete privacy.'
        }
      }
    },
    download: {
      title: 'Ready to boost your productivity?',
      subtitle: 'Download ClipHist today and take control of your clipboard history. It\'s free and open source.',
      windows: {
        name: 'Windows',
        desc: 'Windows 10/11 (x64)',
        btn: 'Download Installer'
      },
      mac: {
        name: 'macOS',
        desc: 'macOS 11+ (Intel & Apple Silicon)',
        btn: 'Download DMG'
      }
    },
    footer: {
      privacy: 'Privacy Policy',
      terms: 'Terms of Service'
    },
    theme: {
      light: 'Light',
      dark: 'Dark',
      system: 'System'
    }
  },
  zh: {
    nav: {
      features: '功能特性',
      download: '下载',
      github: 'GitHub',
      getStarted: '开始使用'
    },
    hero: {
      newVersion: 'v1.0.0 现已发布',
      title: '你的剪贴板，',
      subtitle: '火力全开。',
      description: '再也不会丢失复制的内容。ClipHist 是一款专为开发者和极客打造的轻量、快速且注重隐私的剪贴板管理工具。',
      downloadWindows: '下载 Windows 版',
      downloadMac: '下载 macOS 版',
      preview: '应用截图预览',
      previewPlaceholder: '此处放置截图'
    },
    features: {
      title: '你需要的一切',
      subtitle: '强大的功能封装在极简、无干扰的界面中，专为效率而设计。',
      list: {
        history: {
          title: '剪贴板历史',
          desc: '记录你复制的所有内容。文本、图片、链接和文件都会被安全存储。'
        },
        search: {
          title: '即时搜索',
          desc: '通过强大的模糊搜索瞬间找到任何复制项。只需输入即可过滤。'
        },
        image: {
          title: '图片支持',
          desc: '直接在历史列表中预览复制的图片。支持拖拽到任何地方使用。'
        },
        keyboard: {
          title: '键盘优先',
          desc: '无需离开键盘即可导航、搜索和粘贴。支持自定义快捷键。'
        },
        crossPlatform: {
          title: '跨平台支持',
          desc: '支持 Windows 和 macOS。在你的设备间获得无缝体验。'
        },
        privacy: {
          title: '隐私安全',
          desc: '你的数据只保留在本地设备。无云同步，无追踪，完全隐私。'
        }
      }
    },
    download: {
      title: '准备好提升效率了吗？',
      subtitle: '立即下载 ClipHist 并掌控你的剪贴板历史。免费且开源。',
      windows: {
        name: 'Windows',
        desc: 'Windows 10/11 (x64)',
        btn: '下载安装包'
      },
      mac: {
        name: 'macOS',
        desc: 'macOS 11+ (Intel & Apple Silicon)',
        btn: '下载 DMG'
      }
    },
    footer: {
      privacy: '隐私政策',
      terms: '服务条款'
    },
    theme: {
      light: '浅色',
      dark: '深色',
      system: '跟随系统'
    }
  }
}

const i18n = createI18n({
  legacy: false, // use Composition API
  locale: 'zh', // default locale
  fallbackLocale: 'en',
  messages
})

export default i18n
