# Set up OpenAI for edu-cloud

Each person runs edu-cloud with their **own OpenAI API key and API credits**. The repository does not include a working key or pay for your usage. You can upload and read books without a key; AI analysis requires one.

## 1. Add API credits

Sign in to the [OpenAI Platform](https://platform.openai.com/) and open [API billing](https://platform.openai.com/settings/organization/billing/overview). Add a payment method and purchase API credits if your account uses prepaid billing, or enable the billing arrangement available to your account. Check your available balance and usage limits before analyzing books. OpenAI's [official API quickstart](https://developers.openai.com/api/docs/quickstart) covers API keys and adding credits.

edu-cloud calls the OpenAI API directly. Analysis costs are charged to your OpenAI account; running the app locally does not make model calls free.

## 2. Create your API key

Open [API keys](https://platform.openai.com/api-keys), choose the project you want to use, and create a secret key. Keep it for the next step. Never put it in a GitHub issue, screenshot, or source file.

## 3. Put the key in the root `.env` file

From the `edu-cloud` folder, create your local environment file once:

```sh
cp .env.example .env
```

If `.env` already exists, edit it instead of overwriting it. Open `.env` in your editor and replace the blank key with your own:

```dotenv
OPENAI_API_KEY=paste_your_own_key_here
OPENAI_MODEL=gpt-5.6-luna
```

The file belongs next to `package.json`, not inside `projects/frontend` or `projects/backend`. Replace the placeholder; do not paste the example text as a key. Keep the model provided in `.env.example` unless you deliberately choose another model supported by your account and compatible with structured outputs.

**No code changes are needed.** The existing local setup reads the root `.env` and makes the key available to the backend Worker. The browser does not receive the key. `.env` is ignored by Git; `.env.example` remains a blank template for everyone else.

## 4. Start or restart the app

```sh
npm run dev
```

If the app is already running, stop it with **Ctrl+C** and run that command again after changing `.env`. Open [the local app](http://127.0.0.1:3400).

The “OpenAI is not configured” notice should disappear. This confirms a key is configured, not that OpenAI has validated the key or account balance. Upload your own PDF, open a chapter, and choose **Analyze this chapter** to make the first request. The optional generated sample is also available for a small initial check.

## 5. Understand when credits are used

- Uploading books, reading saved results, and saving notes or practice cases do not call OpenAI.
- Analyzing a chapter or practice case uses your API credits.
- Large chapters use multiple requests. Explicit retries and new reviews can incur additional usage; completed chapter sections are reused where possible.
- View usage and billing in your OpenAI dashboard. No fixed per-book cost is promised: it depends on the model and the amount of text processed.

## Troubleshooting

| Message                             | What to check                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| OpenAI is not configured            | Verify the root `.env` contains a nonempty `OPENAI_API_KEY`, then restart.            |
| OpenAI rejected the API key         | Replace an incorrect or revoked key, save `.env`, and restart.                        |
| Quota or rate limit reached         | Check your API credit balance, billing status, and rate limits; retry when available. |
| Request failed / model access error | Confirm your account can use the configured model.                                    |

Your key and local library stay out of GitHub. AI actions send the relevant chapter or practice-case text to OpenAI for processing; saving a file locally does not send it automatically.
