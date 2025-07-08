# Fantasy Flow ⚾

**Fantasy Flow** is a sleek, modern, and powerful dashboard for your ESPN Fantasy Baseball league. Built with React, TypeScript, and Tailwind CSS, it provides an intuitive and feature-rich interface to track your team's performance, analyze weekly stats, and dominate your league.

![Fantasy Flow Screenshot](https://i.imgur.com/your-screenshot.png) 
*Note: Replace with a real screenshot of the app!*

---

## ✨ Features

- **Dynamic Dashboard**: A clean, centralized view of your league, including real-time standings, weekly schedules, and team performance metrics.
- **Automatic Standings Refresh**: Standings automatically update after the weekly Monday 4 AM ET deadline, ensuring you always have the latest data without manual refreshes.
- **Detailed Weekly Stats**: Dive deep into batting and pitching statistics for any team, for any week of the season.
- **End-of-Week Projections**: Get a competitive edge with stat projections based on historical player performance data.
- **Daily Lineup View**: See daily starters, bench players, and injured list status, complete with player headshots and daily MLB stats (when available).
- **Secure Credential Management**: A one-time setup screen to securely enter your ESPN credentials, which are stored locally on your device.
- **Responsive Design**: A fully responsive interface that works beautifully on desktop, tablet, and mobile devices.
- **Modern Tech Stack**: Built with Vite, React, and shadcn/ui for a fast, reliable, and beautiful user experience.

---

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui
- **Data Fetching**: Axios, Recharts for charts
- **API**: Integrates with the unofficial ESPN Fantasy API and the official MLB Stats API.

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or newer recommended)
- A modern web browser (Chrome, Firefox, Safari, Edge)

### Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/your-username/espn-fantasy-baseball-tracker.git
    cd espn-fantasy-baseball-tracker
    ```
    *Replace `your-username/espn-fantasy-baseball-tracker` with your repository URL.*

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run the Development Server**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:3003` (or the next available port).

### First-Time Setup

On your first visit, you will be greeted with a setup screen. You need to provide three pieces of information to connect the app to your ESPN league:

- **League ID**: The unique ID for your fantasy league.
- **ESPN_S2**: Your ESPN authentication token.
- **SWID**: Your ESPN software identification token.

The app provides a built-in **Help!** guide with detailed, browser-specific instructions on how to find these values. Once entered, they are stored securely in your browser's local storage for future visits.

---

## 📖 Project Structure

The project follows a standard Vite + React setup, with a focus on clear separation of concerns.

```
/src
├── /components         # UI components (dashboard, stats, lineup)
│   ├── /ui             # Reusable UI elements from shadcn/ui
│   └── ...
├── /context            # React context for state management (DataContext)
├── /services           # API interaction and data processing
├── /styles             # Global CSS styles
├── /types              # TypeScript type definitions
├── /utils              # Utility functions (date helpers, etc.)
├── App.tsx             # Main application component
└── main.tsx            # Application entry point
```

---

## 📜 Available Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Bundles the app for production.
- `npm run preview`: Serves the production build locally.
- `npm run lint`: Lints the codebase with ESLint.

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for new features or improvements, feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.