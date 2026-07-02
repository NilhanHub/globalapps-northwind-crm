# Hostinger VPS Deployment Guide

## Prerequisites

- A Hostinger VPS with Ubuntu 22.04+ (or any Debian-based distro)
- SSH access to the VPS
- A domain pointed to the VPS IP (optional)

## Step 1 — SSH In

```bash
ssh root@<your-vps-ip>
```

## Step 2 — Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node --version   # Should be 22.x
```

## Step 3 — Clone the Repository

```bash
git clone https://github.com/<your-org>/CRM.git /opt/northwind-crm
cd /opt/northwind-crm
```

## Step 4 — Set Environment Variables

```bash
# Generate a password hash
PASS_HASH=$(node -e "console.log(require('crypto').createHash('sha256').update('your-secure-password').digest('hex'))")

cat >> /opt/northwind-crm/.env <<EOF
PORT=8787
CRM_USERNAME=1bt-user
CRM_PASSWORD_HASH=$PASS_HASH
NODE_ENV=production
EOF
```

## Step 5 — Install PM2 (Production Process Manager)

```bash
npm install -g pm2
pm2 start server.js --name northwind-crm
pm2 save
pm2 startup   # Follow the instructions to enable auto-start on reboot
```

## Step 6 — Firewall

```bash
ufw allow 8787/tcp
ufw enable
```

The app is now running at `http://<your-vps-ip>:8787`.

## Step 7 — Optional: Reverse Proxy with Nginx

If you want to serve on port 80/443 with a domain:

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/northwind-crm`:

```nginx
server {
    listen 80;
    server_name crm.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/northwind-crm /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d crm.yourdomain.com
```

## Step 8 — Verify

Visit your domain or IP. You should see the login page.
Login with `1bt-user` and the password you set.

## Useful PM2 Commands

- `pm2 status` — check if the app is running
- `pm2 logs northwind-crm` — tail the logs
- `pm2 restart northwind-crm` — restart after config changes
- `pm2 stop northwind-crm` — stop the app

## Data Directory

Data files are stored in the project root by default.
Set `CRM_DATA_DIR` to a persistent path if needed:

```bash
export CRM_DATA_DIR=/var/lib/northwind-crm
pm2 restart northwind-crm
```

## Updating

```bash
cd /opt/northwind-crm
git pull
pm2 restart northwind-crm
```
