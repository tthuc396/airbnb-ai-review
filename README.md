# Airbnb Review Reply Desk

Airbnb Review Reply Desk is a local tool for hosts. It loads guest reviews, creates several warm reply options with AI, lets you choose or edit one, and then posts the selected reply.

You can run it in two ways:

- **Demo mode:** works right away with sample reviews. No Airbnb connection needed.
- **Live mode:** connects to an approved Airbnb partner API or property-management-system API so it can load and post real replies.

Airbnb does not provide a public review/reply API for ordinary accounts, so live posting requires partner/PMS credentials.

## What You Need

Before starting, install:

1. **Node.js**
   This lets your computer run the app. Download the **LTS** version from `https://nodejs.org`.

2. **An OpenAI API key**
   This lets the app write reply suggestions. A normal ChatGPT login is not always the same as API access, so follow the API key steps below.

3. **Optional Airbnb/PMS API credentials**
   Only needed if you want to load and post real reviews. Without these, the app uses demo reviews.

## Installation

### 1. Open the Project Folder

If you downloaded the project from GitHub, open Terminal and run:

```sh
git clone https://github.com/tthuc396/airbnb-ai-review.git
cd airbnb-ai-review
```

If you already have the project folder on your computer, open Terminal, type `cd ` with a space after it, drag the project folder into the Terminal window, then press Enter.

### 2. Check That Node.js Works

Run:

```sh
node --version
```

If you see a version like `v18`, `v20`, or newer, you are ready.

If you see an error, install Node.js from `https://nodejs.org`, then close and reopen Terminal.

### 3. Get Your OpenAI API Key

The app needs an OpenAI API key before it can generate replies.

1. Go to `https://platform.openai.com`.
2. Sign in or create an account.
3. Open the API keys page. You can usually find it from the dashboard under **API keys**.
4. Click **Create new secret key**.
5. Give it a simple name, like `Airbnb Review Reply Desk`.
6. Copy the key when it appears.

Important:

- The key usually starts with `sk-`.
- You may only see it once, so copy it before closing the page.
- Keep it private. Do not paste it into GitHub, email, or public chat.
- If OpenAI asks you to add billing, follow their billing setup. The app cannot generate replies unless the API key is active.

### 4. Create Your Settings File

Copy the example settings file:

```sh
cp .env.example .env
```

Open `.env` in a text editor.

On Mac, you can usually open it with:

```sh
open -e .env
```

Find this line:

```txt
OPENAI_API_KEY=your_api_key_here
```

Replace `your_api_key_here` with your real OpenAI API key.

Example:

```txt
OPENAI_API_KEY=sk-your-real-key
```

Save the file.

Your `.env` file should look similar to this:

```txt
OPENAI_API_KEY=sk-your-real-key
OPENAI_BASE_URL=https://api.openai.com
OPENAI_MODEL=gpt-5.2
OPENAI_TIMEOUT_MS=30000
PORT=5173
```

Leave the other settings alone unless you have live Airbnb/PMS API credentials.

## Run the App

In Terminal, run:

```sh
npm run dev
```

You should see:

```txt
Airbnb Review Reply Desk running at http://localhost:5173
```

Open this address in your browser:

```txt
http://localhost:5173
```

Keep the Terminal window open while using the app. If you close it, the app stops.

To stop the app later, click the Terminal window and press:

```txt
Control + C
```

## How to Use It

1. Click **Load reviews**.
2. Choose a review from the left side.
3. Click **Generate versions**.
4. Pick the reply version you like.
5. Edit the reply if needed.
6. Click **Post reply**.

In demo mode, posting only saves the reply locally for the sample review. It does not post to Airbnb.

## Live Airbnb/PMS Setup

Live mode requires credentials from an approved Airbnb partner API or your property-management-system provider.

In `.env`, fill these in:

```txt
AIRBNB_API_BASE_URL=
AIRBNB_API_TOKEN=
AIRBNB_REVIEWS_PATH=/reviews
AIRBNB_REPLY_PATH_TEMPLATE=/reviews/:id/reply
```

Ask your PMS or API provider for:

- the base API URL
- the API token
- the endpoint for loading reviews
- the endpoint for posting a reply

After changing `.env`, stop the app with `Control + C`, then start it again:

```sh
npm run dev
```

## Settings Explained

| Setting | What it means |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI key. Required for AI reply generation. |
| `OPENAI_BASE_URL` | OpenAI API URL. Leave as `https://api.openai.com`. |
| `OPENAI_MODEL` | The AI model used for writing replies. |
| `OPENAI_TIMEOUT_MS` | How long to wait for OpenAI before showing an error. |
| `PORT` | The local browser port. Default is `5173`. |
| `AIRBNB_API_BASE_URL` | Your approved Airbnb/PMS API base URL. |
| `AIRBNB_API_TOKEN` | Your approved Airbnb/PMS API token. |
| `AIRBNB_TIMEOUT_MS` | How long to wait for the Airbnb/PMS API. |
| `AIRBNB_REVIEWS_PATH` | API path used to load reviews. |
| `AIRBNB_REPLY_PATH_TEMPLATE` | API path used to post a reply. `:id` is replaced with the review ID. |

## Test That Everything Works

Run:

```sh
npm test
```

If everything is working, you will see:

```txt
Smoke tests passed.
```

These tests do not use real Airbnb or OpenAI calls. They use local mock services.

## Common Problems

### “Missing OPENAI_API_KEY”

Your `.env` file is missing the OpenAI key, or the app was not restarted after editing it.

Fix:

1. Open `.env`.
2. Add your key after `OPENAI_API_KEY=`.
3. Save the file.
4. Stop the app with `Control + C`.
5. Run `npm run dev` again.

### “Demo reviews”

This is normal if you have not added Airbnb/PMS API credentials. Demo mode lets you test the workflow without posting anything live.

### “Could not reach OpenAI”

Check your internet connection and OpenAI API key.

### “Could not reach the Airbnb/PMS API”

Check your live API URL, token, and endpoint paths.

## Important Safety Notes

- Always read the AI reply before posting.
- Do not paste private guest details into public replies.
- The app avoids sensitive personal details, but the host is responsible for the final posted message.
- Live posting only works through approved partner/PMS API access.

## More Technical Details

Implementation details are in:

```txt
docs/IMPLEMENTATION.md
```
