# QR Redirects

Print a QR code now, decide where it goes later.

Each QR code encodes `BASE_URL/r/<id>`. You change the target link in the admin panel at any time. Scans are counted per day.

## Run with Docker

```sh
cp .env.example .env     # set BASE_URL and ADMIN_PASSWORD
docker compose up -d --build
```

Open `BASE_URL/admin` and log in with `ADMIN_PASSWORD`.

| Variable         | Required | Description |
|------------------|----------|-------------|
| `ADMIN_PASSWORD` | yes      | Admin panel password. Changing it logs out all sessions. |
| `BASE_URL`       | yes      | Public URL behind the Cloudflare tunnel, e.g. `https://qr.example.com`. **Encoded in every QR code — don't change it after printing.** |
| `PORT`           | no       | Defaults to `3000`. |
| `SESSION_SECRET` | no       | Defaults to a value derived from the password. |

The SQLite database is stored in the `qrcode-data` volume at `/data/qrcodes.db`. To back up, copy that file.

## Behaviour

- `/r/<id>` with a link: the scan is counted, then a 302 redirect to the target.
- `/r/<id>` without a link: the scan is counted and a friendly "Nothing here yet" page is shown.
- Unknown id: a friendly "not found" page.
- **Restoring an old code:** when creating a project, open "Restore an old QR code" and enter the old ID.

## Local development

```sh
npm install
ADMIN_PASSWORD=test npm run dev
```

Requires Node 22.13+ (uses the built-in `node:sqlite`).
