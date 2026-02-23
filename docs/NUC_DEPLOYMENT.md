# NUC Production Deployment Guide

Complete guide for deploying the Radio Forms Portal to an ASUS NUC 14 N150 as the primary production server, with AWS EC2 retained as backup/failover.

---

## Overview

### Why NUC?
- **Cost**: One-time hardware cost vs ~$73/month AWS EC2 (t3.large + EBS + transfer)
- **Performance**: 16GB DDR5 RAM, 1TB NVMe SSD — significantly exceeds Form.io's minimum requirements
- **Control**: Full hardware control, no cloud vendor dependency for day-to-day operation
- **Backup**: EC2 remains available for disaster recovery (can be downsized to t3.small ~$15/month when idle)

### Architecture
```
Internet → Verizon CR1000A (ports 80/443/51820 forwarded) → NUC (192.168.1.50)
                                                               │
                                                         Docker Stack:
                                                         ├── Caddy (reverse proxy + SSL)
                                                         ├── Form.io CE (API, port 3001)
                                                         ├── MongoDB 6 (port 27017)
                                                         └── mongo-backup (S3 + local)

Remote Access: Mac ──WireGuard VPN (UDP 51820)──► NUC wg0 (10.8.0.1)
               Mac 10.8.0.2 → ssh admin@10.8.0.1 (port 22 not exposed publicly)
```

---

## Prerequisites

### Hardware
- **ASUS NUC 14 N150** with 16GB DDR5 RAM and 1TB NVMe SSD
- **CyberPower GX1500U UPS** (pure sine wave, 1500VA/900W) — connect NUC + modem + router
- Ethernet cable (Cat 6 or better) — **wired only, no Wi-Fi**

### Software to Prepare (on your Mac)
- **Debian 12 DVD-1 ISO** (~4.7 GB) — **NOT the netinst image**
  - The NUC's Realtek RTL8125 2.5GbE controller requires drivers not present in netinst
  - Download: https://cdimage.debian.org/debian-cd/current/amd64/iso-dvd/
  - Filename: `debian-12.x.x-amd64-DVD-1.iso`
- **Balena Etcher** or `dd` to write the ISO to a USB drive

### Network Requirements
- Domain name with DNS control (Route 53 or equivalent)
- Public IP from ISP (static preferred; if dynamic, set up DDNS — see Phase 7)
- Port forwarding capability on Verizon CR1000A (ports 80 and 443 only)

---

## Phase 1: Hardware Setup & OS Installation

### 1.1 Prepare Installation Media (on your Mac)

**Use the Debian 12 netinst ISO** (not the DVD-1 ISO — see note below).

Download: **https://www.debian.org/distrib/netinst** → amd64 netinst (~400MB)

> **Why netinst, not DVD-1**: The DVD-1 ISO installs offline but configures apt to use the SD card/USB as its package source after install, causing "insert cdrom" errors. It also does not reliably include the RTL8125 driver in the installer's hardware detection. The netinst ISO fetches packages from the internet during install — use WiFi (WLAN) during install to get online, then disable WLAN after the RTL8125 driver is installed.

**Write the ISO using Balena Etcher** (most reliable on macOS):

1. Download from **https://etcher.balena.io** → "Download for macOS"
2. Open the `.dmg`, drag to Applications, launch Etcher
3. Click **"Flash from file"** → select the netinst `.iso`
4. Click **"Select target"** → choose your SD card or USB drive
5. Click **"Flash!"** — writes and verifies automatically
6. When it shows **"Flash Complete!"** → eject

> **SD card vs USB drive**: An SD card (via Mac's SD slot) is more reliable than USB drives for writing ISOs on macOS. Some USB drives have hardware write protection that silently rejects raw ISO writes even when `dd` or Etcher reports success.

**Alternative: `dd` (command line)** — only use if Etcher is unavailable:

```bash
# Identify your media (e.g., /dev/disk4)
diskutil list

# Erase first to clear existing partition scheme:
diskutil eraseDisk FAT32 BLANK MBRFormat /dev/disk4

# Unmount and write — /dev/rdisk4 (with 'r') is required, NOT /dev/disk4
diskutil unmountDisk /dev/disk4
sudo dd if=~/Downloads/debian-12.13.0-amd64-netinst.iso of=/dev/rdisk4 bs=1m status=progress
```

Verify success — `diskutil list` must show `FDisk_partition_scheme` (not `Apple_partition_scheme`). If it still shows `Apple_partition_scheme`, the write failed — use Etcher or try an SD card.

### 1.2 BIOS Configuration

#### Entering BIOS

- If Debian is already installed, the GRUB menu appears first — select **"UEFI Firmware Settings"** to enter BIOS
- On a fresh/blank NUC, press **F2** at power-on before any OS loads

#### Onboard Devices (`Advanced → Onboard Devices`)

- **WLAN** → **Disabled** (the BIOS label for Wi-Fi)
- **Bluetooth** → **Disabled** — on this NUC, WLAN and Bluetooth share a single toggle; disabling WLAN disables both

#### Power Management (`Advanced → Power Management` or `Power` tab)

- **After Power Failure** / **AC Power Recovery** → **Power On**
  Critical: ensures the NUC automatically restarts after a power outage (even if the UPS runs out)
- **ErP Ready** / **EuP Ready** → **Disabled**
  This energy-saving mode can prevent auto power-on after outage
- **Wake on LAN** → **Enabled** (optional — allows remote wake if NUC ever powers off)
- Any **S3 / S4 sleep state** or **Suspend** setting → **Disabled** if present

#### Boot (`Boot` tab)

- **Fast Boot** → **Disabled** (can cause USB detection issues during recovery)
- **Boot Order**:
  - When installing from DVD: **USB must be set first** — the NUC will not attempt USB boot otherwise, even with a USB inserted
  - The USB entry appears as something like `UEFI: [USB brand name] Partition 1` — if it does not appear, the USB is not recognized (see troubleshooting below)
  - The Debian installer resets boot order to internal NVMe automatically after install
  - After installation: confirm NVMe is first, USB second (for future recovery)

> **Re-installing over existing Debian**: If Debian was previously installed without the RTL8125 driver, boot from the DVD-1 USB and select **"Install"** (not upgrade). The installer will overwrite the existing OS cleanly. The DVD-1 ISO includes the correct driver — Ethernet will work after the fresh install.
>
> **Symptom of wrong boot order**: If you see `r8169 0000:xx:xx.x: unknown chip XID 688` on boot, the NUC is booting the existing broken Debian from NVMe, not the USB installer. Return to BIOS and move USB above NVMe in boot order.

#### USB Not Appearing in Boot Order

If the USB drive does not appear as a boot option in BIOS:
1. Try a different USB port — use a **rear USB 3.2 Type-A port**, not the USB 2.0 port
2. Verify the ISO was written correctly on your Mac:
   ```bash
   diskutil list
   # The USB should show as a single partition with the Debian ISO label, not blank/unformatted
   ```
3. If the write looks wrong, redo it — **unmount first, use `rdisk` not `disk`**:
   ```bash
   diskutil unmountDisk /dev/disk4
   sudo dd if=~/Downloads/debian-12.13.0-amd64-DVD-1.iso of=/dev/rdisk4 bs=1m status=progress
   # The 'r' in rdisk4 is critical — it bypasses macOS buffering and writes directly
   # Using /dev/disk4 (without 'r') appears to succeed but does NOT write the ISO correctly
   # Wait for the shell prompt to fully return before doing anything else
   ```
4. Verify the write succeeded — `diskutil list` should show `FDisk_partition_scheme` (not `Apple_partition_scheme`):
   ```
   /dev/disk4 (external, physical):
      0:     FDisk_partition_scheme              *4.0 GB    disk4
      1:                 DOS_FAT_32 DEBIAN       3.9 GB     disk4s1
   ```
   If it still shows `Apple_partition_scheme`, the write failed — repeat step 3.
5. Eject safely before removing: `diskutil eject /dev/disk4`

#### Save and Exit

- Press **F10** to save all changes and reboot

### 1.3 Debian Installation

Boot from the SD card/USB and follow the installer:

1. Select **"Install"** (not graphical)
2. Language/Region: your preferences
3. **Network configuration**: select your WiFi network (WLAN) and connect — internet access during install is required for the netinst ISO to fetch packages and will be used to install the RTL8125 driver afterward
4. Hostname: `nuc-forms` (or your choice)
5. Domain: leave blank
6. Root password: set a strong password
7. Create user: `admin`
8. Partitioning: **Guided — use entire disk** (LVM recommended) — this wipes any existing OS
9. Software selection:
   - ✅ **SSH server**
   - ✅ **standard system utilities**
   - ❌ No desktop environment
10. Allow install to complete and reboot into Debian

### 1.4 Install RTL8125 Ethernet Driver

The NUC 14 N150 uses a Realtek RTL8125BG-CG 2.5GbE controller. Debian loads the wrong driver (`r8169`) by default — you will see `enp1s0` either missing or DOWN until the correct driver is installed.

**At first boot, WiFi (wlo1) should be up from the install.** Use it now to install the correct driver:

```bash
# Confirm WiFi is up and has internet:
ip addr show
ping -c 3 8.8.8.8
```

Fix the apt sources — the installer may have configured apt to use the install media (cdrom), which will cause errors. Edit sources.list:

```bash
nano /etc/apt/sources.list
```

Replace all contents with:

```
deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware
deb http://security.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware
deb http://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware
```

Install build dependencies and the RTL8125 driver:

```bash
apt update
apt install -y dkms build-essential git
git clone https://github.com/awesometic/realtek-r8125-dkms.git
cd realtek-r8125-dkms
./dkms-install.sh
```

Blacklist the incorrect `r8169` driver (required — without this it overrides r8125 on reboot):

```bash
echo 'blacklist r8169' > /etc/modprobe.d/blacklist-r8169.conf
update-initramfs -u
```

Reboot:

```bash
reboot
```

**After reboot**, verify Ethernet is up:

```bash
ip link show
# Should show enp1s0 with state UP

ip addr show enp1s0
# Should show an inet address from DHCP (e.g. 192.168.1.x)

ping -c 3 8.8.8.8
# Should succeed via Ethernet
```

If `enp1s0` is DOWN, bring it up manually:

```bash
dhclient enp1s0
```

Once Ethernet is confirmed working:
1. Go into BIOS → **Onboard Devices** → **Disable WLAN** (re-enable it only if needed temporarily; it should be off permanently on the production server)
2. Reboot and confirm `ping -c 3 8.8.8.8` still works via Ethernet only

> **Interface name**: The Ethernet interface on this NUC is `enp1s0`. If yours differs, substitute accordingly throughout this guide.

---

## Phase 2: System Configuration

Run these commands on the NUC (connect via monitor+keyboard initially, then SSH once network is stable).

### 2.1 System Update and Package Installation

```bash
sudo apt update && sudo apt upgrade -y

sudo apt install -y \
    docker.io \
    docker-compose \
    git \
    curl \
    wget \
    vim \
    htop \
    rsync \
    rclone \
    net-tools \
    dnsutils \
    openssl \
    ca-certificates \
    rfkill \
    ufw \
    fail2ban \
    logrotate \
    unattended-upgrades \
    smartmontools

sudo systemctl enable docker
sudo usermod -aG docker admin
# Log out and back in for docker group to take effect
```

### 2.2 Static IP Configuration

Debian 12 (server install) uses `/etc/network/interfaces`. Find your Ethernet interface name first:

```bash
ip link show
# Look for enp4s0, eno1, eth0, or similar (not lo or wlo1)
```

Edit the network config (replace `enp4s0` with your actual interface name):

```bash
sudo nano /etc/network/interfaces
```

Replace the entire contents with:

```
# Loopback
auto lo
iface lo inet loopback

# Ethernet — static IP
auto enp4s0
iface enp4s0 inet static
    address 192.168.1.50
    netmask 255.255.255.0
    gateway 192.168.1.1
    dns-nameservers 8.8.8.8 8.8.4.4
```

Apply and verify:

```bash
sudo systemctl restart networking
ip addr show enp4s0
ping -c 3 8.8.8.8
```

### 2.3 Disable Wi-Fi Permanently

```bash
sudo rfkill block wifi

# Make persistent across reboots
echo "blacklist iwlwifi" | sudo tee /etc/modprobe.d/blacklist-wifi.conf
```

### 2.4 Firewall (UFW)

Initial firewall setup — WireGuard-specific rules are added in section 2.5.6 after WireGuard is configured.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH: local LAN only for now (WireGuard VPN rule added in 2.5.6)
sudo ufw allow from 192.168.1.0/24 to any port 22 comment 'Local network SSH'

# HTTP/HTTPS for Caddy
sudo ufw allow 80/tcp comment 'HTTP (Caddy)'
sudo ufw allow 443/tcp comment 'HTTPS (Caddy)'

sudo ufw --force enable
sudo ufw status
```

### 2.5 WireGuard Setup (Remote Access)

WireGuard is a modern, audited VPN with a minimal attack surface. Port 51820 UDP is forwarded on the router — port 22 is never exposed publicly.

#### 2.5.1 Install WireGuard on the NUC

```bash
sudo apt install -y wireguard
```

#### 2.5.2 Generate NUC Key Pair

```bash
cd /etc/wireguard
umask 077
wg genkey | sudo tee nuc_private.key | wg pubkey | sudo tee nuc_public.key
sudo cat nuc_public.key   # copy this — you'll need it for the Mac peer config
```

#### 2.5.3 Generate Mac Key Pair (on your Mac)

```bash
# Install WireGuard on Mac:
brew install wireguard-tools

mkdir -p ~/.config/wireguard
cd ~/.config/wireguard
wg genkey | tee mac_private.key | wg pubkey | tee mac_public.key
cat mac_public.key   # copy this — you'll need it for the NUC server config
```

#### 2.5.4 Create NUC Server Config

```bash
sudo nano /etc/wireguard/wg0.conf
```

```ini
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = <contents of /etc/wireguard/nuc_private.key>

# Save and restore iptables rules for routing
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o enp4s0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o enp4s0 -j MASQUERADE

[Peer]
# Mac
PublicKey = <contents of mac_public.key>
AllowedIPs = 10.8.0.2/32
```

> Replace `enp4s0` with your actual Ethernet interface name (`ip link show`).

```bash
sudo chmod 600 /etc/wireguard/wg0.conf
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
```

#### 2.5.5 Create Mac Peer Config

```bash
nano ~/.config/wireguard/wg0.conf
```

```ini
[Interface]
Address = 10.8.0.2/32
PrivateKey = <contents of ~/.config/wireguard/mac_private.key>
DNS = 8.8.8.8

[Peer]
# NUC
PublicKey = <contents of /etc/wireguard/nuc_public.key>
Endpoint = <YOUR-PUBLIC-IP-OR-DOMAIN>:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
```

> `AllowedIPs = 10.8.0.0/24` routes only VPN traffic through the tunnel (split tunnel — your normal internet traffic is unaffected).

```bash
# Bring up the tunnel on your Mac:
sudo wg-quick up ~/.config/wireguard/wg0.conf

# Verify handshake:
sudo wg show
# Should show: latest handshake: X seconds ago

# SSH to NUC via VPN:
ssh admin@10.8.0.1
```

#### 2.5.6 Update UFW for WireGuard

On the NUC, update the firewall to allow WireGuard and restrict SSH to the VPN subnet:

```bash
# Allow WireGuard port (public-facing)
sudo ufw allow 51820/udp comment 'WireGuard VPN'

# Restrict SSH to VPN subnet and local LAN only (remove any broader SSH rule)
sudo ufw delete allow from 100.64.0.0/10 to any port 22 2>/dev/null || true
sudo ufw allow from 10.8.0.0/24 to any port 22 comment 'WireGuard VPN SSH'
sudo ufw allow from 192.168.1.0/24 to any port 22 comment 'Local network SSH'

sudo ufw reload
sudo ufw status
```

#### 2.5.7 Add WireGuard Port Forwarding on Router

In the Verizon CR1000A:
- Add a third port forwarding rule: Port **51820** (UDP) → `192.168.1.50:51820`

Your complete forwarding table should be:

| Service | External Port | Internal IP | Protocol |
|---|---|---|---|
| HTTP | 80 | 192.168.1.50 | TCP |
| HTTPS | 443 | 192.168.1.50 | TCP |
| WireGuard | 51820 | 192.168.1.50 | **UDP** |

> Port 22 is **never** forwarded.

### 2.6 Automatic Security Updates

```bash
sudo dpkg-reconfigure --priority=low unattended-upgrades
# Select "Yes" to enable automatic security updates
```

### 2.8 Prevent Sleep / Suspend

Debian's `systemd` will attempt to suspend the system on inactivity by default. This must be disabled on a headless production server.

```bash
# Mask all sleep/suspend targets permanently:
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# Verify:
sudo systemctl status sleep.target
# Should show: Loaded: masked
```

Also configure `logind` to ignore idle and lid events:

```bash
sudo nano /etc/systemd/logind.conf
```

Set or uncomment these lines:

```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
IdleAction=ignore
IdleActionSec=0
```

Apply without rebooting:

```bash
sudo systemctl restart systemd-logind
```

Verify the system will not sleep:

```bash
systemd-inhibit --list
# Confirm no sleep inhibitors are missing
sudo systemctl is-enabled sleep.target
# Should return: masked
```

---

### 2.7 UPS Integration (CyberPower GX1500U)

#### Physical Connection

The CyberPower GX1500U communicates with the host via USB HID. Use a standard **USB-A to USB-B cable** (the same type as a printer cable — not included with the UPS, but common).

Connect it as follows:
- **UPS end**: USB-B port on the back panel of the GX1500U (labeled "USB" or with a USB icon, near the data port cluster)
- **NUC end**: **rear USB 2.0 Type-A port** (the single USB 2.0 port on the NUC's back panel — distinct from the four USB 3.2 Gen 2 Type-A ports)

> The rear USB 2.0 port is correct and sufficient — UPS HID communication uses negligible bandwidth. Using a USB 3.2 port works too, but the 2.0 port is the natural fit and keeps the faster ports free.

Also connect power:
- NUC power brick → GX1500U **battery-backed + surge** outlet (not a surge-only outlet)
- Router and modem → GX1500U **battery-backed + surge** outlets

#### Software Installation

PowerPanel Personal is **not in apt repos** — download the `.deb` directly from CyberPower:

```
https://www.cyberpower.com/global/en/product/sku/powerpanel_personal_for_linux
```

Download on your Mac and transfer to the NUC via SCP (WireGuard must be up):

```bash
# On your Mac:
scp ~/Downloads/powerpanel-*.deb admin@10.8.0.1:/tmp/
```

Install on the NUC:

```bash
sudo dpkg -i /tmp/powerpanel-*.deb
```

#### Verify USB Detection

Before starting the service, confirm the NUC sees the UPS over USB:

```bash
lsusb
# Look for a line like:
# Bus 001 Device 002: ID 0764:0501 Cyber Power System, Inc. CP1500 AVR UPS
```

If the UPS does not appear, check the USB-B cable is firmly seated at both ends and try a different cable.

#### Start and Enable the Service

```bash
sudo systemctl enable pwrstatd
sudo systemctl start pwrstatd

# Verify it's running:
sudo systemctl status pwrstatd

# Check UPS status:
sudo pwrstat -status
```

Expected output from `pwrstat -status`:
```
The UPS information shows as following:

        Properties:
                Model Name................... GX1500U
                Firmware Number.............. ...
                Rating Voltage............... 120 V
                Rating Power................. 900 Watt

        Current UPS status:
                State........................ Normal
                Power Supply by.............. Utility Power
                Utility Voltage.............. 120 V
                Output Voltage............... 120 V
                Battery Capacity............. 100 %
                Remaining Runtime............ 60 min.
                Load......................... XX Watt(XX %)
```

If `State` shows `Normal` and `Power Supply by` shows `Utility Power`, the UPS is communicating correctly.

#### Configure Auto-Shutdown

Edit the PowerPanel daemon config:

```bash
sudo nano /etc/pwrstatd.conf
```

Recommended settings for a headless production server:

```ini
# Shut down when battery drops to 20% remaining
LowBattThreshold = 20

# Wait 60 seconds before initiating shutdown (allows in-flight writes to complete)
ShutdownDelay = 60

# Also shut down if runtime drops below 5 minutes regardless of battery %
LowRuntimeThreshold = 5

# Enable low battery shutdown
EnableLowBattShutdown = yes

# Enable low runtime shutdown
EnableLowRuntimeShutdown = yes

# Command to run before shutdown (optional — flushes Docker logs)
ShutdownCmd = "docker-compose -f /home/admin/radio-forms-portal/docker-compose.yml stop"
```

Apply the config:

```bash
sudo systemctl restart pwrstatd
sudo pwrstat -status   # confirm still communicating
```

#### Test the UPS

To verify auto-shutdown works without actually cutting power, simulate a power failure:

```bash
# Simulate power failure event (does NOT actually shut down — just tests the trigger):
sudo pwrstat -test

# Watch the log:
sudo tail -f /var/log/pwrstatd.log
```

To do a full live test (optional, do this during a maintenance window):
1. Confirm `pwrstat -status` shows 100% battery
2. Unplug the GX1500U from the wall
3. Confirm the NUC stays running on battery
4. Plug the wall power back in before battery hits 20%
5. Confirm `pwrstat -status` returns to `Utility Power`

---

## Phase 3: Router Configuration (Verizon CR1000A)

### 3.1 Power Cycle Router First

The CR1000A has a known NAT table corruption issue. Before adding port forwarding rules:
1. Unplug the router power cable
2. Wait **30 seconds** (capacitors must discharge)
3. Plug back in, wait for full boot (~2 minutes)

### 3.2 Port Forwarding

Log into router at http://192.168.1.1:
- Navigate to **Firewall → Port Forwarding** (or **Advanced → NAT**)
- Add three rules:
  - Port **80** (TCP) → `192.168.1.50:80`
  - Port **443** (TCP) → `192.168.1.50:443`
  - Port **51820** (UDP) → `192.168.1.50:51820` ← WireGuard
- **Do NOT forward port 22** (SSH is only accessible through the WireGuard VPN)

### 3.3 Verify Public IP

```bash
curl ifconfig.me
```

Note this IP — you'll need it for DNS configuration.

---

## Phase 4: Application Deployment

### 4.1 Clone Repository

At this point WireGuard should be running. Connect from your Mac:
```bash
sudo wg-quick up ~/.config/wireguard/wg0.conf
ssh admin@10.8.0.1
```

On the NUC:
```bash
cd /home/admin
git clone https://github.com/your-org/radio-forms-portal.git
cd radio-forms-portal
```

### 4.2 Create Production `.env`

```bash
cp .env.example .env
nano .env
```

Required values to set:
```bash
# Domains
SPA_DOMAIN=forms.your-domain.com
API_DOMAIN=api.forms.your-domain.com
EMAIL=admin@your-domain.com
FORMIO_DOMAIN=https://api.forms.your-domain.com
FORMIO_HOST=api.forms.your-domain.com
FORMIO_ALLOWED_ORIGINS=https://forms.your-domain.com

# Secrets (generate with: openssl rand -base64 32)
ROOT_EMAIL=admin@your-domain.com
ROOT_PASSWORD=<strong-password>
JWT_SECRET=<generated>
MONGO_SECRET=<generated>
API_KEYS=<generated>
PROD_FORMIO_DOMAIN=https://api.forms.your-domain.com
PROD_API_KEYS=<same-as-API_KEYS>

# Database
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=<strong-password>
MONGO_DB_NAME=formio

# AWS S3 Backups (explicit keys required — no IAM role on NUC)
BACKUPS_S3_BACKUP_BUCKET=radio-forms-backups-ACCOUNTID-production
BACKUPS_AWS_DEFAULT_REGION=us-east-1
BACKUPS_AWS_ACCESS_KEY_ID=<your-key-id>
BACKUPS_AWS_SECRET_ACCESS_KEY=<your-secret-key>

# Deployment target (used by deploy-production.sh)
PROD_SERVER=10.8.0.1        # NUC's WireGuard VPN IP
PROD_USER=admin
PROD_APP_DIR=/home/admin/radio-forms-portal
PROD_BACKUP_DIR=/home/admin/backups
```

### 4.3 Create Production `Caddyfile`

This file is **excluded from the deployment tarball** and must be created manually on the NUC. It is never overwritten by deployments.

```bash
nano /home/admin/radio-forms-portal/Caddyfile
```

```caddyfile
{
    email admin@your-domain.com
}

forms.your-domain.com {
    root * /var/www/html
    encode gzip
    file_server
    try_files {path} /index.html
    log {
        output file /var/log/caddy/spa_access.log
        format json
    }
}

api.forms.your-domain.com {
    reverse_proxy formio:3001 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    log {
        output file /var/log/caddy/api_access.log
        format json
    }
}
```

### 4.4 Initial Bootstrap

For the very first deployment, run the setup script rather than the deploy script:

```bash
chmod +x scripts/*.sh scripts/lib/*.sh
./scripts/setup-environment.sh production
```

This bootstraps the Form.io database with the default template (forms, resources, roles, actions).

### 4.5 Subsequent Deployments

All future code deployments from your Mac use the standard workflow with NUC overrides:

```bash
# On your Mac — ensure WireGuard is up first:
sudo wg-quick up ~/.config/wireguard/wg0.conf

export PROD_SERVER="10.8.0.1"    # NUC WireGuard VPN IP
./scripts/deploy-production.sh /path/to/your-ssh-key
```

See `.windsurf/workflows/deploy-nuc.md` for the full workflow.

---

## Phase 5: Data Migration from EC2

If migrating existing production data from EC2 to the NUC:

### 5.1 Export from EC2

```bash
# On EC2 (via SSH):
source .env
docker exec mongo mongodump \
    --uri="mongodb://admin:${MONGO_ROOT_PASSWORD}@localhost:27017/?authSource=admin" \
    --archive=/tmp/migration-$(date +%Y%m%d).archive.gz \
    --gzip

# Copy to your Mac:
scp -i ~/.ssh/your-key.pem admin@<EC2-IP>:/tmp/migration-*.archive.gz ~/Desktop/
```

### 5.2 Transfer to NUC

```bash
# From your Mac to NUC via WireGuard:
sudo wg-quick up ~/.config/wireguard/wg0.conf
scp ~/Desktop/migration-*.archive.gz admin@10.8.0.1:/tmp/
```

### 5.3 Import on NUC

```bash
# On NUC — stop Form.io first to prevent writes during import:
cd /home/admin/radio-forms-portal
docker-compose stop formio

# Copy archive into mongo container and restore:
docker cp /tmp/migration-*.archive.gz mongo:/tmp/migration.archive.gz
docker exec mongo mongorestore \
    --uri="mongodb://admin:${MONGO_ROOT_PASSWORD}@localhost:27017/?authSource=admin" \
    --archive=/tmp/migration.archive.gz \
    --gzip \
    --drop

# Restart Form.io:
docker-compose start formio

# Run post-bootstrap to re-resolve dynamic IDs for the new environment:
docker exec formio node /app/post-bootstrap.js
```

### 5.4 Verify Migration

```bash
# Check submission counts match EC2:
docker exec mongo mongosh formio --eval "db.submissions.countDocuments()"
docker exec mongo mongosh formio --eval "db.forms.countDocuments()"
```

---

## Phase 6: Backup Configuration

### 6.1 S3 Backup (Existing — Works on NUC with Explicit Credentials)

The existing `mongo-backup` Docker container handles S3 backups. On NUC, unlike EC2, there is no IAM role — ensure `BACKUPS_AWS_ACCESS_KEY_ID` and `BACKUPS_AWS_SECRET_ACCESS_KEY` are set in `.env`.

The backup container runs on the schedule defined in `deployment/mongo-backup/crontab.txt`.

### 6.2 Local USB Backup (NUC-Specific Addition)

Connect an external USB drive to the NUC:

```bash
# Find the USB drive device
lsblk
# e.g., /dev/sdb

# Create mount point and mount
sudo mkdir -p /mnt/usb-backup
sudo mount /dev/sdb1 /mnt/usb-backup

# Make persistent across reboots (add to /etc/fstab):
echo "UUID=$(blkid -s UUID -o value /dev/sdb1) /mnt/usb-backup ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
```

Install the local backup script:

```bash
sudo cp /home/admin/radio-forms-portal/deployment/nuc-local-backup.sh /usr/local/bin/nuc-local-backup.sh
sudo chmod +x /usr/local/bin/nuc-local-backup.sh
```

Set up daily cron job (runs at 2 AM):

```bash
sudo crontab -e
# Add:
0 2 * * * /usr/local/bin/nuc-local-backup.sh >> /var/log/nuc-mongo-backup.log 2>&1
```

---

## Phase 7: DNS Cutover

### 7.1 Static vs Dynamic IP

Check if your ISP provides a static public IP:
```bash
# Record current IP:
curl ifconfig.me

# Unplug modem for 5 minutes, then check again.
# If IP changed → dynamic IP → set up DDNS (see 7.2).
# If IP unchanged → likely static → proceed to 7.3.
```

### 7.2 DDNS Setup (Dynamic IP Only)

Install `ddclient` for automatic DNS updates:

```bash
sudo apt install -y ddclient
sudo nano /etc/ddclient.conf
```

Example for Route 53 (using `aws` protocol):
```
protocol=route53
zone=your-domain.com
ttl=60
login=<AWS_ACCESS_KEY_ID>
password=<AWS_SECRET_ACCESS_KEY>
forms.your-domain.com, api.forms.your-domain.com
```

```bash
sudo systemctl enable ddclient
sudo systemctl start ddclient
```

### 7.3 Update DNS Records (Route 53)

In AWS Route 53, update A records:
```
forms.your-domain.com       → <NUC public IP>
api.forms.your-domain.com   → <NUC public IP>
```

Set TTL to 60 seconds before cutover to allow fast rollback.

### 7.4 Verify DNS Propagation

```bash
# From your Mac (with /etc/hosts entries removed):
dig forms.your-domain.com
nslookup forms.your-domain.com 8.8.8.8
curl -I https://forms.your-domain.com
```

---

## Phase 8: EC2 Backup/Failover Setup

After NUC is confirmed stable:

1. **Downsize EC2** to `t3.small` (~$15/month) to reduce costs while keeping it available
2. **Keep EC2 `.env`** current — update if you change secrets
3. **Rollback procedure** (if NUC fails):
   ```bash
   # On your Mac — point deploy at EC2:
   export PROD_SERVER="<EC2-Elastic-IP>"
   ./scripts/deploy-production.sh ~/.ssh/your-key.pem

   # Update DNS back to EC2 Elastic IP in Route 53
   ```

---

## Troubleshooting

### RTL8125 Driver Missing (Ethernet Not Detected)

If `ip link show` shows no Ethernet interface after installation:

```bash
# Check if hardware is detected:
lspci | grep -i ethernet
# Should show: Realtek Semiconductor RTL8125 2.5GbE Controller

# If hardware detected but no interface, install driver:
sudo apt install -y dkms build-essential linux-headers-$(uname -r)
git clone https://github.com/awesometic/realtek-r8125-dkms.git
cd realtek-r8125-dkms
sudo ./dkms-install.sh

# Blacklist conflicting driver:
echo "blacklist r8169" | sudo tee /etc/modprobe.d/blacklist-r8169.conf
sudo update-initramfs -u
sudo reboot
```

**If you can't get online to run the above** (no WiFi, no Ethernet): reinstall Debian using the DVD-1 ISO — it includes the build toolchain and driver support offline.

### CR1000A NAT Conflict Error

If you see "IP conflicts between this rule and previous NAT/NAPT rules":
1. Power cycle the router (unplug 30 seconds — not just restart)
2. Check for hidden UPnP mappings: **Advanced → UPnP** → disable temporarily
3. Check for DMZ settings pointing to 192.168.1.50 — disable if present

### Caddy Certificate Failure

```bash
docker-compose logs caddy | grep -i "error\|acme\|certificate"
```

Common causes:
- DNS not yet propagated to NUC public IP (wait up to 24h after Route 53 change)
- Port 80 not reachable from internet (ACME HTTP-01 challenge requires port 80)
- Test port 80 reachability: `curl http://forms.your-domain.com` from outside the local network

### Local Access (NAT Hairpinning)

When on the local network, you cannot access `forms.your-domain.com` via the public IP due to Verizon CR1000A NAT loopback limitations. Add to `/etc/hosts` on your Mac:

```
192.168.1.50  forms.your-domain.com
192.168.1.50  api.forms.your-domain.com
```

Remove these entries when testing from outside the local network.

### post-bootstrap Fails After Deploy

```bash
# Check the log:
tail -100 /home/admin/radio-forms-portal/logs/post-bootstrap.log

# Common cause: Form.io container not yet healthy
# Wait 30 seconds and re-run manually:
docker exec formio node /app/post-bootstrap.js 2>&1 | tee -a logs/post-bootstrap.log
```

---

## Related

- `.windsurf/workflows/deploy-nuc.md` — Ongoing deployment workflow
- `.windsurf/workflows/deploy-production-formio.md` — Promote Form.io schema changes
- `deployment/nuc-setup.sh` — Automated system setup script (installs WireGuard)
- `deployment/nuc-local-backup.sh` — Local USB backup script
- `docs/DEPLOYMENT.md` — General deployment documentation
- `docs/INFRASTRUCTURE.md` — AWS EC2 infrastructure (backup/failover)
