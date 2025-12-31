/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // scans all your React components
  ],
  theme: {
    extend: {
      colors: {
        primary: "#4f46e5",   // example primary color
        secondary: "#facc15", // example secondary color
      },
    },
  },
  plugins: [],
};
