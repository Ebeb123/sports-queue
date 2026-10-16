# ShuttleFlow — Badminton Queue Manager

A queue and court manager for open-play badminton sessions (React Native + Expo + SQLite): add players, check them into the queue, auto-match fair games by level and waiting time, track live courts and win/loss stats.

## Web demo (portfolio)

This app also runs in the browser, so people can try it without installing anything.

- **Live demo:** _add your Vercel link here_
- In the browser, the app uses the same SQLite schema through [sql.js](https://sql.js.org) (SQLite compiled to WebAssembly, served from `public/`). On phones it still uses `expo-sqlite`, so the mobile app is unchanged.
- Visitors start with **fictional sample data**. Their changes are saved only in their own browser, and the **Reset** button in the demo bar restores the sample data.

Run the web version locally:

```bash
npm install
npx expo start --web
```

Build it the way Vercel does:

```bash
npx expo export -p web   # output goes to dist/
```

The `vercel.json` in this folder tells Vercel to run that command and serve `dist/`.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
