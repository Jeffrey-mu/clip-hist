<script setup lang="ts">
import { Download, Monitor, Command, Search, Image, Shield, Github, ClipboardList, Languages, Sun, Moon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useDark, useToggle } from '@vueuse/core';

const { t, locale } = useI18n();
const isDark = useDark({
  selector: 'html',
  attribute: 'class',
  valueDark: 'dark',
  valueLight: '',
});
const toggleDark = useToggle(isDark);

const features = [
  { icon: ClipboardList, key: 'history' },
  { icon: Search, key: 'search' },
  { icon: Image, key: 'image' },
  { icon: Command, key: 'keyboard' },
  { icon: Monitor, key: 'crossPlatform' },
  { icon: Shield, key: 'privacy' }
];

const downloadLinks = {
  windows: '/downloads/ClipHist-Setup.exe',
  mac: '/downloads/ClipHist.dmg'
};

const toggleLanguage = () => {
  locale.value = locale.value === 'zh' ? 'en' : 'zh';
};
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-300 selection:bg-blue-500 selection:text-white">
    <!-- Navigation -->
    <nav class="container mx-auto px-6 py-6 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-50">
      <div class="flex items-center gap-2 font-bold text-xl tracking-tight">
        <div class="bg-blue-600 p-1.5 rounded-lg">
          <img src="/app-icon.png" alt="App Icon" class="w-6 h-6" />
        </div>
        <span>ClipHist</span>
      </div>
      
      <div class="hidden md:flex gap-8 text-sm font-medium text-slate-500 dark:text-slate-400">
        <a href="#features" class="hover:text-blue-600 dark:hover:text-white transition-colors">{{ t('nav.features') }}</a>
        <a href="#download" class="hover:text-blue-600 dark:hover:text-white transition-colors">{{ t('nav.download') }}</a>
        <a href="https://github.com/jeffrey-mu/clip-hist" target="_blank" class="hover:text-blue-600 dark:hover:text-white transition-colors flex items-center gap-1">
          <Github class="w-4 h-4" />
          {{ t('nav.github') }}
        </a>
      </div>

      <div class="flex items-center gap-3">
        <!-- Theme Toggle -->
        <button @click="toggleDark()" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" :title="t('theme.system')">
          <Sun v-if="isDark" class="w-5 h-5 text-amber-500" />
          <Moon v-else class="w-5 h-5 text-blue-600" />
        </button>

        <!-- Language Toggle -->
        <button @click="toggleLanguage" class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 text-sm font-medium">
          <Languages class="w-5 h-5" />
          <span class="hidden sm:inline">{{ locale === 'zh' ? 'EN' : '中文' }}</span>
        </button>

        <a href="#download" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95">
          {{ t('nav.getStarted') }}
        </a>
      </div>
    </nav>

    <!-- Hero Section -->
    <header class="container mx-auto px-6 py-20 md:py-32 text-center">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-500/20 mb-8">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
        </span>
        {{ t('hero.newVersion') }}
      </div>
      
      <h1 class="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-8 bg-gradient-to-b from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 bg-clip-text text-transparent pb-2 leading-tight">
        {{ t('hero.title') }}<br/>
        <span class="text-blue-600 dark:text-blue-500">{{ t('hero.subtitle') }}</span>
      </h1>
      
      <p class="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
        {{ t('hero.description') }}
      </p>
      
      <div class="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
        <a :href="downloadLinks.windows" class="w-full sm:w-auto flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95">
          <Monitor class="w-5 h-5" />
          <span>{{ t('hero.downloadWindows') }}</span>
        </a>
        <a :href="downloadLinks.mac" class="w-full sm:w-auto flex items-center justify-center gap-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white px-8 py-4 rounded-xl font-semibold transition-all border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 active:scale-95">
          <Command class="w-5 h-5" />
          <span>{{ t('hero.downloadMac') }}</span>
        </a>
      </div>

      <!-- App Preview -->
      <div class="relative max-w-[752px] mx-auto rounded-xl bg-slate-100 dark:bg-slate-800/50 p-2 border border-slate-200 dark:border-slate-700/50 shadow-2xl backdrop-blur-sm group overflow-hidden">
        <div class="aspect-[752/582] rounded-lg bg-white dark:bg-slate-900 overflow-hidden relative">
          <img 
            :src="isDark ? '/preview-dark.png' : '/preview-light.png'" 
            alt="App Screenshot Preview" 
            class="w-full h-full object-cover"
          />
        </div>
        <!-- Light reflection effect -->
        <div class="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent skew-x-12"></div>
      </div>
    </header>

    <!-- Features Section -->
    <section id="features" class="py-24 bg-slate-50 dark:bg-slate-900/50">
      <div class="container mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold mb-4">{{ t('features.title') }}</h2>
          <p class="text-slate-600 dark:text-slate-400 max-w-xl mx-auto">{{ t('features.subtitle') }}</p>
        </div>
        
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div v-for="(feature, index) in features" :key="index" class="p-6 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-blue-500/30 dark:hover:border-slate-600 transition-all group">
            <div class="w-12 h-12 bg-slate-100 dark:bg-slate-900 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-slate-200 dark:border-slate-700 group-hover:border-blue-500/50">
              <component :is="feature.icon" class="w-6 h-6 text-blue-600 dark:text-blue-500" />
            </div>
            <h3 class="text-xl font-semibold mb-3">{{ t(`features.list.${feature.key}.title`) }}</h3>
            <p class="text-slate-600 dark:text-slate-400 leading-relaxed">{{ t(`features.list.${feature.key}.desc`) }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Download CTA -->
    <section id="download" class="py-24 relative overflow-hidden">
      <div class="absolute inset-0 bg-blue-600/5 dark:bg-blue-600/5"></div>
      <div class="container mx-auto px-6 relative text-center">
        <h2 class="text-3xl md:text-4xl font-bold mb-8">{{ t('download.title') }}</h2>
        <p class="text-slate-600 dark:text-slate-400 mb-12 max-w-xl mx-auto">{{ t('download.subtitle') }}</p>
        
        <div class="flex flex-col sm:flex-row items-center justify-center gap-6">
          <div class="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm hover:border-blue-500/50 transition-all hover:shadow-xl dark:hover:shadow-blue-900/10">
            <Monitor class="w-12 h-12 text-blue-600 dark:text-blue-500 mx-auto mb-6" />
            <h3 class="text-xl font-bold mb-2">{{ t('download.windows.name') }}</h3>
            <p class="text-slate-500 dark:text-slate-400 text-sm mb-6">{{ t('download.windows.desc') }}</p>
            <a :href="downloadLinks.windows" class="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/20">
              <Download class="w-4 h-4" />
              {{ t('download.windows.btn') }}
            </a>
          </div>
          
          <div class="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm hover:border-slate-400 dark:hover:border-slate-600 transition-all hover:shadow-xl">
            <Command class="w-12 h-12 text-slate-400 dark:text-slate-300 mx-auto mb-6" />
            <h3 class="text-xl font-bold mb-2">{{ t('download.mac.name') }}</h3>
            <p class="text-slate-500 dark:text-slate-400 text-sm mb-6">{{ t('download.mac.desc') }}</p>
            <a :href="downloadLinks.mac" class="flex items-center justify-center gap-2 w-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white py-3 rounded-lg font-medium transition-colors shadow-lg">
              <Download class="w-4 h-4" />
              {{ t('download.mac.btn') }}
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="py-12 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-500 text-sm">
      <div class="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
        <div class="flex items-center gap-2">
          <ClipboardList class="w-5 h-5 text-blue-600" />
          <span class="font-semibold text-slate-900 dark:text-slate-300">ClipHist</span>
          <span>&copy; {{ new Date().getFullYear() }}</span>
        </div>
        <div class="flex gap-6">
          <a href="#" class="hover:text-blue-600 dark:hover:text-slate-300 transition-colors">{{ t('footer.privacy') }}</a>
          <a href="#" class="hover:text-blue-600 dark:hover:text-slate-300 transition-colors">{{ t('footer.terms') }}</a>
          <a href="https://github.com/jeffrey-mu/clip-hist" target="_blank" class="hover:text-blue-600 dark:hover:text-slate-300 transition-colors flex items-center gap-2">
            <Github class="w-4 h-4" />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>

<style>
html {
  scroll-behavior: smooth;
}

/* Base transitions for dark mode */
.transition-colors {
  transition-property: background-color, border-color, color, fill, stroke, box-shadow;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 300ms;
}
</style>
