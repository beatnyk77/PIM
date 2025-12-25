/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}", 
    "./components/**/*.{js,jsx,ts,tsx}", 
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./services/**/*.{js,jsx,ts,tsx}",
    "./navigation/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: '#1C1C1E', // Dark Gray
        secondary: '#8E8E93', // Light Gray
        accent: '#007AFF', // Blue
        background: '#F2F2F7', // Off-white
        surface: '#FFFFFF',
      },
    },
  },
  plugins: [],
}
