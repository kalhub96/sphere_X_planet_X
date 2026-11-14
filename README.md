<<<<<<< HEAD
<<<<<<< HEAD
# sphere_X_planet_X
=======
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
=======
# Sphere X Planet X
>>>>>>> cb521aa (Add .nvmrc file and update README with system requirements)

A modern web application built with [Next.js](https://nextjs.org), [React](https://react.dev), [TypeScript](https://www.typescriptlang.org/), and [Tailwind CSS](https://tailwindcss.com/).

---

## 📋 System Requirements & Prerequisites

Before downloading and installing this project, ensure your computer meets the following requirements:

| Requirement | Minimum Version | Recommended Version | Description |
| ----------- | --------------- | ------------------- | ----------- |
| **Node.js** | `>= 20.9.0`     | `22.x` or `24.x`    | JavaScript runtime required to run Next.js |
| **npm**     | `>= 10.0.0`     | Latest              | Package manager (bundled with Node.js) |
| **OS**      | Windows, macOS, or Linux | -          | Any modern operating system |

> [!NOTE]
> Alternative package managers such as **pnpm** (`>= 9.0.0`), **yarn** (`>= 1.22.0`), or **bun** (`>= 1.0.0`) are also supported.

### How to Check Your Installed Versions

Open your terminal or command prompt and run:

```bash
node -v
npm -v
```

If you do not have Node.js installed, download it from [nodejs.org](https://nodejs.org/). If you use [nvm](https://github.com/nvm-sh/nvm), run:

```bash
nvm install
nvm use
```

---

## 🚀 Installation Guide

Follow these steps to set up and run the application locally:

### 1. Download / Clone the Repository

If using Git:
```bash
git clone https://github.com/your-username/sphere-x-planet-x.git
cd sphere_X_planet_X
```

If you downloaded a ZIP file:
1. Extract the `.zip` archive.
2. Open your terminal and navigate to the extracted folder:
   ```bash
   cd path/to/sphere_X_planet_X
   ```

### 2. Install Dependencies

Install all required packages by running:

```bash
npm install
```

*(Or `pnpm install`, `yarn install`, `bun install` if using another package manager)*

### 3. Run the Development Server

Start the local development server:

```bash
npm run dev
```

Once started, open your browser and visit:
👉 **[http://localhost:3000](http://localhost:3000)**

Any edits made in [`src/app/page.tsx`](src/app/page.tsx) will update in real time.

---

## 🛠 Available Scripts

In the project directory, you can run:

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Starts the development server on `http://localhost:3000` with Turbopack |
| `npm run build` | Compiles and optimizes the app for production deployment |
| `npm run start` | Starts the production server (requires `npm run build` first) |
| `npm run lint` | Runs ESLint to check for code issues and styling errors |

---

## 📁 Project Structure

```text
├── public/              # Static assets (images, icons, svgs)
├── src/
│   └── app/
│       ├── favicon.ico  # Website favicon
│       ├── globals.css  # Global styles and Tailwind directives
│       ├── layout.tsx   # Root layout wrapping all pages
│       └── page.tsx     # Homepage entry component
├── .gitignore           # Git ignore rules
├── .nvmrc               # Node Version Manager specification
├── eslint.config.mjs    # ESLint configuration
├── next.config.ts       # Next.js configuration
├── package.json         # Project metadata and dependencies
├── README.md            # Project documentation and guide
└── tsconfig.json        # TypeScript configuration
```

<<<<<<< HEAD
Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
>>>>>>> 8f4791b (Initial commit from Create Next App)
=======
---

## ❓ Troubleshooting

<details>
<summary><b>Error: Node.js version is not supported</b></summary>

Next.js 16 requires Node.js version `20.9.0` or higher. Please upgrade Node.js via [nodejs.org](https://nodejs.org/) or switch using `nvm use 22`.
</details>

<details>
<summary><b>Port 3000 is already in use</b></summary>

If port 3000 is taken, Next.js will automatically try the next available port (e.g., `http://localhost:3001`), or you can specify a custom port:
```bash
npm run dev -- -p 3001
```
</details>

<details>
<summary><b>Dependency issues or clean reinstall</b></summary>

If you encounter issues after updating, delete `node_modules` and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```
*(On Windows PowerShell: `Remove-Item -Recurse -Force node_modules, package-lock.json` then `npm install`)*
</details>
>>>>>>> cb521aa (Add .nvmrc file and update README with system requirements)
