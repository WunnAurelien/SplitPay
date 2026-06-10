module.exports = {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx,html}'
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [
    require('daisyui')
  ],
  daisyui: {
    themes: [
      'dark'
    ]
  }
}
