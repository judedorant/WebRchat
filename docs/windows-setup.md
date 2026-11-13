# Run WebRchat on Windows with Docker Desktop

This guide runs the project on your own Windows computer. Phases 1–2 provide a foundation page, registration/login, verification/recovery, profiles and sessions. Messaging is not implemented yet. You do not need to install PHP, Composer, Node, MySQL or Redis on Windows.

## 1. Install WSL 2

Open Start, search for PowerShell, right-click it and select **Run as administrator**. Run:

```powershell
wsl --install -d Ubuntu
```

Restart Windows if prompted. Open **Ubuntu** from Start and finish creating your Linux username and password. Password entry does not display characters; that is normal. If Ubuntu is already installed, use your existing installation. In PowerShell, `wsl --list --verbose` should show Ubuntu using version 2. If it shows version 1, run `wsl --set-version Ubuntu 2`.

If Windows reports virtualization is disabled, enable the virtualization feature in your PC's BIOS/UEFI before continuing. Installation may require administrator rights.

## 2. Install and configure Docker Desktop

Download Docker Desktop for Windows from https://www.docker.com/products/docker-desktop/ and install it. Select the WSL 2 backend when offered. Start Docker Desktop and wait until the Docker engine is running.

In Docker Desktop Settings:

- Under **General**, enable **Use the WSL 2 based engine** if shown.
- Under **Resources → WSL Integration**, enable integration for **Ubuntu**.
- Select **Apply & restart** if prompted.

Use Linux containers for this project. Leave Docker Desktop running while using the app. Then open Ubuntu and run:

```bash
docker --version
docker compose version
docker info
```

The first two commands should print version numbers; `docker info` must reach the engine without a connection error. If Docker is unavailable inside Ubuntu, recheck WSL Integration and reopen Ubuntu. Do not install a separate Docker daemon inside Ubuntu for this workflow.

## 3. Download the project ZIP

On https://github.com/judedorant/WebRchat choose **Code → Download ZIP** and save `WebRchat-main.zip` in your Windows **Downloads** folder. The ZIP contains source code and example configuration, not cloud secrets, installed dependencies or databases. The project source is now available on GitHub.

## 4. Extract into Ubuntu

In the Ubuntu terminal, install extraction tools:

```bash
sudo apt-get update
sudo apt-get install -y unzip curl git
mkdir -p ~/projects
```

Find your Windows username by opening `C:\Users` in File Explorer. Replace `WINDOWS_USERNAME` below with the appropriate folder name. If Downloads is elsewhere, use its actual path. Quotes handle spaces in your username.

```bash
unzip "/mnt/c/Users/WINDOWS_USERNAME/Downloads/WebRchat-main.zip" -d ~/projects
cd ~/projects/WebRchat-main
ls
```

You should see `backend`, `frontend`, `compose.yaml`, `scripts` and `README.md`. Keep the project inside Ubuntu's home directory for better Docker filesystem performance. If this folder already exists, preserve your existing project and extract into another directory rather than overwriting it blindly.

## 5. Run first-time setup

Still in Ubuntu, run:

```bash
cd ~/projects/WebRchat-main
bash scripts/setup.sh
```

The first run downloads Docker images and dependencies and can take several minutes. Wait until the script finishes. It creates missing local `.env` files, generates a local application key, prepares MySQL tables, seeds roles and starts the services. The example database/Reverb credentials are for local development only. Do not use these defaults for a public deployment.

Use the command above on your computer. `CLOUD_PROXY_TRUST=1` is only for the managed cloud environment and is not needed on your Windows machine.

## 6. Open the application

In your regular Windows browser, enter:

```text
http://localhost:5173
```

You should see the WebRchat workspace and **API connected**. Select **Get started** to register. Open `http://localhost:8026` for the local inbox, follow the verification email link, and press **Verify email address**. The API health endpoint is `http://localhost:8080/api/v1/health`. You can check it from Ubuntu:

```bash
curl --fail http://localhost:8080/api/v1/health
```

Expected response includes `status: ok`, `database: ready` and `cache: ready`. These addresses work because the app is now running on your computer; the previous cloud instance cannot be reached through your Windows localhost.

## 7. Verify the project

Run in Ubuntu from the project folder:

```bash
bash scripts/verify.sh
```

Expected checks: 34 backend tests, MySQL schema constraints, queue job processing, API readiness, TypeScript/Vite build, 8 frontend tests and lint. This script does not run browser tests; the main README documents the separate Playwright workflow.

To inspect all eight development services:

```bash
docker compose ps
```

They should report healthy after startup. If setup fails, read the error and inspect logs:

```bash
docker compose logs --tail=100 backend mysql redis nginx reverb queue frontend
```

## 8. Stop and restart

Stop the app without deleting your data:

```bash
cd ~/projects/WebRchat-main
docker compose stop
```

Next time, start Docker Desktop, open Ubuntu and run:

```bash
cd ~/projects/WebRchat-main
export LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)"
docker compose up -d --wait
```

Then open `http://localhost:5173` in Windows again. Do not use `docker compose down -v` unless you intentionally want to delete local database and Redis data.

## Troubleshooting

- **Cannot connect to Docker:** start Docker Desktop, wait for the engine, and enable Ubuntu under WSL Integration.
- **ZIP not found:** check the filename, Windows username and actual Downloads location. The Linux path `/workspace/WebRchat` exists only in the cloud; locally use `~/projects/WebRchat-main`.
- **Port already allocated:** stop another application using ports 5173, 8080 or 8081, or configure alternate ports. Root `.env` supports `FRONTEND_PORT` and `APP_PORT`; Reverb's published port is in `compose.yaml`. If the frontend port changes, also update APP_URL, FRONTEND_URL and SANCTUM_STATEFUL_DOMAINS in `backend/.env`, then recreate the services.
- **Browser cannot connect:** check `docker compose ps`, confirm setup finished, and confirm you are opening the browser on the same computer running Docker Desktop.
- **API unavailable:** inspect the backend, MySQL, Redis and Nginx logs. Both root `.env` and `backend/.env` must use matching MySQL credentials. Changing passwords in `.env` does not change credentials inside an already initialized MySQL volume.
- **Dependency or image download failed:** check your Internet connection and Docker Desktop's approved proxy/CA settings if required by your organization. Keep TLS and package verification enabled.

The production deployment template requires additional configuration and future security/features work. This guide is for local development.
