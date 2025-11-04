# Biblical Trivia Quest (BTQ-Project)

A full-stack Bible trivia game application built with React, TypeScript, Express, and PostgreSQL.

## Features

- Single Player and Multiplayer game modes
- Question-based and Time-based game types
- Multiple categories: Old Testament, New Testament, Bible Stories, Famous People, Theme-Based
- Difficulty levels: Beginner, Intermediate, Advanced
- Real-time multiplayer gameplay
- Leaderboard system
- Reward system for achievements
- Voice narration with ElevenLabs integration
- Admin panel for question management

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Express.js, Node.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: WebSockets for multiplayer

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/wttaideveloper/BTQ-Project.git
cd BTQ-Project
```

2. Install dependencies:
```bash
npm install
```

3. Set up the database:
```bash
npm run db:init-full
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5001`

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:init` - Initialize database
- `npm run db:push` - Push database schema changes

## Project Structure

```
BiblicalTriviaQuest-2/
├── client/          # React frontend application
├── server/          # Express backend API
├── shared/          # Shared types and schemas
└── dist/            # Production build output
```

## License

MIT

