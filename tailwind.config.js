/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 新拟态：底面与卡面是同族的低饱和蓝灰，靠双向阴影区分层次
        canvas: '#E4EAF4',
        card: '#F4F7FC',
        surface: '#F4F7FC',
        well: '#D8E1EF',
        ink: '#000000',
        muted: '#4E586A',
        hairline: '#DCE3EE',
        gold: '#C5A46D',
        chinext: '#426997',
        zone: {
          low: '#20A97B',
          high: '#E65B64',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: ['SF Mono', 'JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        // 凸起：左上高光 + 右下暗影
        raised: '6px 6px 14px rgba(163,177,198,0.55), -6px -6px 14px rgba(255,255,255,1)',
        // hover 抬起：阴影拉长、更柔，同时带一点点落影
        'raised-lg':
          '12px 24px 42px -10px rgba(150,166,190,0.72), -8px -8px 22px rgba(255,255,255,1), 0 30px 44px -26px rgba(32,44,64,0.42)',
        chip: '2px 2px 6px rgba(163,177,198,0.45), -2px -2px 6px rgba(255,255,255,0.95)',
        // 凹陷：inset 双向阴影
        well: 'inset 5px 5px 12px rgba(150,166,190,0.80), inset -5px -5px 12px rgba(255,255,255,1)',
        'well-sm':
          'inset 3px 3px 7px rgba(150,166,190,0.72), inset -3px -3px 7px rgba(255,255,255,1)',
        sheet: '0 -8px 40px -12px rgba(32,44,64,0.22)',
      },
      borderRadius: {
        xl2: '18px',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'card-in': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s ease-in-out infinite linear',
        'card-in': 'card-in 520ms cubic-bezier(0.22, 1, 0.36, 1) backwards',
      },
    },
  },
  plugins: [],
};
