/** @type {import('tailwindcss').Config} */

// Chargee brand tokens — taken verbatim from the chargee.energy website template.
const purple = {
  50: '#f1eefc',
  100: '#EBE3F7', // light-purple-3
  200: '#C6C5FF', // light-purple
  300: '#9C87F8', // medium-purple
  400: '#8a6fe8',
  500: '#7253e3',
  600: '#6245DE', // dark-purple (brand)
  700: '#5238c0',
  800: '#422e9b',
  900: '#342579',
  950: '#1D1543', // dark-blue (ink)
};

// Warm neutral scale matching the template's beige surfaces + gray text.
const neutral = {
  50: '#F5F4F2', // beige (app background)
  100: '#EDEBE8',
  200: '#D5D3CE', // beige-2 (borders)
  300: '#C2BFB9',
  400: '#A8A49D',
  500: '#79716B', // text-gray-500
  600: '#696969', // text-gray (secondary text)
  700: '#4F4B47',
  800: '#332F2C',
  900: '#1D1543', // dark-blue (headings / ink)
  950: '#140e30',
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        figtree: ['Figtree', 'sans-serif'],
      },
      colors: {
        // Exact Chargee named tokens (use these for new/branded UI).
        'dark-blue': '#1D1543',
        'dark-purple': '#6245DE',
        'medium-purple': '#9C87F8',
        'light-purple': '#C6C5FF',
        'light-purple-3': '#EBE3F7',
        beige: '#F5F4F2',
        'beige-2': '#D5D3CE',
        orange: '#FF8500',
        green: '#16B364',
        'light-green': '#CEEFE1',
        yellow: '#FFD602',
        red: '#FF1F00',
        blue: '#1570EF',
        'text-gray': '#696969',

        // Semantic aliases.
        brand: purple,
        ink: neutral[900],
        cream: neutral[50],

        // Retarget the palettes existing components already use so the whole
        // app reskins to the Chargee look.
        indigo: purple,
        gray: neutral,
        accent: { 50: '#fff3e6', 100: '#ffe3c2', 400: '#ff9d33', 500: '#FF8500', 600: '#e36f00' },
        sun: { 400: '#ffe04d', 500: '#FFD602', 600: '#e0bb00' },
      },
      backgroundImage: {
        'body-gradient':
          'linear-gradient(0deg, rgba(245, 244, 242, 0.40) 0%, rgba(245, 244, 242, 0.40) 100%)',
      },
      fontSize: {
        11: '.6875rem',
        13: '.8125rem',
        15: '.9375rem',
        26: '1.625rem',
        28: '1.75rem',
        42: '2.625rem',
        44: '2.75rem',
        64: '4rem',
        96: '5.875rem',
      },
      lineHeight: {
        104: '104%',
        106: '106%',
        109: '109%',
        116: '116%',
        120: '120%',
        146: '146%',
        160: '160%',
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
        20: '20px',
        '30px': '30px',
      },
      boxShadow: {
        'btn-shadow': '0px 5px 14px 0px rgba(0, 0, 0, 0.10)',
        card: '0px 12px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
